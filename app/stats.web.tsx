// app/stats.tsx
import React, { useMemo, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Pressable,
  Alert,
  Platform,
  SafeAreaView,
  useWindowDimensions,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";
import { useMissions } from "../src/hooks/useMissions";
import { useFamily } from "../src/hooks/useFamily";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";

// Firestore (jak w Profile.tsx)
import { db } from "../src/firebase/firebase.web";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc as fsDoc,
} from "firebase/firestore";

/* ----------------------- Helpers (DATE) ----------------------- */

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Nd
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfMonth(date: Date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfNextMonth(date: Date) {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date: Date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfDay(date: any) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(date: Date) {
  const d0 = startOfDay(date);
  const y = d0.getFullYear();
  const m = String(d0.getMonth() + 1).padStart(2, "0");
  const d = String(d0.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toSafeDate(v: any): Date | null {
  if (!v) return null;
  try {
    if (typeof v.toDate === "function") return v.toDate();
    if (typeof v.seconds === "number") {
      const ms = Math.floor(v.seconds * 1000 + (v.nanoseconds || 0) / 1e6);
      return new Date(ms);
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** [start, endExclusive) */
function isWithinExclusive(date: Date, start: Date, endExclusive: Date) {
  return date >= start && date < endExclusive;
}

/* ----------------------- Helpers (EXP) ----------------------- */

function getEarnedExp(m: any): number {
  const v =
    m?.earnedExp ??
    m?.expEarned ??
    m?.completedExp ??
    m?.expAwarded ??
    m?.earned ??
    m?.expValue ??
    0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickNumber(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const n = Number(obj?.[k]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  for (const k of keys) {
    const n = Number(obj?.[k]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/* ----------------------- Formatting ----------------------- */

function formatDateTimeShort(d: Date | null): string {
  if (!d) return "jeszcze nie wykonano";
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(d: Date) {
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
}

/* ----------------------- Types ----------------------- */

type AggRow = { key: string; label: string; count: number };

type MemberStatsRow = {
  id: string; // uid
  label: string;
  avatarInitial: string;
  weekCount: number;
  monthCount: number;
  weekExp: number;
  monthExp: number;
  totalExp: number; // ✅ z users/{uid}.totalExp
};

type CompletionEvent = {
  missionId: string;
  title: string;
  date: Date;
  dateKey: string; // YYYY-MM-DD
  userId: string;
  userName?: string | null;
  exp: number;
};

type TileId =
  | "summary"
  | "mission-search"
  | "achievements"
  | "leaderboard"
  | "freq"
  | "difficulty";

type TileConfig = {
  id: TileId;
  wide?: boolean;
  hidden?: boolean;
};

/* ----------------------- Persistence ----------------------- */

const LAYOUT_STORAGE_KEY = "stats_dashboard_tiles_v2";
const LAYOUT_FILE_NAME = "stats_dashboard_tiles_v2.json";

async function loadLayout(): Promise<TileConfig[] | null> {
  try {
    if (Platform.OS === "web") {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed;
    }

    const uri = FileSystem.documentDirectory + LAYOUT_FILE_NAME;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;

    const raw = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveLayout(layout: TileConfig[]) {
  try {
    const raw = JSON.stringify(layout);
    if (Platform.OS === "web") {
      localStorage.setItem(LAYOUT_STORAGE_KEY, raw);
      return;
    }
    const uri = FileSystem.documentDirectory + LAYOUT_FILE_NAME;
    await FileSystem.writeAsStringAsync(uri, raw);
  } catch {
    // silent
  }
}

/* ----------------------- UI Bits ----------------------- */

function Divider({ colors }: { colors: any }) {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        opacity: 0.9,
      }}
    />
  );
}

function Chip({
  colors,
  icon,
  text,
}: {
  colors: any;
  icon?: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: `${colors.textMuted}10`, borderColor: colors.border },
      ]}
    >
      {!!icon && (
        <Ionicons
          name={icon}
          size={14}
          color={colors.textMuted}
          style={{ marginRight: 6 }}
        />
      )}
      <Text
        style={[styles.chipText, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

function PrimaryButton({
  colors,
  icon,
  label,
  onPress,
  style,
}: {
  colors: any;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  style?: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.heroActionPill,
        {
          backgroundColor: colors.accent,
          opacity: pressed ? 0.88 : 1,
          borderColor: "transparent",
        },
        style,
      ]}
      hitSlop={10}
    >
      <Ionicons name={icon} size={16} color="#fff" style={{ marginRight: 8 }} />
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function Card({
  colors,
  title,
  subtitle,
  right,
  children,
  style,
  scroll,
}: {
  colors: any;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: any;
  scroll?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: "#000",
        },
        style,
      ]}
    >
      {(title || right) && (
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {!!title && (
              <Text
                style={[styles.cardTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {title}
              </Text>
            )}
            {!!subtitle && (
              <Text
                style={[styles.cardSubtitle, { color: colors.textMuted }]}
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            )}
          </View>
          {!!right && <View style={{ marginLeft: 12 }}>{right}</View>}
        </View>
      )}

      {scroll ? (
        <View style={{ flex: 1, minHeight: 0 }}>
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 2 }}
          >
            {children}
          </ScrollView>
        </View>
      ) : (
        <>{children}</>
      )}
    </View>
  );
}

/* ----------------------- Completion events (jak Profile) ----------------------- */

function extractCompletionEvents(missions: any[]): CompletionEvent[] {
  if (!Array.isArray(missions)) return [];

  const out: CompletionEvent[] = [];

  missions.forEach((m) => {
    const title = String(m?.title ?? "Bez nazwy");
    const missionId = String(m?.id ?? m?.docId ?? `${title}-${Math.random()}`);

    const repeatType = m?.repeat?.type ?? "none";
    const baseExp = getEarnedExp(m);
    const byDate = m?.completedByByDate || {};

    if (repeatType !== "none") {
      const completedDates: string[] = Array.isArray(m?.completedDates)
        ? m.completedDates
        : [];

      if (completedDates.length > 0) {
        completedDates.forEach((dateKey) => {
          const d = new Date(`${dateKey}T00:00:00`);
          if (isNaN(d.getTime())) return;

          const entry = byDate?.[dateKey];
          const userId = String(
            entry?.userId ||
              entry?.uid ||
              entry?.user ||
              m?.assignedToUserId ||
              ""
          ).trim();
          if (!userId) return;

          const entryExp =
            pickNumber(entry, ["exp", "earnedExp", "expEarned", "gainedExp", "xp"]) ??
            baseExp ??
            0;

          const userName =
            entry?.userName ||
            entry?.name ||
            entry?.displayName ||
            m?.assignedToName ||
            null;

          out.push({
            missionId,
            title,
            date: d,
            dateKey,
            userId,
            userName,
            exp: Number(entryExp) || 0,
          });
        });

        return;
      }

      if (m?.completed) {
        const completedAt = toSafeDate(m?.completedAt);
        const userId = String(m?.completedByUserId || m?.assignedToUserId || "").trim();
        if (completedAt && userId) {
          out.push({
            missionId,
            title,
            date: completedAt,
            dateKey: formatDateKey(completedAt),
            userId,
            userName: m?.completedByName || m?.assignedToName || null,
            exp: baseExp ?? 0,
          });
        }
      }
      return;
    }

    if (m?.completed) {
      const completedAt = toSafeDate(m?.completedAt);
      const userId = String(m?.completedByUserId || "").trim();
      if (!completedAt || !userId) return;

      out.push({
        missionId,
        title,
        date: completedAt,
        dateKey: formatDateKey(completedAt),
        userId,
        userName: m?.completedByName || m?.assignedToName || null,
        exp: baseExp ?? 0,
      });
    }
  });

  out.sort((a, b) => b.date.getTime() - a.date.getTime());
  return out;
}

/* ----------------------- Screen ----------------------- */

const TILE_H = 320;

export default function StatsScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { missions, loading } = useMissions();
  const { members } = useFamily();
  const { width } = useWindowDimensions();

  const isNarrow = width < 520;

  const is2Col = width >= 860;
  const is3Col = width >= 1220;
  const columns = is3Col ? 3 : is2Col ? 2 : 1;

  const now = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeek(now), [now]);
  const weekEndExclusive = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const monthEnd = useMemo(() => endOfMonth(now), [now]);
  const monthEndExclusive = useMemo(() => startOfNextMonth(now), [now]);

  /* -------------------- FAMILY UIDs -------------------- */

  const familyUids = useMemo(() => {
    const list =
      (members || [])
        .map((m: any) => String(m?.uid || m?.userId || m?.id || "").trim())
        .filter(Boolean) || [];
    return Array.from(new Set(list));
  }, [members]);

  /* -------------------- USERS SNAPSHOTS (totalExp) -------------------- */

  const [usersByUid, setUsersByUid] = useState<Map<string, any>>(
    () => new Map()
  );
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    if (!familyUids.length) {
      setUsersByUid(new Map());
      setUsersLoading(false);
      return;
    }

    setUsersLoading(true);
    const map = new Map<string, any>();
    const unsubs: Array<() => void> = [];

    const apply = (uid: string, data: any) => {
      map.set(uid, data);
      // clone => trigger render
      setUsersByUid(new Map(map));
      setUsersLoading(false);
    };

    familyUids.forEach((uid) => {
      unsubs.push(
        onSnapshot(
          fsDoc(db, "users", uid),
          (snap) => {
            apply(uid, snap.exists() ? { id: snap.id, ...snap.data() } : null);
          },
          (err) => {
            console.log("[Stats] users snapshot error:", err);
            setUsersLoading(false);
          }
        )
      );
    });

    return () => {
      unsubs.forEach((u) => u && u());
    };
  }, [familyUids.join("|")]);

  /* -------------------- FAMILY MISSIONS SNAPSHOTS (jak Profile) -------------------- */

  const [familyMissions, setFamilyMissions] = useState<any[]>([]);
  const [familyMissionsLoading, setFamilyMissionsLoading] = useState(false);

  useEffect(() => {
    if (!familyUids.length) {
      setFamilyMissions([]);
      setFamilyMissionsLoading(false);
      return;
    }

    const colRef = collection(db, "missions");
    setFamilyMissionsLoading(true);

    const global = new Map<string, any>();
    const unsubs: Array<() => void> = [];

    const applySnap = (snap: any) => {
      snap.forEach((d: any) => {
        global.set(d.id, { id: d.id, ...d.data() });
      });
      setFamilyMissions(Array.from(global.values()));
      setFamilyMissionsLoading(false);
    };

    const onErr = (err: any) => {
      console.log("[Stats] family missions snapshot error:", err);
      setFamilyMissionsLoading(false);
    };

    familyUids.forEach((uid) => {
      unsubs.push(
        onSnapshot(query(colRef, where("assignedToUserId", "==", uid)), applySnap, onErr)
      );
      unsubs.push(
        onSnapshot(query(colRef, where("createdByUserId", "==", uid)), applySnap, onErr)
      );
      unsubs.push(
        onSnapshot(query(colRef, where("assignedByUserId", "==", uid)), applySnap, onErr)
      );
      unsubs.push(
        onSnapshot(query(colRef, where("completedByUserId", "==", uid)), applySnap, onErr)
      );
    });

    return () => {
      unsubs.forEach((u) => u && u());
    };
  }, [familyUids.join("|")]);

  // merge: hook missions + snapshoty rodziny
  const mergedMissions = useMemo(() => {
    const map = new Map<string, any>();

    (missions || []).forEach((m: any) => {
      if (!m) return;
      const id = String(m.id ?? m.docId ?? "");
      if (!id) return;
      map.set(id, m);
    });

    (familyMissions || []).forEach((m: any) => {
      if (!m) return;
      const id = String(m.id ?? m.docId ?? "");
      if (!id) return;
      map.set(id, m);
    });

    return Array.from(map.values());
  }, [missions, familyMissions]);

  const statsLoading = loading || familyMissionsLoading || usersLoading;

  const normalizedMissions = useMemo(
    () =>
      mergedMissions
        .filter((m: any) => !m?.archived)
        .map((m: any) => ({
          ...m,
          completedAtJs: toSafeDate(m.completedAt),
          dueDateJs: toSafeDate(m.dueDate),
          expValueNum: Number(m.expValue ?? 0),
          earnedExpNum: getEarnedExp(m),
        })),
    [mergedMissions]
  );

  const completionEvents = useMemo(
    () => extractCompletionEvents(normalizedMissions),
    [normalizedMissions]
  );

  const weekEvents = useMemo(
    () => completionEvents.filter((e) => isWithinExclusive(e.date, weekStart, weekEndExclusive)),
    [completionEvents, weekStart, weekEndExclusive]
  );

  const monthEvents = useMemo(
    () => completionEvents.filter((e) => isWithinExclusive(e.date, monthStart, monthEndExclusive)),
    [completionEvents, monthStart, monthEndExclusive]
  );

  /* ---------- EXPORT DO EXCELA ---------- */
  const handleExport = async () => {
    try {
      const completed = normalizedMissions
        .filter((m) => m.completed)
        .map((m) => ({
          Tytuł: m.title ?? "Bez nazwy",
          Status: "Wykonane",
          "Data wykonania": m.completedAtJs
            ? m.completedAtJs.toLocaleString("pl-PL")
            : "",
          "Data planowana": m.dueDateJs
            ? m.dueDateJs.toLocaleDateString("pl-PL")
            : "",
          "Utworzone przez": m.createdByName ?? "Nieznane",
          "Zrealizowane przez": m.completedByName ?? m.assignedToName ?? "Nieznane",
          EXP: m.earnedExpNum ?? m.expValueNum ?? 0,
        }));

      const uncompleted = normalizedMissions
        .filter((m) => !m.completed)
        .map((m) => ({
          Tytuł: m.title ?? "Bez nazwy",
          Status: "Niewykonane",
          "Data wykonania": "",
          "Data planowana": m.dueDateJs
            ? m.dueDateJs.toLocaleDateString("pl-PL")
            : "",
          "Utworzone przez": m.createdByName ?? "Nieznane",
          "Zrealizowane przez": m.assignedToName ?? "Nieprzypisane",
          EXP: m.expValueNum ?? 0,
        }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(completed),
        "Wykonane"
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(uncompleted),
        "Niewykonane"
      );

      if (Platform.OS === "web") {
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([wbout], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "misje_export.xlsx";
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }

      const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      const fileUri = FileSystem.documentDirectory + "misje_export.xlsx";
      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await Sharing.shareAsync(fileUri);
    } catch (error) {
      console.error("Błąd eksportu misji:", error);
      Alert.alert("Błąd eksportu", "Nie udało się wyeksportować pliku.");
    }
  };

  // podsumowania
  const totalCompletedEvents = completionEvents.length;

  const totalCompletedMissions = useMemo(
    () => normalizedMissions.filter((m) => m.completed).length,
    [normalizedMissions]
  );

  const completionRate = useMemo(() => {
    if (!normalizedMissions.length) return 0;
    return Math.round((totalCompletedMissions / normalizedMissions.length) * 100);
  }, [normalizedMissions.length, totalCompletedMissions]);

  // agregacje
  const aggregateByTitleFromEvents = (list: CompletionEvent[]): AggRow[] => {
    const map = new Map<string, AggRow>();
    list.forEach((e) => {
      const raw = (e.title || "Bez nazwy").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      const row = map.get(key) || { key, label: raw, count: 0 };
      row.count += 1;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  };

  const weekAgg = useMemo(
    () => aggregateByTitleFromEvents(weekEvents).slice(0, 5),
    [weekEvents]
  );
  const monthAgg = useMemo(
    () => aggregateByTitleFromEvents(monthEvents).slice(0, 5),
    [monthEvents]
  );

  const maxWeekAgg = useMemo(() => (weekAgg[0]?.count ?? 1), [weekAgg]);
  const maxMonthAgg = useMemo(() => (monthAgg[0]?.count ?? 1), [monthAgg]);

  // map domowników
  const membersByUid = useMemo(() => {
    const map = new Map<string, any>();
    (members || []).forEach((m: any) => {
      const uid = String(m?.uid || m?.userId || m?.id || "").trim();
      if (!uid) return;
      map.set(uid, m);
    });
    return map;
  }, [members]);

  const resolveMemberLabel = (uid: string, fallbackName?: string | null) => {
    const userDoc = usersByUid.get(uid);
    const mem = membersByUid.get(uid);

    const nameFromUser = userDoc?.displayName || userDoc?.username || userDoc?.email || null;
    const nameFromMember = mem?.displayName || mem?.username || mem?.email || null;

    const label =
      nameFromUser ||
      nameFromMember ||
      fallbackName ||
      (uid === "unknown" ? "Nieprzypisane" : "Członek rodziny");

    const initial = ((label?.trim?.()[0] || "?") + "").toUpperCase();
    return { label, initial };
  };

  // ✅ Leaderboard: week/month z eventów + totalExp z users
  const memberStats: MemberStatsRow[] = useMemo(() => {
    const map = new Map<string, MemberStatsRow>();
    const hasFamily = (members || []).length > 0;

    // seed wszyscy domownicy
    (members || []).forEach((mem: any) => {
      const uid = String(mem?.uid || mem?.userId || mem?.id || "").trim();
      if (!uid) return;

      const { label, initial } = resolveMemberLabel(uid, null);
      const totalExp = Math.max(0, Number(usersByUid.get(uid)?.totalExp ?? 0));

      map.set(uid, {
        id: uid,
        label,
        avatarInitial: initial,
        weekCount: 0,
        monthCount: 0,
        weekExp: 0,
        monthExp: 0,
        totalExp,
      });
    });

    const ensure = (uid: string, fallbackName?: string | null) => {
      const ex = map.get(uid);
      if (ex) return ex;

      const { label, initial } = resolveMemberLabel(uid, fallbackName);
      const totalExp = Math.max(0, Number(usersByUid.get(uid)?.totalExp ?? 0));

      const row: MemberStatsRow = {
        id: uid,
        label,
        avatarInitial: initial,
        weekCount: 0,
        monthCount: 0,
        weekExp: 0,
        monthExp: 0,
        totalExp,
      };
      map.set(uid, row);
      return row;
    };

    // week
    weekEvents.forEach((e) => {
      const uid = String(e.userId || "unknown");
      const row = ensure(uid, e.userName || null);
      row.weekCount += 1;
      row.weekExp += Number(e.exp || 0);
    });

    // month
    monthEvents.forEach((e) => {
      const uid = String(e.userId || "unknown");
      const row = ensure(uid, e.userName || null);
      row.monthCount += 1;
      row.monthExp += Number(e.exp || 0);
    });

    // refresh totalExp (gdy snapshot dojdzie później)
    Array.from(map.values()).forEach((row) => {
      row.totalExp = Math.max(0, Number(usersByUid.get(row.id)?.totalExp ?? row.totalExp ?? 0));
      const { label, initial } = resolveMemberLabel(row.id, row.label);
      row.label = label;
      row.avatarInitial = initial;
    });

    const out = Array.from(map.values()).filter((row) => {
      if (!hasFamily) return true;
      if (row.id === "unknown") return row.weekExp > 0 || row.monthExp > 0 || row.totalExp > 0;
      return true;
    });

    // sort: tydz. exp desc, potem totalExp desc, potem nazwa
    out.sort((a, b) => {
      if (b.weekExp !== a.weekExp) return b.weekExp - a.weekExp;
      if (b.totalExp !== a.totalExp) return b.totalExp - a.totalExp;
      if (b.monthExp !== a.monthExp) return b.monthExp - a.monthExp;
      return a.label.localeCompare(b.label, "pl");
    });

    return out;
  }, [members, weekEvents, monthEvents, usersByUid, membersByUid]);

  // trudność
  const difficultyStats = useMemo(() => {
    const out = { easy: 0, medium: 0, hard: 0 };
    const monthMissionIds = new Set(monthEvents.map((e) => e.missionId));
    const monthMissions = normalizedMissions.filter((m) =>
      monthMissionIds.has(String(m.id))
    );

    monthMissions.forEach((m) => {
      const mode = m.expMode as string | undefined;
      if (mode === "easy") out.easy += 1;
      else if (mode === "medium") out.medium += 1;
      else if (mode === "hard") out.hard += 1;
      else {
        const exp = Number(m.earnedExpNum ?? m.expValueNum ?? 0);
        if (exp >= 100) out.hard += 1;
        else if (exp >= 50) out.medium += 1;
        else if (exp > 0) out.easy += 1;
      }
    });

    const total = out.easy + out.medium + out.hard || 1;

    return {
      ...out,
      total,
      easyPct: Math.round((out.easy / total) * 100),
      mediumPct: Math.round((out.medium / total) * 100),
      hardPct: Math.round((out.hard / total) * 100),
    };
  }, [monthEvents, normalizedMissions]);

  const historyEvents = useMemo(
    () => completionEvents.slice(0, 60),
    [completionEvents]
  );

  const topMember = useMemo(() => {
    const active = memberStats.filter(
      (r) => (r.weekExp || 0) > 0 || (r.monthExp || 0) > 0 || (r.totalExp || 0) > 0
    );
    return active.length > 0 ? active[0] : null;
  }, [memberStats]);

  const mostFrequentTask = useMemo(
    () => (monthAgg.length > 0 ? monthAgg[0] : weekAgg[0] || null),
    [monthAgg, weekAgg]
  );

  const dominantDifficultyLabel = useMemo(() => {
    if (!difficultyStats.total) return "Brak danych";
    const { easy, medium, hard } = difficultyStats;
    if (easy >= medium && easy >= hard) return "Głównie łatwe zadania";
    if (medium >= easy && medium >= hard) return "Głównie średnie zadania";
    return "Dużo trudnych zadań 💪";
  }, [difficultyStats]);

  // animacje
  const completionAnim = useRef(new Animated.Value(0)).current;
  const easyAnim = useRef(new Animated.Value(0)).current;
  const mediumAnim = useRef(new Animated.Value(0)).current;
  const hardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!statsLoading) {
      Animated.timing(completionAnim, {
        toValue: completionRate,
        duration: 650,
        useNativeDriver: false,
      }).start();

      Animated.timing(easyAnim, {
        toValue: difficultyStats.easyPct,
        duration: 550,
        useNativeDriver: false,
      }).start();
      Animated.timing(mediumAnim, {
        toValue: difficultyStats.mediumPct,
        duration: 550,
        useNativeDriver: false,
      }).start();
      Animated.timing(hardAnim, {
        toValue: difficultyStats.hardPct,
        duration: 550,
        useNativeDriver: false,
      }).start();
    }
  }, [
    statsLoading,
    completionRate,
    difficultyStats.easyPct,
    difficultyStats.mediumPct,
    difficultyStats.hardPct,
    completionAnim,
    easyAnim,
    mediumAnim,
    hardAnim,
  ]);

  const completionWidth = completionAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });
  const easyWidth = easyAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });
  const mediumWidth = mediumAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });
  const hardWidth = hardAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  const badgeText =
    completionRate >= 80
      ? "Świetna robota! 🔥"
      : completionRate >= 50
      ? "Dobra forma 💪"
      : "Dopiero się rozkręcamy";

  const trackColor = `${colors.textMuted}18`;

  const difficultyColors = {
    easy: "#22c55e",
    medium: "#eab308",
    hard: "#ef4444",
  };

  /* -------------------- Customizable tiles -------------------- */

  const DEFAULT_TILES: TileConfig[] = useMemo(
    () => [
      { id: "summary" },
      { id: "achievements" },
      { id: "leaderboard" },
      { id: "mission-search", wide: true },
      { id: "freq" },
      { id: "difficulty" },
    ],
    []
  );

  const [editOpen, setEditOpen] = useState(false);
  const [tiles, setTiles] = useState<TileConfig[]>(DEFAULT_TILES);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await loadLayout();
      if (!alive) return;

      if (saved?.length) {
        const byId = new Map<TileId, TileConfig>();
        saved.forEach((t: any) => {
          if (!t?.id) return;
          byId.set(t.id, { id: t.id, wide: !!t.wide, hidden: !!t.hidden });
        });

        const merged: TileConfig[] = DEFAULT_TILES.map((t) => byId.get(t.id) || t);
        saved.forEach((t: any) => {
          if (t?.id && !merged.find((m) => m.id === t.id)) {
            merged.push({ id: t.id, wide: !!t.wide, hidden: !!t.hidden });
          }
        });

        setTiles(merged);
      }
    })();
    return () => {
      alive = false;
    };
  }, [DEFAULT_TILES]);

  useEffect(() => {
    const t = setTimeout(() => saveLayout(tiles), 250);
    return () => clearTimeout(t);
  }, [tiles]);

  const resetTiles = () => setTiles(DEFAULT_TILES);

  const moveTile = (id: TileId, dir: -1 | 1) => {
    setTiles((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  };

  const toggleHide = (id: TileId) => {
    setTiles((prev) =>
      prev.map((t) => (t.id === id ? { ...t, hidden: !t.hidden } : t))
    );
  };

  const toggleWide = (id: TileId) => {
    setTiles((prev) =>
      prev.map((t) => (t.id === id ? { ...t, wide: !t.wide } : t))
    );
  };

  const visibleTiles = useMemo(() => tiles.filter((t) => !t.hidden), [tiles]);

  const itemBasis = useMemo(() => {
    if (columns === 1) return "100%";
    if (columns === 2) return "50%";
    return "33.333%";
  }, [columns]);

  /* -------------------- Mission search tile (with modal) -------------------- */

  const [missionQuery, setMissionQuery] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const allTitleStats = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        completed: number;
        lastDone: Date | null;
        by: Map<string, { id: string; name: string; count: number }>;
        events: Array<{ id: string; date: Date | null; userName: string; exp: number }>;
      }
    >();

    const resolveName = (userId: string, fallback?: string | null) => {
      const userDoc = usersByUid.get(userId);
      const mem = membersByUid.get(userId);

      return (
        userDoc?.displayName ||
        userDoc?.username ||
        userDoc?.email ||
        mem?.displayName ||
        mem?.username ||
        mem?.email ||
        fallback ||
        (userId === "unknown" ? "Nieprzypisane" : "Członek rodziny")
      );
    };

    completionEvents.forEach((e) => {
      const raw = (e.title || "Bez nazwy").trim();
      if (!raw) return;
      const key = raw.toLowerCase();

      const row =
        map.get(key) || {
          key,
          label: raw,
          completed: 0,
          lastDone: null as Date | null,
          by: new Map(),
          events: [] as Array<{ id: string; date: Date | null; userName: string; exp: number }>,
        };

      row.completed += 1;

      const whoName = resolveName(e.userId, e.userName || null);
      const p = row.by.get(e.userId) || { id: e.userId, name: whoName, count: 0 };
      p.count += 1;
      row.by.set(e.userId, p);

      if (!row.lastDone || e.date.getTime() > row.lastDone.getTime()) row.lastDone = e.date;

      row.events.push({
        id: `${e.missionId}-${e.dateKey}-${e.userId}`,
        date: e.date,
        userName: whoName,
        exp: Number(e.exp || 0),
      });

      map.set(key, row);
    });

    const out = Array.from(map.values()).map((r) => {
      const byPeople = Array.from(r.by.values()).sort((a, b) => b.count - a.count);
      const events = [...r.events].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
      return { ...r, byPeople, events };
    });

    out.sort((a, b) =>
      b.completed !== a.completed ? b.completed - a.completed : a.label.localeCompare(b.label, "pl")
    );
    return out;
  }, [completionEvents, usersByUid, membersByUid]);

  const filteredStats = useMemo(() => {
    const q = missionQuery.trim().toLowerCase();
    if (!q) return allTitleStats;
    return allTitleStats.filter((t) => t.label.toLowerCase().includes(q));
  }, [allTitleStats, missionQuery]);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return allTitleStats.find((t) => t.key === selectedKey) || null;
  }, [allTitleStats, selectedKey]);

  /* -------------------- Render tiles -------------------- */

  const renderTile = (tile: TileConfig) => {
    const right = (
      <Pressable
        onPress={() => setEditOpen(true)}
        hitSlop={10}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="options-outline" size={18} color={colors.textMuted} />
      </Pressable>
    );

    if (tile.id === "summary") {
      const rows = [
        {
          key: "week",
          label: "Ten tydzień",
          hint: "ukończone zadania",
          value: statsLoading ? "—" : weekEvents.length,
          icon: "calendar-outline" as const,
          tint: colors.accent,
        },
        {
          key: "month",
          label: "Ten miesiąc",
          hint: "ukończone zadania",
          value: statsLoading ? "—" : monthEvents.length,
          icon: "stats-chart-outline" as const,
          tint: colors.accent,
        },
        {
          key: "total",
          label: "Wykonane łącznie",
          hint: "od początku",
          value: statsLoading ? "—" : totalCompletedEvents,
          icon: "checkmark-done-outline" as const,
          tint: "#22c55e",
        },
      ];

      return (
        <Card
          colors={colors}
          title="Podsumowanie"
          subtitle="Najważniejsze liczniki."
          right={right}
          style={{ flex: 1 }}
        >
          <View style={{ marginTop: 8 }}>
            {rows.map((r, idx) => (
              <View key={r.key}>
                {idx !== 0 && (
                  <View style={{ marginVertical: 10 }}>
                    <Divider colors={colors} />
                  </View>
                )}

                <View style={styles.kpiTripleRow}>
                  <View
                    style={[
                      styles.kpiIconWrapSmall,
                      { backgroundColor: `${r.tint}16`, borderColor: `${r.tint}30` },
                    ]}
                  >
                    <Ionicons name={r.icon} size={16} color={r.tint} />
                  </View>

                  <View style={styles.kpiTripleTexts}>
                    <Text style={[styles.kpiTripleLabel, { color: colors.text }]} numberOfLines={1}>
                      {r.label}
                    </Text>
                    <Text style={[styles.kpiTripleHint, { color: colors.textMuted }]} numberOfLines={1}>
                      {r.hint}
                    </Text>
                  </View>

                  <Text style={[styles.kpiTripleValue, { color: colors.text }]} numberOfLines={1}>
                    {r.value}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      );
    }

    if (tile.id === "mission-search") {
      const top = filteredStats.slice(0, 8);
      return (
        <Card
          colors={colors}
          title="Wyszukaj misję"
          subtitle="Wybierz misję → zobacz ile razy, kto i kiedy."
          right={right}
          style={{ height: TILE_H }}
          scroll
        >
          <View style={{ marginTop: 8 }}>
            <View
              style={[
                styles.searchWrap,
                { borderColor: colors.border, backgroundColor: `${colors.textMuted}10` },
              ]}
            >
              <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                value={missionQuery}
                onChangeText={setMissionQuery}
                placeholder="np. Odkurzanie, Zmywanie…"
                placeholderTextColor={colors.textMuted}
                style={[styles.searchInput, { color: colors.text }]}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {!!missionQuery && (
                <Pressable
                  onPress={() => setMissionQuery("")}
                  hitSlop={10}
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            {statsLoading ? (
              <Text style={[styles.bodyMuted, { color: colors.textMuted, marginTop: 10 }]}>Ładowanie…</Text>
            ) : top.length === 0 ? (
              <Text style={[styles.bodyMuted, { color: colors.textMuted, marginTop: 10 }]}>Brak pasujących misji.</Text>
            ) : (
              <View style={{ marginTop: 10 }}>
                {top.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => {
                      setSelectedKey(t.key);
                      setDetailsOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.searchRow,
                      {
                        borderColor: colors.border,
                        backgroundColor: `${colors.textMuted}08`,
                        opacity: pressed ? 0.9 : 1,
                        marginBottom: 8,
                      },
                    ]}
                  >
                    <View style={[styles.searchDot, { borderColor: colors.border }]}>
                      <Ionicons
                        name={t.completed > 0 ? "checkmark" : "ellipse-outline"}
                        size={14}
                        color={t.completed > 0 ? colors.accent : colors.textMuted}
                      />
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.searchTitle, { color: colors.text }]} numberOfLines={1}>
                        {t.label}
                      </Text>
                      <Text style={[styles.searchMeta, { color: colors.textMuted }]} numberOfLines={1}>
                        {t.completed > 0 ? `${t.completed}× • ${formatDateTimeShort(t.lastDone)}` : "jeszcze nie wykonano"}
                      </Text>
                    </View>

                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                ))}

                <Pressable
                  onPress={() => setDetailsOpen(true)}
                  style={({ pressed }) => [
                    styles.linkBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: `${colors.textMuted}08`,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Ionicons name="list-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <Text style={[styles.linkBtnText, { color: colors.textMuted }]}>
                    Pokaż listę ({filteredStats.length})
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </Card>
      );
    }

    if (tile.id === "achievements") {
      return (
        <Card
          colors={colors}
          title="Osiągnięcia"
          subtitle="Szybkie insighty."
          right={right}
          style={{ flex: 1 }}
        >
          {statsLoading ? (
            <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Ładowanie…</Text>
          ) : (
            <View style={{ marginTop: 10, gap: 10 }}>
              <View style={styles.achRow}>
                <View
                  style={[
                    styles.achIcon,
                    {
                      backgroundColor: "rgba(250,204,21,0.14)",
                      borderColor: "rgba(250,204,21,0.35)",
                    },
                  ]}
                >
                  <Ionicons name="medal-outline" size={16} color="#facc15" />
                </View>
                <Text style={[styles.achText, { color: colors.text }]}>
                  {topMember ? (
                    <>
                      Najbardziej aktywny:{" "}
                      <Text style={{ fontWeight: "900" }}>{topMember.label}</Text>
                    </>
                  ) : (
                    "Brak danych o aktywnych domownikach."
                  )}
                </Text>
              </View>

              <View style={styles.achRow}>
                <View
                  style={[
                    styles.achIcon,
                    {
                      backgroundColor: "rgba(34,197,94,0.14)",
                      borderColor: "rgba(34,197,94,0.35)",
                    },
                  ]}
                >
                  <Ionicons name="flash-outline" size={16} color="#22c55e" />
                </View>
                <Text style={[styles.achText, { color: colors.text }]}>
                  {mostFrequentTask ? (
                    <>
                      Najczęściej:{" "}
                      <Text style={{ fontWeight: "900" }}>{mostFrequentTask.label}</Text>
                    </>
                  ) : (
                    "Brak jeszcze najczęściej wykonywanego zadania."
                  )}
                </Text>
              </View>

              <View style={styles.achRow}>
                <View
                  style={[
                    styles.achIcon,
                    {
                      backgroundColor: "rgba(239,68,68,0.14)",
                      borderColor: "rgba(239,68,68,0.35)",
                    },
                  ]}
                >
                  <Ionicons name="flame-outline" size={16} color="#ef4444" />
                </View>
                <Text style={[styles.achText, { color: colors.text }]}>
                  {dominantDifficultyLabel}
                </Text>
              </View>
            </View>
          )}
        </Card>
      );
    }

    if (tile.id === "leaderboard") {
      const list = memberStats.slice(0, 10);

      return (
        <Card
          colors={colors}
          title="Leaderboard"
          subtitle="Top (ten tydzień)."
          right={right}
          style={{ flex: 1 }}
        >
          {statsLoading ? (
            <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Ładowanie…</Text>
          ) : list.length === 0 ? (
            <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Brak danych.</Text>
          ) : (
            <View style={{ marginTop: 10 }}>
              {list.map((row, idx) => {
                const tint =
                  idx === 0
                    ? "#facc15"
                    : idx === 1
                    ? "#a5b4fc"
                    : idx === 2
                    ? "#f97316"
                    : colors.accent;

                // bar: preferuj tydzień, ale jak wszyscy mają 0 -> pokaż totalExp
                const denom = Math.max(
                  list[0]?.weekExp || 0,
                  list[0]?.totalExp || 0,
                  1
                );
                const numer = row.weekExp > 0 ? row.weekExp : row.totalExp;
                const pct = Math.min(100, Math.round((numer / denom) * 100));

                return (
                  <Pressable
                    key={row.id}
                    onPress={() => {
                      // ✅ wejście w profil
                      router.push({ pathname: "/Profile", params: { uid: row.id } });
                    }}
                    style={({ pressed }) => [
                      { marginBottom: 10, opacity: pressed ? 0.9 : 1 },
                    ]}
                  >
                    <View style={styles.memberTop}>
                      <View
                        style={[
                          styles.avatar,
                          { borderColor: colors.border, backgroundColor: `${tint}14` },
                        ]}
                      >
                        <Text style={[styles.avatarText, { color: tint }]}>
                          {row.avatarInitial}
                        </Text>
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                          {idx + 1}. {row.label}
                        </Text>

                        {/* ✅ pokazujemy też totalExp z users */}
                        <Text style={[styles.memberMeta, { color: colors.textMuted }]} numberOfLines={1}>
                          {row.weekExp} EXP tydz. • {row.monthExp} EXP mies. • {row.totalExp} EXP łącznie
                        </Text>
                      </View>

                      <Ionicons
                        name={
                          idx === 0
                            ? "trophy"
                            : idx === 1
                            ? "trophy-outline"
                            : idx === 2
                            ? "ribbon-outline"
                            : "chevron-forward"
                        }
                        size={18}
                        color={idx < 3 ? tint : colors.textMuted}
                      />
                    </View>

                    <View
                      style={[
                        styles.miniTrack,
                        { backgroundColor: trackColor, borderColor: colors.border },
                      ]}
                    >
                      <View
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          backgroundColor: tint,
                          borderRadius: 999,
                        }}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>
      );
    }

    if (tile.id === "freq") {
      return (
        <Card
          colors={colors}
          title="Najczęstsze zadania"
          subtitle="Top tydzień i miesiąc."
          right={right}
          style={{ height: TILE_H }}
          scroll
        >
          {statsLoading ? (
            <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Ładowanie…</Text>
          ) : (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Tydzień</Text>
              {weekAgg.length === 0 ? (
                <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Brak danych.</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {weekAgg.map((r, idx) => {
                    const pct = Math.round((r.count / maxWeekAgg) * 100);
                    return (
                      <View key={`w-${r.key}`} style={{ marginBottom: 10 }}>
                        <View style={styles.freqTop}>
                          <Text style={[styles.freqLabel, { color: colors.text }]} numberOfLines={1}>
                            {idx + 1}. {r.label}
                          </Text>
                          <Text style={[styles.freqCount, { color: colors.textMuted }]}>{r.count}×</Text>
                        </View>
                        <View
                          style={[
                            styles.miniTrack,
                            { backgroundColor: trackColor, borderColor: colors.border },
                          ]}
                        >
                          <View
                            style={{
                              height: "100%",
                              width: `${pct}%`,
                              backgroundColor: colors.accent,
                              borderRadius: 999,
                            }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={{ marginVertical: 8 }}>
                <Divider colors={colors} />
              </View>

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Miesiąc</Text>
              {monthAgg.length === 0 ? (
                <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Brak danych.</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {monthAgg.map((r, idx) => {
                    const pct = Math.round((r.count / maxMonthAgg) * 100);
                    return (
                      <View key={`m-${r.key}`} style={{ marginBottom: 10 }}>
                        <View style={styles.freqTop}>
                          <Text style={[styles.freqLabel, { color: colors.text }]} numberOfLines={1}>
                            {idx + 1}. {r.label}
                          </Text>
                          <Text style={[styles.freqCount, { color: colors.textMuted }]}>{r.count}×</Text>
                        </View>
                        <View
                          style={[
                            styles.miniTrack,
                            { backgroundColor: trackColor, borderColor: colors.border },
                          ]}
                        >
                          <View
                            style={{
                              height: "100%",
                              width: `${pct}%`,
                              backgroundColor: colors.accent,
                              borderRadius: 999,
                            }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </Card>
      );
    }

    // difficulty
    return (
      <Card
        colors={colors}
        title="Trudność"
        subtitle="Ten miesiąc."
        right={right}
        style={{ height: TILE_H }}
        scroll
      >
        {statsLoading ? (
          <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Ładowanie…</Text>
        ) : difficultyStats.total === 0 ? (
          <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Brak danych.</Text>
        ) : (
          <View style={{ marginTop: 10 }}>
            {[
              {
                key: "easy",
                label: "Łatwe",
                icon: "leaf-outline" as const,
                count: difficultyStats.easy,
                pct: difficultyStats.easyPct,
                width: easyWidth,
                color: difficultyColors.easy,
              },
              {
                key: "medium",
                label: "Średnie",
                icon: "alert-circle-outline" as const,
                count: difficultyStats.medium,
                pct: difficultyStats.mediumPct,
                width: mediumWidth,
                color: difficultyColors.medium,
              },
              {
                key: "hard",
                label: "Trudne",
                icon: "flame-outline" as const,
                count: difficultyStats.hard,
                pct: difficultyStats.hardPct,
                width: hardWidth,
                color: difficultyColors.hard,
              },
            ].map((row) => (
              <View key={row.key} style={{ marginBottom: 12 }}>
                <View style={styles.diffTop}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name={row.icon} size={16} color={row.color} style={{ marginRight: 8 }} />
                    <Text style={[styles.diffLabel, { color: colors.text }]}>{row.label}</Text>
                  </View>
                  <Text style={[styles.diffMeta, { color: colors.textMuted }]}>
                    {row.count} • {row.pct}%
                  </Text>
                </View>

                <View style={[styles.diffTrack, { backgroundColor: trackColor, borderColor: colors.border }]}>
                  <Animated.View style={[styles.diffFill, { width: row.width, backgroundColor: row.color }]} />
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>
    );
  };

  const orbBlur = Platform.OS === "web" ? ({ filter: "blur(48px)" } as any) : null;

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      {/* tło */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
        <View
          style={{
            position: "absolute",
            width: 320,
            height: 320,
            borderRadius: 999,
            backgroundColor: colors.accent + "28",
            top: -150,
            left: -120,
            opacity: 1,
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
        <View
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: 999,
            backgroundColor: "#a855f720",
            top: 210,
            left: -90,
            ...(orbBlur as any),
          }}
        />
        <View
          style={{
            position: "absolute",
            width: 300,
            height: 300,
            borderRadius: 999,
            backgroundColor: "#0ea5e920",
            top: 420,
            right: -150,
            ...(orbBlur as any),
          }}
        />
        <View
          style={{
            position: "absolute",
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: "#f9731620",
            top: 720,
            left: 40,
            ...(orbBlur as any),
          }}
        />
      </View>

      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent", zIndex: 1 }}>
        <ScrollView
          style={{ flex: 1, backgroundColor: "transparent", zIndex: 1 }}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 14, alignItems: "center" }}
        >
          <View style={{ width: "100%", maxWidth: 1344, paddingHorizontal: 16 }}>
            {/* HERO */}
            <View style={[styles.hero, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -80,
                  right: -70,
                  width: 180,
                  height: 180,
                  borderRadius: 999,
                  backgroundColor: colors.accent,
                  opacity: 0.1,
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  bottom: -90,
                  left: -70,
                  width: 200,
                  height: 200,
                  borderRadius: 999,
                  backgroundColor: colors.accent,
                  opacity: 0.07,
                }}
              />

              <View style={[styles.heroTop, isNarrow && styles.heroTopNarrow]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.heroTitle, { color: colors.text }]} numberOfLines={1}>
                    Statystyki
                  </Text>
                  <Text style={[styles.heroSubtitle, { color: colors.textMuted }]} numberOfLines={2}>
                    Nowoczesny dashboard dla Twojej misji domowej.
                  </Text>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
                    <View style={{ marginRight: 8, marginBottom: 8 }}>
                      <Chip
                        colors={colors}
                        icon="calendar-outline"
                        text={`Tydzień: ${formatDateShort(weekStart)}–${formatDateShort(addDays(weekEndExclusive, -1))}`}
                      />
                    </View>
                    <View style={{ marginRight: 8, marginBottom: 8 }}>
                      <Chip colors={colors} icon="stats-chart-outline" text={`Miesiąc: ${formatDateShort(monthStart)}–${formatDateShort(monthEnd)}`} />
                    </View>
                    <View style={{ marginRight: 8, marginBottom: 8 }}>
                      <Chip colors={colors} icon="sparkles-outline" text={badgeText} />
                    </View>
                  </View>
                </View>

                <View style={[styles.heroActionsCol, isNarrow && styles.heroActionsColNarrow]}>
                  <PrimaryButton
                    colors={colors}
                    icon="download-outline"
                    label="Export"
                    onPress={handleExport}
                    style={isNarrow ? styles.heroActionPillNarrow : undefined}
                  />

                  <Pressable
                    onPress={() => setEditOpen(true)}
                    style={({ pressed }) => [
                      styles.heroActionPill,
                      isNarrow && styles.heroActionPillNarrow,
                      {
                        borderColor: colors.border,
                        backgroundColor: `${colors.textMuted}08`,
                        opacity: pressed ? 0.85 : 1,
                        marginTop: isNarrow ? 0 : 10,
                      },
                    ]}
                  >
                    <Ionicons name="options-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                    <Text style={{ color: colors.textMuted, fontWeight: "900", fontSize: 13, letterSpacing: -0.1 }}>
                      Dostosuj kafelki
                    </Text>
                  </Pressable>

                  <View
                    style={[
                      styles.heroActionPill,
                      isNarrow ? styles.heroActionPillNarrowFull : null,
                      {
                        marginTop: isNarrow ? 0 : 10,
                        backgroundColor: `${colors.accent}14`,
                        borderColor: `${colors.accent}33`,
                        justifyContent: "center",
                      },
                    ]}
                  >
                    <Text style={[styles.heroBadgeText, { color: colors.accent }]}>
                      Skuteczność: {completionRate}%
                    </Text>
                  </View>
                </View>
              </View>

              <View style={{ marginTop: 14 }}>
                <View style={styles.heroProgressRow}>
                  <Text style={[styles.microLabel, { color: colors.textMuted }]}>Progres wszystkich zadań</Text>
                  <Text style={[styles.microValue, { color: colors.text }]}>
                    {totalCompletedMissions}/{normalizedMissions.length}
                  </Text>
                </View>

                <View style={[styles.progressTrack, { backgroundColor: `${colors.textMuted}18`, borderColor: colors.border }]}>
                  <Animated.View style={[styles.progressFill, { width: completionWidth, backgroundColor: colors.accent }]} />
                </View>

                <Text style={[styles.microHint, { color: colors.textMuted }]}>
                  To jest globalny wynik (nie tylko bieżący tydzień/miesiąc).
                </Text>
              </View>
            </View>

            {/* tiles */}
            <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6, alignItems: "stretch" }}>
              {visibleTiles.map((t) => (
                <View
                  key={t.id}
                  style={{
                    paddingHorizontal: 6,
                    marginBottom: 12,
                    flexBasis: t.wide ? "100%" : columns === 1 ? "100%" : columns === 2 ? "50%" : "33.333%",
                    flexGrow: t.wide ? 0 : 1,
                    alignSelf: "stretch",
                  }}
                >
                  {renderTile(t)}
                </View>
              ))}
            </View>

            {/* historia */}
            <View style={{ marginTop: 0 }}>
              <Card colors={colors} title="Historia zadań" subtitle="Ostatnio wykonane na górze." style={{ marginBottom: 24 }}>
                {statsLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : historyEvents.length === 0 ? (
                  <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Nie dodano jeszcze żadnych zadań.</Text>
                ) : (
                  <View style={{ marginTop: 8 }}>
                    {historyEvents.map((e, idx) => {
                      const userDoc = usersByUid.get(e.userId);
                      const mem = membersByUid.get(e.userId);

                      const who =
                        userDoc?.displayName ||
                        userDoc?.username ||
                        userDoc?.email ||
                        mem?.displayName ||
                        mem?.username ||
                        mem?.email ||
                        e.userName ||
                        "Nieznany członek rodziny";

                      return (
                        <View key={`${e.missionId}-${e.dateKey}-${idx}`}>
                          {idx !== 0 && (
                            <View style={{ marginVertical: 10 }}>
                              <Divider colors={colors} />
                            </View>
                          )}

                          <View style={styles.historyRow}>
                            <View
                              style={[
                                styles.statusDot,
                                {
                                  borderColor: "rgba(34,197,94,0.55)",
                                  backgroundColor: "rgba(34,197,94,0.14)",
                                },
                              ]}
                            >
                              <Ionicons name="checkmark" size={14} color="#22c55e" />
                            </View>

                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[styles.historyTitle, { color: colors.text }]} numberOfLines={2}>
                                {e.title || "Bez nazwy"}
                              </Text>

                              <Text style={[styles.historyMeta, { color: colors.textMuted }]}>
                                Wykonane:{" "}
                                <Text style={{ color: colors.text }}>{formatDateTimeShort(e.date)}</Text>
                              </Text>

                              <Text style={[styles.historyMeta, { color: colors.textMuted }]}>
                                Wykonawca: <Text style={{ color: colors.text }}>{who}</Text> •{" "}
                                <Text style={{ color: colors.textMuted, fontWeight: "900" }}>+{e.exp} EXP</Text>
                              </Text>
                            </View>

                            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </Card>
            </View>
          </View>
        </ScrollView>

        {/* edit modal */}
        <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => setEditOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalSheet, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Dostosuj kafelki</Text>
                <Pressable onPress={() => setEditOpen(false)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </Pressable>
              </View>

              <ScrollView style={{ padding: 14 }} showsVerticalScrollIndicator={false}>
                {tiles.map((t) => (
                  <View key={t.id} style={[styles.editRow, { borderColor: colors.border, backgroundColor: `${colors.textMuted}08` }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text, fontWeight: "900" }} numberOfLines={1}>
                        {t.id === "summary"
                          ? "Podsumowanie"
                          : t.id === "mission-search"
                          ? "Wyszukaj misję"
                          : t.id === "achievements"
                          ? "Osiągnięcia"
                          : t.id === "leaderboard"
                          ? "Leaderboard"
                          : t.id === "freq"
                          ? "Najczęstsze zadania"
                          : "Trudność"}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                        {t.hidden ? "Ukryty" : t.wide ? "Szeroki (pełny rząd)" : "Normalny"}
                      </Text>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <Pressable onPress={() => moveTile(t.id, -1)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}>
                        <Ionicons name="chevron-up" size={18} color={colors.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => moveTile(t.id, 1)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}>
                        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                      </Pressable>

                      <Pressable onPress={() => toggleWide(t.id)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}>
                        <Ionicons name={t.wide ? "contract-outline" : "expand-outline"} size={18} color={colors.textMuted} />
                      </Pressable>

                      <Pressable onPress={() => toggleHide(t.id)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}>
                        <Ionicons name={t.hidden ? "eye-outline" : "eye-off-outline"} size={18} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  </View>
                ))}

                <Pressable
                  onPress={resetTiles}
                  style={({ pressed }) => [
                    styles.resetBtn,
                    { borderColor: colors.border, backgroundColor: `${colors.textMuted}08`, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Ionicons name="refresh-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.textMuted, fontWeight: "900" }}>Reset układu</Text>
                </Pressable>
              </ScrollView>

              <View style={{ padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <Pressable
                  onPress={() => setEditOpen(false)}
                  style={({ pressed }) => [
                    styles.modalCloseBtn,
                    { borderColor: colors.border, backgroundColor: `${colors.textMuted}08`, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={{ color: colors.text, fontWeight: "900" }}>Zamknij</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* mission details modal */}
        <Modal visible={detailsOpen} animationType="slide" transparent onRequestClose={() => setDetailsOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalSheet, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Misje — szczegóły</Text>
                <Pressable onPress={() => setDetailsOpen(false)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </Pressable>
              </View>

              <View style={{ padding: 14 }}>
                <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: `${colors.textMuted}10` }]}>
                  <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <TextInput
                    value={missionQuery}
                    onChangeText={setMissionQuery}
                    placeholder="Szukaj misji…"
                    placeholderTextColor={colors.textMuted}
                    style={[styles.searchInput, { color: colors.text }]}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                </View>

                <View style={{ height: 12 }} />

                <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                  {filteredStats.slice(0, 30).map((t) => {
                    const isActive = selectedKey === t.key;
                    return (
                      <Pressable
                        key={t.key}
                        onPress={() => setSelectedKey(t.key)}
                        style={({ pressed }) => [
                          styles.searchRow,
                          {
                            borderColor: colors.border,
                            backgroundColor: isActive ? `${colors.accent}14` : `${colors.textMuted}08`,
                            opacity: pressed ? 0.9 : 1,
                            marginBottom: 8,
                          },
                        ]}
                      >
                        <View style={[styles.searchDot, { borderColor: colors.border }]}>
                          <Ionicons
                            name={t.completed > 0 ? "checkmark" : "ellipse-outline"}
                            size={14}
                            color={t.completed > 0 ? colors.accent : colors.textMuted}
                          />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.searchTitle, { color: colors.text }]} numberOfLines={1}>
                            {t.label}
                          </Text>
                          <Text style={[styles.searchMeta, { color: colors.textMuted }]} numberOfLines={1}>
                            {t.completed > 0 ? `${t.completed}× • ${formatDateTimeShort(t.lastDone)}` : "jeszcze nie wykonano"}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={{ marginTop: 12 }}>
                  <Divider colors={colors} />
                </View>

                {!selected ? (
                  <Text style={[styles.bodyMuted, { color: colors.textMuted, marginTop: 12 }]}>
                    Wybierz misję z listy, żeby zobaczyć: ile razy, kto i kiedy.
                  </Text>
                ) : (
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }} numberOfLines={2}>
                      {selected.label}
                    </Text>
                    <Text style={{ color: colors.textMuted, marginTop: 6, fontWeight: "800" }}>
                      Wykonano: <Text style={{ color: colors.text }}>{selected.completed}×</Text> • Ostatnio:{" "}
                      <Text style={{ color: colors.text }}>{formatDateTimeShort(selected.lastDone)}</Text>
                    </Text>

                    <View style={{ marginTop: 10 }}>
                      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Historia (ostatnie 12)</Text>
                      <View style={{ marginTop: 8 }}>
                        {selected.events.slice(0, 12).map((e: any) => (
                          <View
                            key={e.id}
                            style={[
                              styles.eventRow,
                              { borderColor: colors.border, backgroundColor: `${colors.textMuted}08` },
                            ]}
                          >
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: colors.text, fontWeight: "900" }} numberOfLines={1}>
                                {e.userName}
                              </Text>
                              <Text style={{ color: colors.textMuted, marginTop: 2, fontSize: 11 }} numberOfLines={1}>
                                {formatDateTimeShort(e.date)}
                              </Text>
                            </View>
                            <Text style={{ color: colors.textMuted, fontWeight: "900" }}>+{e.exp}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}
              </View>

              <View style={{ padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <Pressable
                  onPress={() => setDetailsOpen(false)}
                  style={({ pressed }) => [
                    styles.modalCloseBtn,
                    { borderColor: colors.border, backgroundColor: `${colors.textMuted}08`, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Text style={{ color: colors.text, fontWeight: "900" }}>Zamknij</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

/* ----------------------- Styles ----------------------- */

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: Platform.OS === "web" ? ("100dvh" as any) : undefined,
  },

  hero: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    position: "relative",
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? { shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } }
      : { elevation: 2 }),
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  heroTopNarrow: {
    flexDirection: "column",
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },

  heroBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },
  microLabel: {
    fontSize: 11,
    fontWeight: "800",
  },
  microValue: {
    fontSize: 12,
    fontWeight: "900",
  },
  microHint: {
    fontSize: 10,
    marginTop: 6,
    opacity: 0.9,
  },
  heroProgressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },

  heroActionsCol: {
    alignItems: "stretch",
    width: 190,
  },
  heroActionsColNarrow: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  heroActionPill: {
    height: 42,
    borderRadius: 999,
    paddingHorizontal: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  heroActionPillNarrow: {
    flexBasis: "48%",
    flexGrow: 1,
  },
  heroActionPillNarrowFull: {
    flexBasis: "100%",
    flexGrow: 1,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
  },

  primaryBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: -0.1,
  },

  card: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 22,
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? { shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }
      : { elevation: 2 }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },

  bodyMuted: {
    fontSize: 13,
    marginTop: 6,
  },

  kpiTripleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  kpiIconWrapSmall: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  kpiTripleTexts: {
    flex: 1,
    minWidth: 0,
  },
  kpiTripleLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  kpiTripleHint: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    opacity: 0.9,
  },
  kpiTripleValue: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.2,
    marginLeft: 10,
  },

  achRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  achIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  achText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "900",
  },
  memberTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  memberName: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  memberMeta: {
    fontSize: 11,
    marginTop: 2,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "900",
    marginTop: 2,
  },

  freqTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  freqLabel: {
    fontSize: 13,
    fontWeight: "800",
    flex: 1,
  },
  freqCount: {
    fontSize: 12,
    fontWeight: "900",
  },

  miniTrack: {
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 8,
  },

  diffTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  diffLabel: {
    fontSize: 13,
    fontWeight: "900",
  },
  diffMeta: {
    fontSize: 12,
    fontWeight: "800",
  },
  diffTrack: {
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  diffFill: {
    height: "100%",
    borderRadius: 999,
  },

  historyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  statusDot: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginTop: 2,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  historyMeta: {
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    padding: 0,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchDot: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  searchTitle: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  searchMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  linkBtn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  linkBtnText: {
    fontSize: 12,
    fontWeight: "900",
  },

  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    maxHeight: "92%",
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "900",
    flex: 1,
    marginRight: 10,
  },
  modalCloseBtn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
  },

  editRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  resetBtn: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },

  eventRow: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
});

// app/stats.tsx
