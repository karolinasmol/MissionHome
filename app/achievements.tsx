// app/achievements.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useThemeColors } from "../src/context/ThemeContext";
import { useMissions } from "../src/hooks/useMissions";
import { useFamily } from "../src/hooks/useFamily";

import { db } from "../src/firebase/firebase";
import { auth } from "../src/firebase/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

/* =========================
   Helpers: daty + zakresy
========================= */

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth(date: Date) {
  const d = new Date(date);
  d.setDate(1);
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
function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function toJsDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function isWithin(date: Date, start: Date, end: Date) {
  return date >= start && date <= end;
}
function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function clampPct(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/* =========================
   EXP Curve
========================= */

function requiredExpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 1; l < level; l++) total += 100 + 50 * (l - 1);
  return total;
}

function computeLevelProgress(totalExp: number, levelFromDoc?: number) {
  let level = Math.max(1, Math.floor(num(levelFromDoc ?? 1)));
  const exp = Math.max(0, Math.floor(num(totalExp)));

  while (exp >= requiredExpForLevel(level + 1)) level++;
  while (level > 1 && exp < requiredExpForLevel(level)) level--;

  const baseReq = requiredExpForLevel(level);
  const nextReq = requiredExpForLevel(level + 1);
  const span = Math.max(1, nextReq - baseReq);
  const into = Math.max(0, exp - baseReq);
  const pct = clampPct((into / span) * 100);
  const toNext = Math.max(0, nextReq - exp);

  return { level, baseReq, nextReq, span, into, pct, toNext, exp };
}

/* =========================
   Achievements
========================= */

type StatKey =
  | "missionsCompletedTotal"
  | "missionsCompletedWeek"
  | "missionsCompletedMonth"
  | "totalExp"
  | "streakDays"
  | "missionsCreatedTotal"
  | "hardCompletedTotal"
  | "missionsCompletedForOthers"
  | "missionsCompletedOnTime";

type MHStats = Partial<Record<StatKey, number>>;

type Achievement = {
  id: string;
  label: string;
  description: string;
  statKey: StatKey;
  thresholds: number[];
  tierNames: string[];
};

const ACHIEVEMENTS: Achievement[] = [
  {
    id: "done_total",
    label: "Wykonawca",
    description: "Wykonuj zadania i utrzymuj tempo.",
    statKey: "missionsCompletedTotal",
    thresholds: [50, 150, 400, 900, 1800, 3000],
    tierNames: [
      "Pierwsze kroki",
      "Wkręcony",
      "Zorganizowany",
      "Maszyna",
      "Mistrz domu",
      "Legenda porządku",
    ],
  },
  {
    id: "exp_total",
    label: "Expowicz",
    description: "Zbieraj EXP za wykonane misje.",
    statKey: "totalExp",
    thresholds: [500, 1500, 3000, 6000, 10000, 20000],
    tierNames: ["Iskra", "Rozbłysk", "Napęd", "Turbo", "Weteran", "Potęga"],
  },
  {
    id: "streak",
    label: "Streak",
    description: "Codziennie choć jedno wykonane zadanie.",
    statKey: "streakDays",
    thresholds: [7, 21, 45, 90, 180, 365],
    tierNames: [
      "Start",
      "Trzymasz się",
      "Tydzień ognia",
      "Dwa tygodnie",
      "Miesiąc mocy",
      "Niezniszczalny",
    ],
  },
  {
    id: "created",
    label: "Organizator",
    description: "Twórz i rozdzielaj zadania w domu.",
    statKey: "missionsCreatedTotal",
    thresholds: [20, 80, 200, 500, 1200],
    tierNames: ["Planer", "Koordynator", "Szef kuchni", "Dyrygent", "Architekt"],
  },
  {
    id: "hard",
    label: "Hardcore",
    description: "Trudne misje (hard / ≥100 EXP).",
    statKey: "hardCompletedTotal",
    thresholds: [10, 30, 80, 180, 350],
    tierNames: ["Odważny", "Twardziel", "Niezły zawodnik", "Czołg", "Boss"],
  },
  {
    id: "help",
    label: "Pomocna dłoń",
    description: "Misje wykonane dla innych domowników.",
    statKey: "missionsCompletedForOthers",
    thresholds: [5, 20, 60, 150, 400],
    tierNames: ["Miły", "Wsparcie", "Dobrodziej", "Ostoja", "Filantrop"],
  },
  {
    id: "ontime",
    label: "Perfekcjonista",
    description: "Misje wykonane tego samego dnia.",
    statKey: "missionsCompletedOnTime",
    thresholds: [10, 40, 120, 300, 800],
    tierNames: ["Punktualny", "Solidny", "Terminowy", "Perfekcyjny", "Absolut"],
  },
];

