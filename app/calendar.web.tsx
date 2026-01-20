// app/calendar.web.tsx
import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "../src/context/ThemeContext";
import { useMissions } from "../src/hooks/useMissions";

import { db } from "../src/firebase/firebase.web";
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from "firebase/firestore";

import { auth } from "../src/firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useFamily } from "../src/hooks/useFamily";

/* ----------------------- Helpers ----------------------- */

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysInMonth(date: Date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.getDate();
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayLong(date: Date) {
  return date.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const WEEK_LABELS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

function normalizeDueDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function toSafeDate(v: any): Date | null {
  if (!v) return null;
  const d = v?.toDate?.() ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// 🔑 klucz daty (RRRR-MM-DD) – spójny z index.tsx
function formatDateKey(date: Date) {
  const d0 = startOfDay(date);
  const y = d0.getFullYear();
  const m = String(d0.getMonth() + 1).padStart(2, "0");
  const d = String(d0.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// czy misja „występuje” w danym dniu (cykliczność + archived + skipDates)
function missionOccursOnDay(m: any, day: Date): boolean {
  const dueRaw = normalizeDueDate(m.dueDate);
  if (!dueRaw) return false;

  if (m.archived) return false;

  const day0 = startOfDay(day);
  const due0 = startOfDay(dueRaw);

  const dateKey = formatDateKey(day0);
  if (Array.isArray(m.skipDates) && m.skipDates.includes(dateKey)) {
    return false;
  }

  const repeat = m.repeat?.type ?? "none";

  if (repeat === "none") return isSameDay(due0, day0);

  // start serii dopiero od dueDate (bez bugów przez godziny)
  if (due0.getTime() > day0.getTime()) return false;

  if (repeat === "daily") return true;
  if (repeat === "weekly") return day0.getDay() === due0.getDay();
  if (repeat === "monthly") return day0.getDate() === due0.getDate();

  return false;
}

// ✅ wykrywanie wykonania per dzień (dla cyklicznych)
function isMissionDoneOnDate(m: any, date: Date) {
  const repeat = m?.repeat?.type ?? "none";
  const dateKey = formatDateKey(date);

  if (repeat !== "none") {
    if (Array.isArray(m.completedDates) && m.completedDates.includes(dateKey)) {
      return true;
    }

    const completedAt = toSafeDate(m.completedAt);
    if (completedAt && isSameDay(completedAt, date)) return true;

    return false;
  }

  return !!m.completed;
}

function clamp01(v: number) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function initialsFromName(name?: string | null) {
  const s = String(name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : parts[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

/* ----------------------- Screen ----------------------- */

export default function CalendarScreen() {
  const { colors } = useThemeColors();
  const { missions, loading } = useMissions();

  const family = useFamily() as any;
  const members = family?.members ?? [];
  const familyIdFromHook =
    family?.familyId ??
    family?.family?.id ??
    family?.family?.familyId ??
    family?.familyDocId ??
    family?.id ??
    null;

  const { width } = useWindowDimensions();
  const isPhone = width < 480;
  const isTablet = width >= 480 && width < 980;
  const isWide = width >= 980;

  const pagePadding = isPhone ? 12 : isTablet ? 16 : 24;
  const daySize = isPhone ? 34 : 30;

  // ✅ badge pod datą – skalowanie + iOS Safari friendly
  const badgeH = isPhone ? 16 : 14;
  const badgeMinW = isPhone ? 20 : 18;
  const badgeFont = isPhone ? 10 : 9;

  const currentUser = auth.currentUser;
  const myUid = currentUser?.uid ?? null;
  const myId = myUid ? String(myUid) : null;

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));

  const [deletedMissions, setDeletedMissions] = useState<any[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [deletedError, setDeletedError] = useState<string | null>(null);

  const orbBlur = Platform.OS === "web" ? ({ filter: "blur(48px)" } as any) : null;

  const cardShadow = useMemo(() => {
    if (Platform.OS === "web") {
      return { boxShadow: "0 10px 30px rgba(0,0,0,0.10)" } as any;
    }
    return {
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
    } as any;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const resolveFamilyId = async (uid: string): Promise<string | null> => {
      if (familyIdFromHook) return String(familyIdFromHook);
      try {
        const userSnap = await getDoc(doc(db, "users", uid));
        if (!userSnap.exists()) return null;
        const fid = (userSnap.data() as any)?.familyId ?? null;
        return fid ? String(fid) : null;
      } catch {
        return null;
      }
    };

    const fetchBucket = async (bucketId: string) => {
      const snap = await getDocs(
        query(
          collection(db, "deleted_missions", bucketId, "deleted_missions"),
          orderBy("deletedAt", "desc"),
          limit(200)
        )
      );

      return snap.docs.map((d) => ({
        id: d.id,
        __path: d.ref.path,
        ...(d.data() as any),
      }));
    };

    const loadDeleted = async (uid: string) => {
      try {
        setDeletedError(null);
        setDeletedLoading(true);

        const fid = await resolveFamilyId(uid);
        const bucketIds = [fid, uid]
          .filter(Boolean)
          .map((x) => String(x))
          .filter((x, idx, arr) => arr.indexOf(x) === idx);

        if (!bucketIds.length) {
          setDeletedMissions([]);
          return;
        }

        const results = await Promise.allSettled(bucketIds.map((b) => fetchBucket(b)));
        if (cancelled) return;

        const ok = results
          .filter((r) => r.status === "fulfilled")
          .flatMap((r: any) => r.value as any[]);

        const denied = results
          .filter((r) => r.status === "rejected")
          .map((r: any) => r.reason)
          .filter(Boolean);

        if (ok.length > 0) {
          const map = new Map<string, any>();
          ok.forEach((m) => map.set(String(m.__path || m.id), m));

          const arr = Array.from(map.values()).sort((a, b) => {
            const ta = a?.deletedAt?.toMillis?.()
              ? a.deletedAt.toMillis()
              : new Date(a?.deletedAt ?? 0).getTime();
            const tb = b?.deletedAt?.toMillis?.()
              ? b.deletedAt.toMillis()
              : new Date(b?.deletedAt ?? 0).getTime();
            return tb - ta;
          });

          setDeletedMissions(arr);
          setDeletedError(null);
          return;
        }

        const firstErr = denied[0];
        const code = String(firstErr?.code || "");

        if (code.includes("permission-denied") || code.includes("unauthenticated")) {
          setDeletedError("Brak uprawnień do odczytu usuniętych zadań (Firestore rules).");
        } else if (code.includes("failed-precondition")) {
          setDeletedError("Brak wymaganego indeksu dla zapytania (orderBy).");
        } else if (denied.length) {
          setDeletedError("Nie udało się wczytać usuniętych zadań.");
        } else {
          setDeletedError(null);
        }

        setDeletedMissions([]);
        if (firstErr) console.error("Calendar loadDeleted error:", firstErr);
      } finally {
        if (!cancelled) setDeletedLoading(false);
      }
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setDeletedMissions([]);
        setDeletedError(null);
        setDeletedLoading(false);
        return;
      }
      loadDeleted(user.uid);
    });

    if (auth.currentUser?.uid) loadDeleted(auth.currentUser.uid);

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [familyIdFromHook]);

  const isMyTask = useCallback(
    (m: any): boolean => {
      if (!myId) return false;

      const assignedTo = m?.assignedToUserId ? String(m.assignedToUserId) : null;
      const assignedBy = m?.assignedByUserId ? String(m.assignedByUserId) : null;
      const createdBy = m?.createdByUserId ? String(m.createdByUserId) : null;

      if (assignedTo && assignedTo === myId) return true;
      if (!assignedTo && (assignedBy === myId || createdBy === myId)) return true;
      return false;
    },
    [myId]
  );

  const isDelegatedTask = useCallback(
    (m: any): boolean => {
      if (!myId) return false;

      const assignedTo = m?.assignedToUserId ? String(m.assignedToUserId) : null;
      const assignedBy = m?.assignedByUserId ? String(m.assignedByUserId) : null;
      const createdBy = m?.createdByUserId ? String(m.createdByUserId) : null;

      if (!assignedTo) return false;
      if (assignedTo === myId) return false;
      if (assignedBy === myId || createdBy === myId) return true;
      return false;
    },
    [myId]
  );

  const allMissions: any[] = useMemo(() => (Array.isArray(missions) ? missions : []), [missions]);
  const myTasks = useMemo(() => allMissions.filter(isMyTask), [allMissions, isMyTask]);
  const delegatedTasks = useMemo(
    () => allMissions.filter(isDelegatedTask),
    [allMissions, isDelegatedTask]
  );

  const membersById = useMemo(() => {
    const map = new Map<string, any>();
    (members || []).forEach((x: any) => {
      const uid = String(x.uid || x.userId || x.id || "");
      if (uid) map.set(uid, x);
    });
    return map;
  }, [members]);

  const getCreatorMember = (m: any) => {
    const rawId = m?.assignedByUserId || m?.createdByUserId || null;
    const creatorId = rawId ? String(rawId) : null;
    const creatorName = m?.assignedByName || m?.createdByName || null;

    if (!creatorId && !creatorName) return null;

    if (myUid && creatorId && creatorId === String(myUid)) {
      return { id: "self", label: creatorName || "Ty", avatarUrl: currentUser?.photoURL || null };
    }

    if (creatorId && members) {
      const found = membersById.get(creatorId);
      if (found) {
        return {
          id: String(found.uid || found.userId || found.id),
          label: found.displayName || found.username || creatorName || "Bez nazwy",
          avatarUrl: found.avatarUrl || found.photoURL || null,
        };
      }
    }

    if (creatorName) return { id: creatorId || "unknown", label: creatorName, avatarUrl: null };
    return null;
  };

  const getCompletedByLabel = (m: any) => {
    const completedByName = m?.completedByName ? String(m.completedByName) : null;
    const completedByUserId = m?.completedByUserId ? String(m.completedByUserId) : null;

    if (completedByUserId && myId && completedByUserId === myId) return "Ty";
    if (completedByName) return completedByName;

    if (completedByUserId) {
      const found = membersById.get(completedByUserId);
      if (found) return found.displayName || found.username || "Nieznane";
    }

    const assignedToId = m?.assignedToUserId ? String(m.assignedToUserId) : null;
    if (assignedToId && myId && assignedToId === myId) return "Ty";
    if (m?.assignedToName) return String(m.assignedToName);

    if (assignedToId) {
      const found = membersById.get(assignedToId);
      if (found) return found.displayName || found.username || "Nieznane";
    }

    return "Nieznane";
  };

  const daysGrid = useMemo(() => {
    const first = startOfMonth(currentMonth);
    const firstWeekday = first.getDay(); // 0 = Nd, 1 = Pn...
    const offset = firstWeekday === 0 ? 6 : firstWeekday - 1;

    const totalDays = daysInMonth(currentMonth);

    const days: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) days.push(null);

    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(currentMonth);
      date.setDate(d);
      days.push(startOfDay(date));
    }

    return days;
  }, [currentMonth]);

  const today = useMemo(() => startOfDay(new Date()), []);

  type DayStats = { total: number; done: number };

  const monthStatsByKey = useMemo(() => {
    const map = new Map<string, DayStats>();

    const bump = (key: string, done: boolean) => {
      const cur = map.get(key) ?? ({ total: 0, done: 0 } as DayStats);
      cur.total += 1;
      if (done) cur.done += 1;
      map.set(key, cur);
    };

    const days = daysGrid.filter(Boolean) as Date[];
    if (!days.length) return map;

    const hasAny = (myTasks?.length ?? 0) + (delegatedTasks?.length ?? 0);
    if (!hasAny) return map;

    for (const day of days) {
      const key = formatDateKey(day);

      if (myTasks?.length) {
        for (const m of myTasks) {
          if (!missionOccursOnDay(m, day)) continue;
          bump(key, isMissionDoneOnDate(m, day));
        }
      }

      if (delegatedTasks?.length) {
        for (const m of delegatedTasks) {
          if (!missionOccursOnDay(m, day)) continue;
          bump(key, isMissionDoneOnDate(m, day));
        }
      }
    }

    return map;
  }, [daysGrid, myTasks, delegatedTasks]);

  const myMissionsForSelectedDay = useMemo(() => {
    if (!myTasks?.length) return [];
    return myTasks.filter((m: any) => missionOccursOnDay(m, selectedDate));
  }, [myTasks, selectedDate]);

  const myPendingMissions = useMemo(
    () => myMissionsForSelectedDay.filter((m: any) => !isMissionDoneOnDate(m, selectedDate)),
    [myMissionsForSelectedDay, selectedDate]
  );

  const myCompletedMissions = useMemo(
    () => myMissionsForSelectedDay.filter((m: any) => isMissionDoneOnDate(m, selectedDate)),
    [myMissionsForSelectedDay, selectedDate]
  );

  const delegatedForSelectedDay = useMemo(() => {
    if (!delegatedTasks?.length) return [];
    return delegatedTasks.filter((m: any) => missionOccursOnDay(m, selectedDate));
  }, [delegatedTasks, selectedDate]);

  const delegatedPending = useMemo(
    () => delegatedForSelectedDay.filter((m: any) => !isMissionDoneOnDate(m, selectedDate)),
    [delegatedForSelectedDay, selectedDate]
  );

  const delegatedCompleted = useMemo(
    () => delegatedForSelectedDay.filter((m: any) => isMissionDoneOnDate(m, selectedDate)),
    [delegatedForSelectedDay, selectedDate]
  );

  const deletedForSelectedDay = useMemo(() => {
    if (!deletedMissions?.length) return [];
    return deletedMissions.filter((m: any) => {
      const involved = isMyTask(m) || isDelegatedTask(m);
      if (!involved) return false;
      return missionOccursOnDay(m, selectedDate);
    });
  }, [deletedMissions, selectedDate, isMyTask, isDelegatedTask]);

  const selectedKey = useMemo(() => formatDateKey(selectedDate), [selectedDate]);
  const selectedStats = useMemo(
    () => monthStatsByKey.get(selectedKey) || null,
    [monthStatsByKey, selectedKey]
  );

  const dayTotal =
    selectedStats?.total ?? myMissionsForSelectedDay.length + delegatedForSelectedDay.length;
  const dayDone = selectedStats?.done ?? myCompletedMissions.length + delegatedCompleted.length;
  const dayOpen = Math.max(0, dayTotal - dayDone);
  const dayProgress = clamp01(dayTotal > 0 ? dayDone / dayTotal : 0);
  const progressLabel = dayTotal > 0 ? `${Math.round(dayProgress * 100)}%` : "—";

  const AvatarBubble = ({
    label,
    avatarUrl,
    size,
    borderColor,
  }: {
    label: string;
    avatarUrl?: string | null;
    size: number;
    borderColor: string;
  }) => {
    const r = size / 2;
    const initials = initialsFromName(label);
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: r,
          borderWidth: 1,
          borderColor,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: size, height: size }}
            resizeMode="cover"
          />
        ) : (
          <Text
            style={{
              color: colors.text,
              fontWeight: "900",
              fontSize: Math.max(10, size * 0.36),
            }}
          >
            {initials}
          </Text>
        )}
      </View>
    );
  };

  // ✅ IKONKA OBOK CYFRY (kompaktowo)
  const StatMini = ({
    icon,
    value,
    label,
    tint,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    value: number;
    label: string;
    tint?: string;
  }) => {
    return (
      <View
        style={[
          styles.statMiniCompact,
          { borderColor: colors.border, backgroundColor: colors.bg },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name={icon} size={15} color={tint || colors.textMuted} />
          <Text
            style={{
              color: colors.text,
              fontWeight: "900",
              fontSize: 16,
              marginLeft: 8,
            }}
          >
            {value}
          </Text>
        </View>

        <Text
          style={{
            color: colors.textMuted,
            fontWeight: "900",
            fontSize: 10,
            marginTop: 2,
          }}
        >
          {label}
        </Text>
      </View>
    );
  };

  const SectionHeader = ({
    title,
    subtitle,
    right,
    icon,
  }: {
    title: string;
    subtitle: string;
    right?: React.ReactNode;
    icon?: keyof typeof Ionicons.glyphMap;
  }) => {
    return (
      <View style={styles.cardHeaderRow}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {!!icon && (
              <View
                style={[
                  styles.iconPill,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                    marginRight: 8,
                  },
                ]}
              >
                <Ionicons name={icon} size={14} color={colors.text} />
              </View>
            )}
            <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
            {subtitle}
          </Text>
        </View>

        <View style={{ marginLeft: 12, alignItems: "flex-end" }}>{right}</View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, position: "relative" }}>
      {/* tło */}
      <View
        style={{
          pointerEvents: "none" as any,
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
        }}
      >
        <View
          style={{
            position: "absolute",
            width: 320,
            height: 320,
            borderRadius: 999,
            backgroundColor: colors.accent + "28",
            top: -150,
            left: -120,
            ...(orbBlur as any),
          }}
        />
        <View
          style={{
            position: "absolute",
            width: 260,
            height: 260,
            borderRadius: 999,
            backgroundColor: "#22c55e22",
            top: -90,
            right: -120,
            ...(orbBlur as any),
          }}
        />
      </View>

      <ScrollView
        style={{ flex: 1, zIndex: 1 }}
        contentContainerStyle={{
          paddingVertical: isPhone ? 12 : 16,
          paddingBottom: 28,
          alignItems: "stretch",
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            width: "100%",
            paddingHorizontal: pagePadding,
            maxWidth: isWide ? 1344 : undefined,
            alignSelf: "center",
          }}
        >
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900" }}>
              Kalendarz domowy
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 13,
                marginTop: 2,
                textTransform: "capitalize",
              }}
            >
              {formatDayLong(selectedDate)}
            </Text>
          </View>

          {/* ✅ Dzień w skrócie — krótszy / zwięzły */}
          <View style={{ marginBottom: 14 }}>
            <View
              style={[
                styles.summaryCardCompact,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  ...(cardShadow as any),
                },
              ]}
            >
              {/* header */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={[
                      styles.iconPill,
                      { borderColor: colors.border, backgroundColor: colors.bg, marginRight: 8 },
                    ]}
                  >
                    <Ionicons name="sparkles-outline" size={14} color={colors.text} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "900" }}>
                    Dzień w skrócie
                  </Text>
                </View>

                <View
                  style={[
                    styles.badgePillSmall,
                    { borderColor: colors.border, backgroundColor: colors.bg },
                  ]}
                >
                  <Ionicons
                    name="pulse-outline"
                    size={13}
                    color={colors.textMuted}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={{ color: colors.textMuted, fontWeight: "900", fontSize: 11 }}>
                    {progressLabel}
                  </Text>
                </View>
              </View>

              {/* 1 linijka info */}
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>
                Wykonane: <Text style={{ color: colors.text, fontWeight: "900" }}>{dayDone}</Text>
                {"  "}•{"  "}
                Otwarte: <Text style={{ color: colors.text, fontWeight: "900" }}>{dayOpen}</Text>
                {"  "}•{"  "}
                Delegowane:{" "}
                <Text style={{ color: colors.text, fontWeight: "900" }}>
                  {delegatedForSelectedDay.length}
                </Text>
              </Text>

              {/* mini staty */}
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10 as any,
                  marginTop: 10,
                }}
              >
                <StatMini
                  icon="checkmark-circle-outline"
                  value={dayDone}
                  label="wykonane"
                  tint="#16a34a"
                />
                <StatMini icon="hourglass-outline" value={dayOpen} label="otwarte" />
                <StatMini
                  icon="people-outline"
                  value={delegatedForSelectedDay.length}
                  label="delegowane"
                />
              </View>

              {loading ? (
                <View style={{ marginTop: 10 }}>
                  <ActivityIndicator size="small" color={colors.accent} />
                </View>
              ) : null}
            </View>
          </View>

          {/* kalendarz */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                marginBottom: 16,
                position: "relative",
                overflow: "hidden",
                ...(cardShadow as any),
              },
            ]}
          >
            <View style={styles.monthHeader}>
              <TouchableOpacity
                onPress={() =>
                  setCurrentMonth((prev) => {
                    const d = new Date(prev);
                    d.setMonth(d.getMonth() - 1);
                    return startOfMonth(d);
                  })
                }
                style={[styles.monthNavBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                accessibilityLabel="Poprzedni miesiąc"
              >
                <Ionicons name="chevron-back" size={18} color={colors.text} />
              </TouchableOpacity>

              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 16,
                    fontWeight: "900",
                    textTransform: "capitalize",
                  }}
                >
                  {currentMonth.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() =>
                  setCurrentMonth((prev) => {
                    const d = new Date(prev);
                    d.setMonth(d.getMonth() + 1);
                    return startOfMonth(d);
                  })
                }
                style={[styles.monthNavBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                accessibilityLabel="Następny miesiąc"
              >
                <Ionicons name="chevron-forward" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekLabelsRow}>
              {WEEK_LABELS.map((label) => (
                <Text
                  key={label}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    color: colors.textMuted,
                    fontSize: 11,
                    fontWeight: "900",
                  }}
                >
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {daysGrid.map((day, idx) => {
                if (!day) return <View key={`empty-${idx}`} style={styles.dayCell} />;

                const isToday = isSameDay(day, today);
                const isSelected = isSameDay(day, selectedDate);

                const key = formatDateKey(day);
                const stats = monthStatsByKey.get(key) || null;

                const doneCount = stats?.done ?? 0;
                const totalCount = stats?.total ?? 0;
                const showBadge = doneCount > 0;

                let bg = "transparent";
                let border = colors.border;
                let textColor = colors.text;

                if (isSelected) {
                  bg = colors.accent;
                  border = colors.accent;
                  textColor = "#022c22";
                } else if (isToday) {
                  bg = colors.accent + "22";
                  border = colors.accent;
                } else if (totalCount > 0) {
                  bg = colors.bg;
                }

                const badgeLabel = doneCount > 99 ? "99+" : String(doneCount);

                return (
                  <TouchableOpacity
                    key={day.toISOString()}
                    onPress={() => setSelectedDate(startOfDay(day))}
                    style={styles.dayCell}
                    activeOpacity={0.85}
                  >
                    <View style={{ alignItems: "center" }}>
                      <View
                        style={{
                          width: daySize,
                          height: daySize,
                          borderRadius: 999,
                          backgroundColor: bg,
                          borderWidth: 1,
                          borderColor: border,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: textColor,
                            fontSize: 13,
                            fontWeight: isSelected ? "900" : "600",
                          }}
                        >
                          {day.getDate()}
                        </Text>
                      </View>

                      {showBadge ? (
                        <View
                          style={{
                            marginTop: 4,
                            minWidth: badgeMinW,
                            height: badgeH,
                            paddingHorizontal: 6,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: "#22c55e66",
                            backgroundColor: "#22c55e22",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: badgeFont,
                              fontWeight: "900",
                              color: "#16a34a",
                              lineHeight: badgeH - 2,
                            }}
                            numberOfLines={1}
                          >
                            {badgeLabel}
                          </Text>
                        </View>
                      ) : (
                        <View style={{ marginTop: 4, height: badgeH }} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* kafelki */}
          <View style={styles.cardsWrap}>
            <View
              style={[
                styles.card,
                styles.responsiveCard,
                { backgroundColor: colors.card, borderColor: colors.border, ...(cardShadow as any) },
              ]}
            >
              <SectionHeader
                icon="person-circle-outline"
                title="Twoje zadania"
                subtitle={formatDayLong(selectedDate)}
                right={
                  loading ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <View
                      style={[
                        styles.badgePill,
                        { borderColor: "#22c55e66", backgroundColor: "#22c55e22" },
                      ]}
                    >
                      <Ionicons name="checkmark" size={14} color="#16a34a" style={{ marginRight: 6 }} />
                      <Text style={{ color: "#16a34a", fontWeight: "900", fontSize: 12 }}>
                        {myCompletedMissions.length}
                      </Text>
                    </View>
                  )
                }
              />

              {loading ? (
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Ładowanie zadań…</Text>
              ) : myMissionsForSelectedDay.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <Ionicons name="leaf-outline" size={18} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: "center" }}>
                    Brak zadań przypisanych do Ciebie w tym dniu.
                  </Text>
                </View>
              ) : (
                <>
                  {myPendingMissions.length > 0 && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "900", marginBottom: 6 }}>
                        Otwarte
                      </Text>

                      {myPendingMissions.map((m: any) => {
                        const creator = getCreatorMember(m);

                        return (
                          <View
                            key={m.id}
                            style={[
                              styles.missionRow,
                              { borderColor: colors.border, backgroundColor: colors.bg },
                            ]}
                          >
                            <View
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: colors.border,
                                marginRight: 10,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ionicons name="ellipse-outline" size={16} color={colors.textMuted} />
                            </View>

                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900" }} numberOfLines={2}>
                                {m.title}
                              </Text>

                              {creator?.label && (
                                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                  Dodane przez: {creator.label}
                                </Text>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {myCompletedMissions.length > 0 && (
                    <View>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "900", marginBottom: 6 }}>
                        Wykonane
                      </Text>

                      {myCompletedMissions.map((m: any) => {
                        const creator = getCreatorMember(m);
                        const doneBy = getCompletedByLabel(m);

                        return (
                          <View
                            key={m.id}
                            style={[
                              styles.missionRow,
                              { borderColor: "#22c55e55", backgroundColor: "#22c55e12" },
                            ]}
                          >
                            <View
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: "#22c55e88",
                                marginRight: 10,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: "#22c55e22",
                              }}
                            >
                              <Ionicons name="checkmark" size={16} color="#16a34a" />
                            </View>

                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900" }} numberOfLines={2}>
                                {m.title}
                              </Text>

                              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                Wykonane przez: {doneBy}
                              </Text>

                              {creator?.label && (
                                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                  Dodane przez: {creator.label}
                                </Text>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </>
              )}
            </View>

            <View
              style={[
                styles.card,
                styles.responsiveCard,
                { backgroundColor: colors.card, borderColor: colors.border, ...(cardShadow as any) },
              ]}
            >
              <SectionHeader
                icon="people-outline"
                title="Zadania przypisane domownikom"
                subtitle={formatDayLong(selectedDate)}
                right={
                  loading ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <View
                      style={[
                        styles.badgePill,
                        { borderColor: "#22c55e66", backgroundColor: "#22c55e22" },
                      ]}
                    >
                      <Ionicons name="checkmark" size={14} color="#16a34a" style={{ marginRight: 6 }} />
                      <Text style={{ color: "#16a34a", fontWeight: "900", fontSize: 12 }}>
                        {delegatedCompleted.length}
                      </Text>
                    </View>
                  )
                }
              />

              {loading ? (
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>Ładowanie zadań…</Text>
              ) : delegatedForSelectedDay.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <Ionicons name="happy-outline" size={18} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6, textAlign: "center" }}>
                    Brak zadań przypisanych przez Ciebie innym w tym dniu.
                  </Text>
                </View>
              ) : (
                <>
                  {delegatedPending.length > 0 && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "900", marginBottom: 6 }}>
                        Otwarte
                      </Text>

                      {delegatedPending.map((m: any) => {
                        const creator = getCreatorMember(m);

                        return (
                          <View
                            key={m.id}
                            style={[
                              styles.missionRow,
                              { borderColor: colors.border, backgroundColor: colors.bg },
                            ]}
                          >
                            <View
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: colors.border,
                                marginRight: 10,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ionicons name="ellipse-outline" size={16} color={colors.textMuted} />
                            </View>

                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900" }} numberOfLines={2}>
                                {m.title}
                              </Text>

                              {!!m.assignedToName && (
                                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                  Przypisane do: {m.assignedToName}
                                </Text>
                              )}

                              {creator?.label && (
                                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                  Dodane przez: {creator.label}
                                </Text>
                              )}
                            </View>

                            <AvatarBubble
                              label={m.assignedToName || "Domownik"}
                              avatarUrl={null}
                              size={26}
                              borderColor={colors.border}
                            />
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {delegatedCompleted.length > 0 && (
                    <View>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "900", marginBottom: 6 }}>
                        Wykonane
                      </Text>

                      {delegatedCompleted.map((m: any) => {
                        const creator = getCreatorMember(m);
                        const doneBy = getCompletedByLabel(m);

                        return (
                          <View
                            key={m.id}
                            style={[
                              styles.missionRow,
                              { borderColor: "#22c55e55", backgroundColor: "#22c55e12" },
                            ]}
                          >
                            <View
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: "#22c55e88",
                                marginRight: 10,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: "#22c55e22",
                              }}
                            >
                              <Ionicons name="checkmark" size={16} color="#16a34a" />
                            </View>

                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900" }} numberOfLines={2}>
                                {m.title}
                              </Text>

                              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                Wykonane przez: {doneBy}
                              </Text>

                              {!!m.assignedToName && (
                                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                  Przypisane do: {m.assignedToName}
                                </Text>
                              )}

                              {creator?.label && (
                                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                  Dodane przez: {creator.label}
                                </Text>
                              )}
                            </View>

                            <AvatarBubble
                              label={m.assignedToName || "Domownik"}
                              avatarUrl={null}
                              size={26}
                              borderColor={"#22c55e66"}
                            />
                          </View>
                        );
                      })}
                    </View>
                  )}
                </>
              )}
            </View>
          </View>

          {/* usunięte */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                marginBottom: 24,
                ...(cardShadow as any),
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 6,
                alignItems: "center",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={[
                    styles.iconPill,
                    { borderColor: colors.border, backgroundColor: colors.bg, marginRight: 8 },
                  ]}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.text} />
                </View>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "900" }}>
                  Usunięte tego dnia
                </Text>
              </View>
              {deletedLoading && <ActivityIndicator size="small" color={colors.accent} />}
            </View>

            {deletedLoading ? (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Ładowanie…</Text>
            ) : deletedError ? (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{deletedError}</Text>
            ) : deletedForSelectedDay.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>Brak usuniętych zadań tego dnia.</Text>
            ) : (
              deletedForSelectedDay.map((m: any) => (
                <View
                  key={m.__path || m.id}
                  style={[styles.missionRow, { borderColor: "#ef444466", backgroundColor: colors.bg }]}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "#ef4444AA",
                      marginRight: 10,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900" }} numberOfLines={2}>
                      {m.title}
                    </Text>
                    {!!m.assignedToName && (
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                        Przypisane do: {m.assignedToName}
                      </Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 16,
  },

  summaryCardCompact: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 16,
  },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "900",
  },

  iconPill: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  monthNavBtn: {
    padding: 6,
    borderRadius: 999,
    borderWidth: 1,
  },

  weekLabelsRow: {
    flexDirection: "row",
    marginBottom: 4,
  },

  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },

  dayCell: {
    flexBasis: "14.2857%",
    maxWidth: "14.2857%",
    alignItems: "center",
    paddingVertical: 6,
  },

  cardsWrap: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 16 as any,
    marginBottom: 0,
  },

  responsiveCard: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 560,
    maxWidth: "100%",
    minWidth: 0,
    marginBottom: 16,
  },

  missionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },

  emptyBox: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  // ✅ bardziej kompaktowe niż wcześniej
  statMiniCompact: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 120,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 10,
    minWidth: 0,
  },

  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },

  badgePillSmall: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
});

// app/calendar.web.tsx
