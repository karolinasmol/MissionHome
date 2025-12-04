// app/stats.tsx
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useThemeColors } from "../src/context/ThemeContext";
import { useMissions } from "../src/hooks/useMissions";
import { useFamily } from "../src/hooks/useFamily";

import { db } from "../src/firebase/firebase.web";
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
  for (let l = 1; l < level; l++) {
    const gainForThisLevelUp = 100 + 50 * (l - 1);
    total += gainForThisLevelUp;
  }
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
   Achievements definitions
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
  icon: keyof typeof Ionicons.glyphMap;
  statKey: StatKey;
  thresholds: number[];
  tierNames: string[];
};

const ACHIEVEMENTS: Achievement[] = [
  {
    id: "done_total",
    label: "Wykonawca",
    description: "Wykonuj zadania i utrzymuj tempo.",
    icon: "checkmark-circle-outline",
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
    icon: "sparkles-outline",
    statKey: "totalExp",
    thresholds: [500, 1500, 3000, 6000, 10000, 20000],
    tierNames: ["Iskra", "Rozbłysk", "Napęd", "Turbo", "Weteran", "Potęga"],
  },
  {
    id: "streak",
    label: "Streak",
    description: "Rób cokolwiek codziennie - choć jedno wykonane zadanie.",
    icon: "flame-outline",
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
    icon: "create-outline",
    statKey: "missionsCreatedTotal",
    thresholds: [20, 80, 200, 500, 1200],
    tierNames: ["Planer", "Koordynator", "Szef kuchni", "Dyrygent", "Architekt"],
  },
  {
    id: "hard",
    label: "Hardcore",
    description: "Wykonuj trudne misje (hard / ≥100 EXP).",
    icon: "skull-outline",
    statKey: "hardCompletedTotal",
    thresholds: [10, 30, 80, 180, 350],
    tierNames: ["Odważny", "Twardziel", "Niezły zawodnik", "Czołg", "Boss"],
  },
  {
    id: "help",
    label: "Pomocna dłoń",
    description: "Wykonuj misje dla innych członków rodziny.",
    icon: "hand-left-outline",
    statKey: "missionsCompletedForOthers",
    thresholds: [5, 20, 60, 150, 400],
    tierNames: ["Miły", "Wsparcie", "Dobrodziej", "Ostoja", "Filantrop"],
  },
  {
    id: "ontime",
    label: "Perfekcjonista",
    description: "Wykonuj misje na czas (tego samego dnia).",
    icon: "time-outline",
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
export default function StatsScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();

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

  /* --- Auth listener --- */
  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => off();
  }, []);

  /* --- User document listener --- */
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

  /* =========================
     Normalize missions
  ========================== */

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
          (m as any)?.createdAt ?? (m as any)?.createdAtTs ?? (m as any)?.createdDate
        ),
      }));
  }, [missions]);

  /* =========================
     Family filter
  ========================== */

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

  /* =========================
     Filter: missions assigned TO me
  ========================== */

  const myMissions = useMemo(() => {
    const myId = uid ? String(uid) : null;
    if (!myId) return [];
    return visibleMissions.filter((m: any) => m.assignedToId === myId);
  }, [visibleMissions, uid]);

  // misje, które JA faktycznie ukończyłem
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

  /* =========================
     EXP calculations
  ========================== */

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

  /* =========================
     Dodatkowe statystyki
  ========================== */

  // Pomocna dłoń – misje ukończone przeze mnie, które były zadaniami innych
  const missionsCompletedForOthers = useMemo(() => {
    const myId = uid ? String(uid) : null;
    if (!myId) return 0;
    return myCompleted.filter((m: any) => {
      const assignedTo = m.assignedToId ? String(m.assignedToId) : null;
      return !!assignedTo && assignedTo !== myId;
    }).length;
  }, [myCompleted, uid]);

  // Perfekcjonista – misje ukończone w dniu przydzielenia / stworzenia
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

  /* =========================
     Streak calculation
  ========================== */

  const streakDays = useMemo(() => {
    if (!myCompleted.length) return 0;

    const byDay = new Set<string>();
    myCompleted.forEach((m: any) => {
      const d: Date | null = m.completedAtJs;
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getDate()).padStart(2, "0")}`;
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

  /* =========================
     Summary stats
  ========================== */

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

  /* =========================
     🔥 UPDATED: Nick + Initial
  ========================== */

  const myPhotoURL = auth.currentUser?.photoURL || null;
  const myDisplayName = auth.currentUser?.displayName || null;

  const myInitial = useMemo(() => {
    const base =
      myDisplayName || auth.currentUser?.email?.split("@")[0] || "U";
    return base.trim()?.[0]?.toUpperCase() || "U";
  }, [myDisplayName, auth.currentUser?.email]);

  const levelPack = useMemo(() => {
    return computeLevelProgress(userDoc?.totalExp ?? 0, userDoc?.level ?? 1);
  }, [userDoc?.totalExp, userDoc?.level]);

  const busy = missionsLoading || userLoading;

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Header
          title="Osiągnięcia"
          subtitle="EXP, poziom i osiągnięcia - wszystko w jednym miejscu."
          colors={colors}
          onBack={() => router.back()}
        />

        {/* =========================
            SUMMARY BOX
        ========================== */}
        <View
          style={[
            styles.summary,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.summaryLeft}>
            {/* 🔥 UPDATED PROFILE BOX */}
            <View
              style={[
                styles.rankBadge,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.cardSoft || colors.bg,
                },
              ]}
            >
              {myPhotoURL ? (
                <Image
                  source={{ uri: myPhotoURL }}
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 14,
                    backgroundColor: colors.bg,
                  }}
                />
              ) : (
                <View
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.accent + "22",
                    borderWidth: 1,
                    borderColor: colors.accent + "66",
                  }}
                >
                  <Text
                    style={{
                      color: colors.accent,
                      fontSize: 22,
                      fontWeight: "900",
                    }}
                  >
                    {myInitial}
                  </Text>
                </View>
              )}

              <View style={{ marginLeft: 10 }}>
                <Text style={[styles.rankName, { color: colors.text }]}>
                  {myDisplayName
                    ? myDisplayName
                    : auth.currentUser?.email
                    ? auth.currentUser.email.split("@")[0]
                    : myInitial}
                </Text>

                <Text style={[styles.pointsSub, { color: colors.textMuted }]}>
                  Statystyki użytkownika
                </Text>
              </View>
            </View>

            <View style={{ flex: 1 }}>
              {busy ? (
                <View style={{ paddingVertical: 6 }}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : (
                <>
                  <Text style={[styles.points, { color: colors.text }]}>
                    Poziom {levelPack.level}
                  </Text>

                  <Text style={[styles.pointsSub, { color: colors.textMuted }]}>
                    EXP {levelPack.into}/{levelPack.span}
                  </Text>

                  <Text style={[styles.pointsSub, { color: colors.textMuted }]}>
                    Suma EXP: {levelPack.exp}
                  </Text>

                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      marginTop: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <Chip
                      colors={colors}
                      icon="calendar-outline"
                      label={`Ten tydzień: +${weekExp} EXP`}
                    />
                    <Chip
                      colors={colors}
                      icon="time-outline"
                      label={`Ten miesiąc: +${monthExp} EXP`}
                    />
                    <Chip
                      colors={colors}
                      icon="flame"
                      label={`Streak: ${streakDays} dni`}
                      tone="orange"
                    />
                  </View>
                </>
              )}
            </View>
          </View>

          <View style={styles.summaryRight}>
            <View
              style={[
                styles.toNextBox,
                {
                  backgroundColor: colors.accent + "22",
                  borderColor: colors.accent + "66",
                },
              ]}
            >
              <Text
                style={{ color: colors.accent, fontSize: 11, fontWeight: "900" }}
              >
                Do LVL {levelPack.level + 1}: {levelPack.toNext} EXP
              </Text>
            </View>
          </View>
        </View>

        <ProgressBar
          value={levelPack.pct}
          colors={colors}
          label={`EXP: ${levelPack.into}/${levelPack.span} (Poziom ${
            levelPack.level
          } → ${levelPack.level + 1})`}
        />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Twoje osiągnięcia
        </Text>

        {/* =========================
            ACHIEVEMENTS LIST
        ========================== */}

        <View style={styles.achList}>
          {ACHIEVEMENTS.map((a) => {
            const p = progressFor(mhStats, a);
            const tierName =
              p.tierIndex <= 0
                ? "-"
                : a.tierNames[Math.min(p.tierIndex - 1, a.tierNames.length - 1)];

            const nextLabel =
              p.nextThreshold != null
                ? `${p.progress}/${p.nextThreshold}`
                : `${p.currentThreshold}+`;

            const barMax = p.nextThreshold ?? p.currentThreshold;
            const barPct = percent(p.progress, barMax);

            const unlocked = p.tierIndex > 0;

            return (
              <View
                key={a.id}
                style={[
                  styles.achItem,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor: colors.accent + "22",
                      borderColor: colors.accent + "55",
                    },
                  ]}
                >
                  <Ionicons name={a.icon} size={22} color={colors.accent} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.achTitle, { color: colors.text }]}>
                    {a.label}
                  </Text>
                  <Text style={[styles.achDesc, { color: colors.textMuted }]}>
                    {a.description}
                  </Text>

                  <Text
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      fontWeight: "900",
                      color: unlocked ? colors.text : colors.textMuted,
                    }}
                  >
                    Aktualny tytuł: {tierName}
                  </Text>

                  <ProgressBar
                    value={barPct}
                    colors={colors}
                    compact
                    label={`Postęp: ${nextLabel}`}
                  />

                  <View style={styles.tiersRow}>
                    {a.thresholds.map((t, idx) => {
                      const earnedThisTier = idx < p.tierIndex;
                      const activeTier = idx === p.tierIndex && p.progress >= t;
                      const active = earnedThisTier || activeTier;

                      return (
                        <View
                          key={`${a.id}_${t}`}
                          style={[
                            styles.tierBadge,
                            {
                              borderColor: colors.border,
                              backgroundColor: active ? colors.accent : colors.bg,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.tierBadgeText,
                              {
                                color: active ? "#022c22" : colors.textMuted,
                              },
                            ]}
                          >
                            {t}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  {p.nextThreshold != null ? (
                    <Text
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        fontWeight: "900",
                        color: colors.textMuted,
                      }}
                    >
                      Następny próg:{" "}
                      <Text style={{ color: colors.text }}>{p.nextThreshold}</Text>
                    </Text>
                  ) : (
                    <Text
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        fontWeight: "900",
                        color: colors.textMuted,
                      }}
                    >
                      Wszystkie progi zdobyte ✅
                    </Text>
                  )}
                </View>

                <View style={styles.pointsCol}>
                  <Text style={[styles.pointsEarned, { color: colors.text }]}>
                    {p.progress}
                  </Text>
                  <Text style={[styles.pointsHint, { color: colors.textMuted }]}>
                    wartość
                  </Text>
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
   HELPER COMPONENTS
========================= */

function Header({ title, subtitle, colors, onBack }) {
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

      <View style={{ width: 90 }} />
    </View>
  );
}

function ProgressBar({ value, colors, label, compact = false }) {
  const pct = clampPct(value);

  return (
    <View style={{ width: "100%", marginBottom: compact ? 10 : 14 }}>
      {!!label && (
        <Text
          style={{
            fontSize: 12,
            fontWeight: "900",
            marginBottom: 6,
            color: colors.textMuted,
          }}
        >
          {label}
        </Text>
      )}

      <View
        style={{
          width: "100%",
          height: compact ? 8 : 12,
          backgroundColor: "#020617",
          borderRadius: 999,
          overflow: "hidden",
          borderWidth: 1,
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

function Chip({ colors, icon, label, tone }) {
  const bg = tone === "orange" ? "#f9731622" : colors.accent + "22";
  const border = tone === "orange" ? "#f9731688" : colors.accent + "55";
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
        borderWidth: 1,
        borderColor: border,
      }}
    >
      <Ionicons name={icon} size={14} color={fg} />
      <Text
        style={{
          marginLeft: 6,
          color: fg,
          fontSize: 11,
          fontWeight: "900",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/* =========================
   STYLES
========================= */

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: Platform.OS === "web" ? ("100vh" as any) : undefined,
  },

  scroll: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 30,
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
  },

  summary: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  summaryLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  /* PROFILE BOX */
  rankBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },

  rankName: { fontSize: 15, fontWeight: "900" },
  points: { fontSize: 22, fontWeight: "900" },
  pointsSub: { fontSize: 12, fontWeight: "800" },

  summaryRight: { alignItems: "flex-end", justifyContent: "center" },

  toNextBox: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
    marginBottom: 10,
    textAlign: "left",
  },

  achList: { gap: 14 },

  achItem: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },

  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },

  achTitle: { fontSize: 14, fontWeight: "900" },
  achDesc: { fontSize: 12, fontWeight: "800", opacity: 0.92, marginTop: 2 },

  tiersRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },

  tierBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },

  tierBadgeText: { fontSize: 12, fontWeight: "900" },

  pointsCol: { width: 74, alignItems: "flex-end" },
  pointsEarned: { fontSize: 16, fontWeight: "900" },
  pointsHint: { fontSize: 11, fontWeight: "800", opacity: 0.9 },
});
/* HEADER */
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