function progressFor(stats: MHStats, a: Achievement) {
  const progress = Math.max(0, Math.floor(num(stats[a.statKey])));
  let tierIndex = 0;
  let currentThreshold = 0;
  let nextThreshold: number | null = null;

  for (let i = 0; i < a.thresholds.length; i++) {
    const thr = a.thresholds[i];
    if (progress >= thr) {
      tierIndex = i + 1;
      currentThreshold = thr;
    } else {
      nextThreshold = thr;
      break;
    }
  }
  return { progress, tierIndex, currentThreshold, nextThreshold };
}

function percent(val: number, max?: number | null) {
  if (!max || max <= 0) return 100;
  return clampPct((val / max) * 100);
}

/* =========================
   Obrazki osiągnięć (jak web)
========================= */

const ACHIEVEMENT_IMAGES: Record<string, any> = {
  done_total: require("../src/assets/done_total.png"),
  exp_total: require("../src/assets/exp_total.png"),
  streak: require("../src/assets/streak.png"),
  created: require("../src/assets/created.png"),
  hard: require("../src/assets/hard.png"),
  help: require("../src/assets/help.png"),
  ontime: require("../src/assets/ontime.png"),
};

function AchievementImage({
  id,
  colors,
}: {
  id: string;
  colors: ReturnType<typeof useThemeColors>["colors"];
}) {
  const src = ACHIEVEMENT_IMAGES[id];

  if (!src) {
    return (
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.accent + "22",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.accent + "55",
        }}
      >
        <Text
          style={{
            color: colors.accent,
            fontSize: 10,
            fontWeight: "900",
            textAlign: "center",
          }}
          numberOfLines={2}
        >
          {id}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={src}
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        resizeMode: "cover",
      }}
    />
  );
}

/* =========================
   SCREEN
========================= */

export default function AchievementsScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { width } = useWindowDimensions();

  const isSmall = width < 380;

  const { missions, loading: missionsLoading } = useMissions();
  const { members } = useFamily();

  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [userDoc, setUserDoc] = useState<{ level: number; totalExp: number } | null>(
    null
  );
  const [userLoading, setUserLoading] = useState(true);

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekEnd = useMemo(() => endOfDay(addDays(weekStart, 6)), [weekStart]);
  const monthStart = useMemo(() => startOfMonth(new Date()), []);
  const monthEnd = useMemo(() => endOfMonth(new Date()), []);

  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => off();
  }, []);

  useEffect(() => {
    if (!uid) {
      setUserDoc(null);
      setUserLoading(false);
      return;
    }
    setUserLoading(true);

    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap.data() as any;
        setUserDoc({
          level: Math.max(1, Math.floor(num(d?.level ?? 1))),
          totalExp: Math.max(0, Math.floor(num(d?.totalExp ?? 0))),
        });
        setUserLoading(false);
      },
      () => setUserLoading(false)
    );

    return unsub;
  }, [uid]);

  const normalizedMissions = useMemo(() => {
    const list = Array.isArray(missions) ? missions : [];
    return list
      .filter((m: any) => !m?.archived)
      .map((m: any) => ({
        ...m,
        completedAtJs: toJsDate(m?.completedAt),
        expValueNum: Math.max(0, Math.floor(num(m?.expValue ?? 0))),
        assignedToId: m?.assignedToUserId ? String(m.assignedToUserId) : null,
        createdById: m?.createdByUserId ? String(m.createdByUserId) : null,
        assignedById: m?.assignedByUserId ? String(m.assignedByUserId) : null,
        completedById: m?.completedByUserId ? String(m.completedByUserId) : null,
        assignedAtJs: toJsDate(
          (m as any)?.assignedAt ??
            (m as any)?.assignedAtTs ??
            (m as any)?.assignedDate ??
            null
        ),
        createdAtJs: toJsDate(
          (m as any)?.createdAt ??
            (m as any)?.createdAtTs ??
            (m as any)?.createdDate ??
            null
        ),
      }));
  }, [missions]);

  const familyMemberIds: string[] = useMemo(() => {
    if (!members) return [];
    return (members as any[])
      .map((x) => String(x?.uid || x?.userId || x?.id || ""))
      .filter(Boolean);
  }, [members]);

  const isMineForStats = useMemo(() => {
    const myId = uid ? String(uid) : null;
    if (!myId) return () => false;

    return (m: any) => {
      const assignedTo = m?.assignedToId ? String(m.assignedToId) : null;
      const assignedBy = m?.assignedById ? String(m.assignedById) : null;
      const createdBy = m?.createdById ? String(m.createdById) : null;

      if (assignedTo && assignedTo === myId) return true;
      if (!assignedTo && (assignedBy === myId || createdBy === myId)) return true;

      const isFamilyTarget = !!assignedTo && familyMemberIds.includes(assignedTo);
      if (isFamilyTarget && (assignedBy === myId || createdBy === myId)) return true;

      return false;
    };
  }, [uid, familyMemberIds]);

  const visibleMissions = useMemo(() => {
    return normalizedMissions.filter(isMineForStats);
  }, [normalizedMissions, isMineForStats]);

  const myCompleted = useMemo(() => {
    const myId = uid ? String(uid) : null;
    if (!myId) return [];

    return visibleMissions.filter((m: any) => {
      if (!m.completed) return false;
      const completedBy = m.completedById ? String(m.completedById) : null;
      const assignedTo = m.assignedToId ? String(m.assignedToId) : null;

      if (completedBy) return completedBy === myId;
      return assignedTo === myId;
    });
  }, [visibleMissions, uid]);

  const myWeekCompleted = useMemo(() => {
    return myCompleted.filter((m: any) => {
      if (!m.completedAtJs) return false;
      return isWithin(m.completedAtJs, weekStart, weekEnd);
    });
  }, [myCompleted, weekStart, weekEnd]);

  const myMonthCompleted = useMemo(() => {
    return myCompleted.filter((m: any) => {
      if (!m.completedAtJs) return false;
      return isWithin(m.completedAtJs, monthStart, monthEnd);
    });
  }, [myCompleted, monthStart, monthEnd]);

  const weekExp = useMemo(
    () => myWeekCompleted.reduce((acc: number, m: any) => acc + (m.expValueNum || 0), 0),
    [myWeekCompleted]
  );

  const monthExp = useMemo(
    () => myMonthCompleted.reduce((acc: number, m: any) => acc + (m.expValueNum || 0), 0),
    [myMonthCompleted]
  );

  const totalCompleted = myCompleted.length;

  const hardCompletedTotal = useMemo(() => {
    return myCompleted.filter((m: any) => {
      const mode = (m.expMode as string | undefined) ?? "";
      const exp = m.expValueNum || 0;
      return mode === "hard" || exp >= 100;
    }).length;
  }, [myCompleted]);

  const createdTotal = useMemo(() => {
    const myId = uid ? String(uid) : null;
    if (!myId) return 0;
    return visibleMissions.filter(
      (m: any) => m.createdById === myId || m.assignedById === myId
    ).length;
  }, [visibleMissions, uid]);

  const missionsCompletedForOthers = useMemo(() => {
    const myId = uid ? String(uid) : null;
    if (!myId) return 0;
    return myCompleted.filter((m: any) => {
      const assignedTo = m.assignedToId ? String(m.assignedToId) : null;
      return !!assignedTo && assignedTo !== myId;
    }).length;
  }, [myCompleted, uid]);

  const missionsCompletedOnTime = useMemo(() => {
    return myCompleted.filter((m: any) => {
      const baseDate: Date | null = m.assignedAtJs || m.createdAtJs || null;
      const completedAt: Date | null = m.completedAtJs;
      if (!baseDate || !completedAt) return false;

      const start = new Date(baseDate);
      start.setHours(0, 0, 0, 0);
      const end = endOfDay(baseDate);

      return completedAt >= start && completedAt <= end;
    }).length;
  }, [myCompleted]);

  const streakDays = useMemo(() => {
    if (!myCompleted.length) return 0;

    const byDay = new Set<string>();
    myCompleted.forEach((m: any) => {
      const d: Date | null = m.completedAtJs;
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
      byDay.add(key);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let count = 0;
    let cursor = new Date(today);

    for (let i = 0; i < 365 * 2; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(cursor.getDate()).padStart(2, "0")}`;

      if (!byDay.has(key)) break;

      count++;
      cursor = addDays(cursor, -1);
    }

    return count;
  }, [myCompleted]);

  const mhStats: MHStats = useMemo(() => {
    return {
      missionsCompletedTotal: totalCompleted,
      missionsCompletedWeek: myWeekCompleted.length,
      missionsCompletedMonth: myMonthCompleted.length,
      totalExp: userDoc?.totalExp ?? 0,
      streakDays,
      missionsCreatedTotal: createdTotal,
      hardCompletedTotal,
      missionsCompletedForOthers,
      missionsCompletedOnTime,
    };
  }, [
    totalCompleted,
    myWeekCompleted.length,
    myMonthCompleted.length,
    userDoc?.totalExp,
    streakDays,
    createdTotal,
    hardCompletedTotal,
    missionsCompletedForOthers,
    missionsCompletedOnTime,
  ]);

  const myPhotoURL = auth.currentUser?.photoURL || null;
  const myDisplayName = auth.currentUser?.displayName || null;

  const myInitial = useMemo(() => {
    const base = myDisplayName || auth.currentUser?.email?.split("@")[0] || "U";
    return base.trim()?.[0]?.toUpperCase() || "U";
  }, [myDisplayName, auth.currentUser?.email]);

  const levelPack = useMemo(() => {
    return computeLevelProgress(userDoc?.totalExp ?? 0, userDoc?.level ?? 1);
  }, [userDoc?.totalExp, userDoc?.level]);

  const busy = missionsLoading || userLoading;

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: isSmall ? 12 : 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Header
          title="Osiągnięcia"
          subtitle="Twoje tytuły, progi i rozwój."
          colors={colors}
          onBack={() => router.back()}
        />

        {/* TOP SUMMARY — lekkie, czytelne */}
        <View
          style={[
            styles.topCard,
            styles.cardShadow,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.topRow}>
            <View
              style={[
                styles.avatarWrap,
                {
                  backgroundColor: colors.cardSoft || colors.bg,
                  borderColor: colors.border,
                },
              ]}
            >
              {myPhotoURL ? (
                <Image
                  source={{ uri: myPhotoURL }}
                  style={{ width: 44, height: 44, borderRadius: 14 }}
                />
              ) : (
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.accent + "22",
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.accent + "66",
                  }}
                >
                  <Text style={{ color: colors.accent, fontSize: 18, fontWeight: "900" }}>
                    {myInitial}
                  </Text>
                </View>
              )}

              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {myDisplayName
                    ? myDisplayName
                    : auth.currentUser?.email
                    ? auth.currentUser.email.split("@")[0]
                    : myInitial}
                </Text>
                <Text style={[styles.muted, { color: colors.textMuted }]}>
                  Poziom {levelPack.level} · Suma EXP {levelPack.exp}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            {busy ? (
              <View style={{ paddingVertical: 8 }}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : (
              <>
                <View style={styles.progressTopRow}>
                  <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
                    EXP do następnego poziomu
                  </Text>
                  <Text style={[styles.progressRight, { color: colors.text }]}>
                    {levelPack.toNext} EXP
                  </Text>
                </View>

                <ProgressBar
                  value={levelPack.pct}
                  colors={colors}
                  compact={false}
                  label={`EXP: ${levelPack.into}/${levelPack.span}`}
                />

                <View style={styles.chipsRow}>
                  <Chip colors={colors} icon="calendar-outline" label={`Tydzień +${weekExp} EXP`} />
                  <Chip colors={colors} icon="time-outline" label={`Miesiąc +${monthExp} EXP`} />
                  <Chip colors={colors} icon="flame" label={`Streak ${streakDays} dni`} tone="orange" />
                </View>
              </>
            )}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Twoje osiągnięcia</Text>

        <View style={styles.achList}>
          {ACHIEVEMENTS.map((a) => {
            const p = progressFor(mhStats, a);

            const tierName =
              p.tierIndex <= 0
                ? "Nieodblokowane"
                : a.tierNames[Math.min(p.tierIndex - 1, a.tierNames.length - 1)];

            const barMax = p.nextThreshold ?? p.currentThreshold;
            const barPct = percent(p.progress, barMax);

            const remaining =
              p.nextThreshold != null ? Math.max(0, p.nextThreshold - p.progress) : 0;

            const progressText =
              p.nextThreshold != null
                ? `${p.progress}/${p.nextThreshold}`
                : `${p.progress}/${p.currentThreshold}+`;

            return (
              <View
                key={a.id}
                style={[
                  styles.achCard,
                  styles.cardShadowSoft,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.achHeader}>
                  <View
                    style={[
                      styles.achIconWrap,
                      {
                        backgroundColor: colors.accent + "0A",
                        borderColor: colors.accent + "33",
                      },
                    ]}
                  >
                    <AchievementImage id={a.id} colors={colors} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.achTitleRow}>
                      <Text style={[styles.achTitle, { color: colors.text }]} numberOfLines={1}>
                        {a.label}
                      </Text>

                      <View
                        style={[
                          styles.tierPill,
                          {
                            backgroundColor: colors.cardSoft || colors.bg,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.tierPillText, { color: colors.text }]} numberOfLines={1}>
                          {tierName}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.achDesc, { color: colors.textMuted }]} numberOfLines={2}>
                      {a.description}
                    </Text>
                  </View>
                </View>

                {/* REAL PROGRESS */}
                <View style={{ marginTop: 10 }}>
                  <View style={styles.progressMeta}>
                    <Text style={[styles.metaLeft, { color: colors.textMuted }]}>
                      Postęp: <Text style={{ color: colors.text }}>{progressText}</Text>
                    </Text>

                    <Text style={[styles.metaRight, { color: colors.text }]}>
                      {barPct}%
                    </Text>
                  </View>

                  <ProgressBar value={barPct} colors={colors} compact label={undefined} />

                  {p.nextThreshold != null ? (
                    <Text style={[styles.metaHint, { color: colors.textMuted }]}>
                      Brakuje:{" "}
                      <Text style={{ color: colors.text, fontWeight: "900" }}>
                        {remaining}
                      </Text>
                    </Text>
                  ) : (
                    <Text style={[styles.metaHint, { color: colors.textMuted }]}>
                      Wszystkie progi zdobyte ✅
                    </Text>
                  )}

                  {/* THRESHOLDS — lekkie kropki */}
                  <View style={styles.dotsRow}>
                    {a.thresholds.map((t, idx) => {
                      const earned = idx < p.tierIndex;
                      const isNext = p.nextThreshold === t;
                      const dotBg = earned ? colors.accent : colors.border;

                      return (
                        <View key={`${a.id}_${t}`} style={styles.dotWrap}>
                          <View
                            style={[
                              styles.dot,
                              {
                                backgroundColor: dotBg,
                                opacity: earned ? 1 : 0.45,
                                transform: [{ scale: isNext ? 1.25 : 1 }],
                              },
                            ]}
                          />
                          {!isSmall && (
                            <Text
                              style={[
                                styles.dotLabel,
                                { color: earned ? colors.text : colors.textMuted },
                              ]}
                            >
                              {t}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

/* =========================
   COMPONENTS
========================= */

function Header({
  title,
  subtitle,
  colors,
  onBack,
}: {
  title: string;
  subtitle?: string;
  colors: ReturnType<typeof useThemeColors>["colors"];
  onBack: () => void;
}) {
  return (
    <View style={headerStyles.wrap}>
      <TouchableOpacity
        onPress={onBack}
        activeOpacity={0.85}
        style={headerStyles.backBtn}
      >
        <Ionicons name="arrow-back" size={18} color={colors.text} />
        <Text style={[headerStyles.backText, { color: colors.text }]}>
          Powrót
        </Text>
      </TouchableOpacity>

      <View style={headerStyles.titleCol}>
        <Text style={[headerStyles.title, { color: colors.text }]}>{title}</Text>
        {!!subtitle && (
          <Text style={[headerStyles.subtitle, { color: colors.textMuted }]}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={{ width: 80 }} />
    </View>
  );
}

function ProgressBar({
  value,
  colors,
  label,
  compact = false,
}: {
  value: number;
  colors: ReturnType<typeof useThemeColors>["colors"];
  label?: string;
  compact?: boolean;
}) {
  const pct = clampPct(value);
  const trackBg = colors.cardSoft || colors.bg;

  return (
    <View style={{ width: "100%", marginTop: label ? 6 : 0, marginBottom: compact ? 6 : 10 }}>
      {!!label && (
        <Text style={{ fontSize: 12, fontWeight: "800", color: colors.textMuted, marginBottom: 6 }}>
          {label}
        </Text>
      )}

      <View
        style={{
          width: "100%",
          height: compact ? 8 : 10,
          backgroundColor: trackBg,
          borderRadius: 999,
          overflow: "hidden",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: colors.accent,
          }}
        />
      </View>
    </View>
  );
}

function Chip({
  colors,
  icon,
  label,
  tone,
}: {
  colors: ReturnType<typeof useThemeColors>["colors"];
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: "orange";
}) {
  const bg = tone === "orange" ? "#f9731622" : colors.accent + "1F";
  const border = tone === "orange" ? "#f9731680" : colors.accent + "55";
  const fg = tone === "orange" ? "#f97316" : colors.accent;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: border,
      }}
    >
      <Ionicons name={icon} size={14} color={fg} />
      <Text style={{ marginLeft: 6, color: fg, fontSize: 11, fontWeight: "900" }}>
        {label}
      </Text>
    </View>
  );
}

/* =========================
   STYLES
========================= */

const styles = StyleSheet.create({
  page: { flex: 1 },

  scroll: {
    paddingTop: 14,
    paddingBottom: 30,
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
  },

  cardShadow: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 2 },
    default: {},
  }),

  cardShadowSoft: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 1 },
    default: {},
  }),

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginTop: 10,
    marginBottom: 10,
  },

  /* Top card */
  topCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  avatarWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },

  name: { fontSize: 15, fontWeight: "900" },
  muted: { fontSize: 12, fontWeight: "800", marginTop: 2 },

  progressTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  progressLabel: { fontSize: 12, fontWeight: "800" },
  progressRight: { fontSize: 12, fontWeight: "900" },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },

  /* Ach cards */
  achList: { gap: 12 },

  achCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
  },

  achHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  achIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },

  achTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  achTitle: { fontSize: 15, fontWeight: "900" },

  tierPill: {
    maxWidth: 150,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tierPillText: { fontSize: 11, fontWeight: "900" },

  achDesc: {
    fontSize: 12,
    fontWeight: "800",
    opacity: 0.95,
    marginTop: 4,
  },

  progressMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metaLeft: { fontSize: 12, fontWeight: "800" },
  metaRight: { fontSize: 12, fontWeight: "900" },
  metaHint: { fontSize: 12, fontWeight: "800", marginTop: 2 },

  dotsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
    alignItems: "center",
  },

  dotWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },

  dotLabel: {
    fontSize: 11,
    fontWeight: "800",
  },
});

const headerStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    minHeight: 40,
  },

  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 10,
  },

  backText: { fontWeight: "900", fontSize: 14 },

  titleCol: { flex: 1, paddingHorizontal: 6 },

  title: { fontSize: 20, fontWeight: "900", textAlign: "center" },

  subtitle: { fontSize: 12, fontWeight: "800", opacity: 0.9, textAlign: "center" },
});
