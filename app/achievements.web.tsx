// app/stats.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Animated,
  Easing,
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
    description: "Rób cokolwiek codziennie - choć jedno wykonane zadanie.",
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
    description: "Wykonuj trudne misje (hard / ≥100 EXP).",
    statKey: "hardCompletedTotal",
    thresholds: [10, 30, 80, 180, 350],
    tierNames: ["Odważny", "Twardziel", "Niezły zawodnik", "Czołg", "Boss"],
  },
  {
    id: "help",
    label: "Pomocna dłoń",
    description: "Wykonuj misje dla innych członków rodziny.",
    statKey: "missionsCompletedForOthers",
    thresholds: [5, 20, 60, 150, 400],
    tierNames: ["Miły", "Wsparcie", "Dobrodziej", "Ostoja", "Filantrop"],
  },
  {
    id: "ontime",
    label: "Perfekcjonista",
    description: "Wykonuj misje na czas (tego samego dnia).",
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
  return { nextThreshold, progress, tierIndex, currentThreshold };
}

function percent(val: number, max?: number | null) {
  if (!max || max <= 0) return 100;
  return clampPct((val / max) * 100);
}

function computeNextTier(a: Achievement, p: ReturnType<typeof progressFor>) {
  if (p.nextThreshold == null) {
    const lastTier =
      a.tierNames[Math.max(0, Math.min(a.tierNames.length - 1, p.tierIndex - 1))] ?? "—";
    return {
      hasNext: false as const,
      nextTierName: null as string | null,
      lastTierName: lastTier,
      remaining: 0,
      nextThreshold: null as number | null,
    };
  }

  const nextTierName =
    a.tierNames[Math.max(0, Math.min(a.tierNames.length - 1, p.tierIndex))] ??
    a.tierNames[a.tierNames.length - 1] ??
    "—";

  const remaining = Math.max(0, Math.floor(p.nextThreshold - p.progress));

  return {
    hasNext: true as const,
    nextTierName,
    lastTierName: null as string | null,
    remaining,
    nextThreshold: p.nextThreshold,
  };
}

/* =========================
   Czytelne etykiety licznika (“wartość”)
========================= */

function statMeta(statKey: StatKey) {
  switch (statKey) {
    case "missionsCompletedTotal":
      return { label: "Wykonane", icon: "checkmark-done-outline" as const };
    case "totalExp":
      return { label: "EXP", icon: "flash-outline" as const };
    case "streakDays":
      return { label: "Dni z rzędu", icon: "flame-outline" as const };
    case "missionsCreatedTotal":
      return { label: "Utworzone", icon: "create-outline" as const };
    case "hardCompletedTotal":
      return { label: "Hardy", icon: "skull-outline" as const };
    case "missionsCompletedForOthers":
      return { label: "Dla innych", icon: "hand-left-outline" as const };
    case "missionsCompletedOnTime":
      return { label: "Na czas", icon: "time-outline" as const };
    case "missionsCompletedWeek":
      return { label: "W tym tyg.", icon: "calendar-outline" as const };
    case "missionsCompletedMonth":
      return { label: "W tym mies.", icon: "calendar-number-outline" as const };
    default:
      return { label: "Licznik", icon: "stats-chart-outline" as const };
  }
}

/* =========================
   Obrazki rang
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
  size,
}: {
  id: string;
  colors: ReturnType<typeof useThemeColors>["colors"];
  size: number;
}) {
  const src = ACHIEVEMENT_IMAGES[id];

  if (!src) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.accent + "18",
          borderWidth: 1,
          borderColor: colors.accent + "44",
        }}
      >
        <Text style={{ color: colors.accent, fontSize: 10, fontWeight: "900" }}>{id}</Text>
      </View>
    );
  }

  return (
    <Image
      source={src}
      style={{
        width: size,
        height: size,
        borderRadius: 16,
        resizeMode: "cover",
      }}
    />
  );
}

/* =========================
   UI Bits
========================= */

function softShadow(colors: any) {
  const native =
    Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOpacity: 0.16,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 10 },
        }
      : Platform.OS === "android"
      ? { elevation: 4 }
      : null;

  const web =
    Platform.OS === "web"
      ? ({
          boxShadow: "0 14px 34px rgba(0,0,0,0.18)",
        } as any)
      : null;

  return {
    ...(native as any),
    ...(web as any),
    borderColor: colors.border,
  };
}

function GlassCard({
  children,
  colors,
  style,
}: {
  children: React.ReactNode;
  colors: any;
  style?: any;
}) {
  const webGlass =
    Platform.OS === "web"
      ? ({
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        } as any)
      : null;

  return (
    <View
      style={[
        styles.cardBase,
        {
          backgroundColor: Platform.OS === "web" ? colors.card + "E6" : colors.card,
          ...softShadow(colors),
        },
        webGlass as any,
        style,
      ]}
    >
      <View pointerEvents="none" style={[styles.cardTopLine, { backgroundColor: colors.accent + "55" }]} />
      {children}
    </View>
  );
}

function Pill({
  colors,
  icon,
  label,
  tone = "accent",
}: {
  colors: any;
  icon: any;
  label: string;
  tone?: "accent" | "orange" | "muted";
}) {
  const bg =
    tone === "orange"
      ? "#f973161a"
      : tone === "muted"
      ? colors.border + "18"
      : colors.accent + "16";

  const border =
    tone === "orange"
      ? "#f9731677"
      : tone === "muted"
      ? colors.border + "4F"
      : colors.accent + "55";

  const fg =
    tone === "orange" ? "#f97316" : tone === "muted" ? colors.textMuted : colors.accent;

  return (
    <View style={[ui.pill, { backgroundColor: bg, borderColor: border }]}>
      <Ionicons name={icon} size={14} color={fg} />
      <Text style={[ui.pillText, { color: fg }]} numberOfLines={1} ellipsizeMode="tail">
        {label}
      </Text>
    </View>
  );
}

function ProgressBar({
  value,
  colors,
  compact = false,
}: {
  value: number;
  colors: any;
  compact?: boolean;
}) {
  const pct = clampPct(value);
  return (
    <View
      style={[
        ui.progressTrack,
        {
          height: compact ? 9 : 12,
          borderColor: colors.border,
          backgroundColor: colors.cardSoft || colors.bg,
        },
      ]}
    >
      <View style={[ui.progressFill, { width: `${pct}%`, backgroundColor: colors.accent }]} />
      <View pointerEvents="none" style={[ui.progressShine, { backgroundColor: "#fff", opacity: 0.08 }]} />
    </View>
  );
}

function TierSegments({
  total,
  active,
  colors,
}: {
  total: number;
  active: number;
  colors: any;
}) {
  const segments = Array.from({ length: total }, (_, i) => i);
  return (
    <View style={ui.segRow}>
      {segments.map((i) => {
        const on = i < active;
        return (
          <View
            key={i}
            style={[
              ui.seg,
              {
                backgroundColor: on ? colors.accent : colors.border + "40",
                borderColor: on ? colors.accent : colors.border + "88",
                opacity: on ? 1 : 0.9,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function MiniChip({
  label,
  colors,
  tone = "muted",
}: {
  label: string;
  colors: any;
  tone?: "muted" | "accent";
}) {
  const bg = tone === "accent" ? colors.accent + "14" : colors.border + "16";
  const border = tone === "accent" ? colors.accent + "4F" : colors.border + "44";
  const fg = tone === "accent" ? colors.accent : colors.textMuted;

  return (
    <View style={[ui.chip, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[ui.chipText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Header({
  title,
  subtitle,
  colors,
  onBack,
  stacked,
}: {
  title: string;
  subtitle?: string;
  colors: any;
  onBack: () => void;
  stacked: boolean;
}) {
  return (
    <View style={[header.wrap, stacked && header.wrapStack]}>
      <TouchableOpacity
        onPress={onBack}
        activeOpacity={0.85}
        style={[header.backBtn, { borderColor: colors.border, backgroundColor: colors.cardSoft || "transparent" }]}
      >
        <Ionicons name="arrow-back" size={18} color={colors.text} />
        <Text style={[header.backText, { color: colors.text }]}>Powrót</Text>
      </TouchableOpacity>

      <View style={header.titleCol}>
        <Text style={[header.title, { color: colors.text }, stacked && { textAlign: "left" }]} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text
            style={[header.subtitle, { color: colors.textMuted }, stacked && { textAlign: "left" }]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        )}
      </View>

      <View style={{ width: stacked ? 0 : 84 }} />
    </View>
  );
}

/* =========================
   Pulsujący “interaktywny” wrap dla ikonek
========================= */

function PulseWrap({
  children,
  colors,
  intensity = 1,
}: {
  children: React.ReactNode;
  colors: any;
  intensity?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const sUp = 1 + 0.04 * intensity;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: sUp,
            duration: 1200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(glow, {
            toValue: 0.62,
            duration: 1200,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 1200,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(glow, {
            toValue: 0.35,
            duration: 1200,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [scale, glow, intensity]);

  return (
    <View style={{ position: "relative" }}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulseGlow,
          {
            backgroundColor: colors.accent + "22",
            opacity: glow,
            transform: [{ scale: scale }],
            ...(Platform.OS === "web" ? ({ filter: "blur(14px)" } as any) : null),
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </View>
  );
}

/* =========================
   Screen
========================= */

export default function StatsScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { width } = useWindowDimensions();

  const [isMobileWeb, setIsMobileWeb] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    try {
      const ua = (globalThis as any)?.navigator?.userAgent ?? "";
      setIsMobileWeb(/Android|iPhone|iPad|iPod|Mobile/i.test(ua));
    } catch {
      setIsMobileWeb(false);
    }
  }, []);

  const isSM = width < 520 || isMobileWeb;
  const isMD = width >= 520 && width < 980;

  const containerMaxWidth = 1060;
  const padH = isSM ? 12 : isMD ? 16 : 22;

  // ✅ SZERSZE KARTY OSIĄGNIĘĆ
  // było: const achMaxWidth = isSM ? containerMaxWidth : 880;
  const achMaxWidth = isSM ? containerMaxWidth : isMD ? 980 : containerMaxWidth;

  const iconSize = isSM ? 42 : 46;
  const iconWrap = isSM ? 54 : 60;

  const { missions, loading: missionsLoading } = useMissions();
  const { members } = useFamily();

  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [userDoc, setUserDoc] = useState<{ level: number; totalExp: number } | null>(null);
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
          (m as any)?.assignedAt ?? (m as any)?.assignedAtTs ?? (m as any)?.assignedDate ?? null
        ),
        createdAtJs: toJsDate((m as any)?.createdAt ?? (m as any)?.createdAtTs ?? (m as any)?.createdDate),
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

  const visibleMissions = useMemo(() => normalizedMissions.filter(isMineForStats), [normalizedMissions, isMineForStats]);

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

  const myWeekCompleted = useMemo(
    () => myCompleted.filter((m: any) => !!m.completedAtJs && isWithin(m.completedAtJs, weekStart, weekEnd)),
    [myCompleted, weekStart, weekEnd]
  );

  const myMonthCompleted = useMemo(
    () => myCompleted.filter((m: any) => !!m.completedAtJs && isWithin(m.completedAtJs, monthStart, monthEnd)),
    [myCompleted, monthStart, monthEnd]
  );

  const weekExp = useMemo(() => myWeekCompleted.reduce((acc: number, m: any) => acc + (m.expValueNum || 0), 0), [
    myWeekCompleted,
  ]);

  const monthExp = useMemo(() => myMonthCompleted.reduce((acc: number, m: any) => acc + (m.expValueNum || 0), 0), [
    myMonthCompleted,
  ]);

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
    return visibleMissions.filter((m: any) => m.createdById === myId || m.assignedById === myId).length;
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
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(
        2,
        "0"
      )}`;
      byDay.add(key);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let count = 0;
    let cursor = new Date(today);

    for (let i = 0; i < 365 * 2; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
        cursor.getDate()
      ).padStart(2, "0")}`;
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

  const levelPack = useMemo(() => computeLevelProgress(userDoc?.totalExp ?? 0, userDoc?.level ?? 1), [
    userDoc?.totalExp,
    userDoc?.level,
  ]);

  const busy = missionsLoading || userLoading;
  const orbBlur = Platform.OS === "web" ? ({ filter: "blur(48px)" } as any) : null;

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      {/* TŁO */}
      <View pointerEvents="none" style={styles.bgOrbs}>
        <View
          style={{
            position: "absolute",
            width: 340,
            height: 340,
            borderRadius: 999,
            backgroundColor: colors.accent + "26",
            top: -160,
            left: -140,
            opacity: 1,
            ...(orbBlur as any),
          }}
        />
        <View
          style={{
            position: "absolute",
            width: 280,
            height: 280,
            borderRadius: 999,
            backgroundColor: "#22c55e20",
            top: -110,
            right: -140,
            ...(orbBlur as any),
          }}
        />
        <View
          style={{
            position: "absolute",
            width: 240,
            height: 240,
            borderRadius: 999,
            backgroundColor: "#a855f71c",
            top: 210,
            left: -110,
            ...(orbBlur as any),
          }}
        />
        <View
          style={{
            position: "absolute",
            width: 320,
            height: 320,
            borderRadius: 999,
            backgroundColor: "#0ea5e91c",
            top: 440,
            right: -170,
            ...(orbBlur as any),
          }}
        />
        <View
          style={{
            position: "absolute",
            width: 200,
            height: 200,
            borderRadius: 999,
            backgroundColor: "#f973161a",
            top: 760,
            left: 40,
            ...(orbBlur as any),
          }}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: padH, maxWidth: containerMaxWidth }]}
        style={{ zIndex: 1 }}
      >
        <Header
          title="Osiągnięcia"
          subtitle="EXP, poziom i osiągnięcia - wszystko w jednym miejscu."
          colors={colors}
          onBack={() => router.back()}
          stacked={isSM}
        />

        {/* HERO */}
        <GlassCard colors={colors}>
          <View style={[styles.heroRow, isSM && styles.heroRowStack]}>
            {/* PROFILE */}
            <View style={[styles.profileBox, { borderColor: colors.border, backgroundColor: colors.cardSoft || colors.bg }]}>
              <View style={styles.avatarCol}>
                <View
                  pointerEvents="none"
                  style={[
                    styles.avatarGlow,
                    {
                      backgroundColor: colors.accent + "22",
                      ...(Platform.OS === "web" ? ({ filter: "blur(16px)" } as any) : null),
                    },
                  ]}
                />
                {myPhotoURL ? (
                  <Image
                    source={{ uri: myPhotoURL }}
                    style={[
                      styles.avatar,
                      {
                        backgroundColor: colors.bg,
                        width: isSM ? 54 : 60,
                        height: isSM ? 54 : 60,
                        borderColor: colors.border,
                      },
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      {
                        width: isSM ? 54 : 60,
                        height: isSM ? 54 : 60,
                        backgroundColor: colors.accent + "14",
                        borderColor: colors.accent + "55",
                        borderWidth: 1,
                        alignItems: "center",
                        justifyContent: "center",
                      },
                    ]}
                  >
                    <Text style={{ color: colors.accent, fontSize: isSM ? 20 : 22, fontWeight: "900" }}>{myInitial}</Text>
                  </View>
                )}
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
                  {myDisplayName
                    ? myDisplayName
                    : auth.currentUser?.email
                    ? auth.currentUser.email.split("@")[0]
                    : myInitial}
                </Text>

                <View style={styles.profileSubRow}>
                  <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
                    Statystyki użytkownika
                  </Text>
                  <View style={[styles.dot, { backgroundColor: colors.border }]} />
                  <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
                    {totalCompleted} zadań
                  </Text>
                </View>
              </View>
            </View>

            {/* LEVEL */}
            <View style={{ flex: 1, minWidth: 0 }}>
              {busy ? (
                <View style={{ paddingVertical: 18 }}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : (
                <>
                  <View style={styles.levelTop}>
                    <View style={{ minWidth: 0, flexShrink: 1 }}>
                      <Text style={[styles.levelTitle, { color: colors.text }]} numberOfLines={1}>
                        Poziom {levelPack.level}
                      </Text>
                      <Text style={[styles.levelMeta, { color: colors.textMuted }]} numberOfLines={1}>
                        EXP w poziomie: {levelPack.into}/{levelPack.span} • Suma: {levelPack.exp}
                      </Text>
                    </View>

                    <Pill
                      colors={colors}
                      icon="trending-up-outline"
                      label={`Do LVL ${levelPack.level + 1}: ${levelPack.toNext} EXP`}
                      tone="muted"
                    />
                  </View>

                  <ProgressBar value={levelPack.pct} colors={colors} />

                  <View style={styles.pillsRow}>
                    <Pill colors={colors} icon="calendar-outline" label={`+${weekExp} EXP / tydz.`} />
                    <Pill colors={colors} icon="time-outline" label={`+${monthExp} EXP / mies.`} />
                    <Pill colors={colors} icon="flame" label={`Streak: ${streakDays} dni`} tone="orange" />
                  </View>
                </>
              )}
            </View>
          </View>
        </GlassCard>

        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Twoje osiągnięcia</Text>
          <View style={[styles.sectionBadge, { backgroundColor: colors.border + "18", borderColor: colors.border + "44" }]}>
            <Ionicons name="trophy-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.sectionBadgeText, { color: colors.textMuted }]}>{ACHIEVEMENTS.length} kategorii</Text>
          </View>
        </View>

        {/* LIST */}
        <View style={styles.list}>
          {ACHIEVEMENTS.map((a) => {
            const p = progressFor(mhStats, a);
            const n = computeNextTier(a, p);

            const currentTierName =
              p.tierIndex <= 0 ? "—" : a.tierNames[Math.min(p.tierIndex - 1, a.tierNames.length - 1)];

            const barMax = p.nextThreshold ?? p.currentThreshold;
            const barPct = percent(p.progress, barMax);

            const progressLabel = p.nextThreshold != null ? `${p.progress}/${p.nextThreshold}` : `${p.currentThreshold}+`;

            const isMaxed = !n.hasNext;
            const railColor = isMaxed ? "#22c55e" : colors.accent;

            const meta = statMeta(a.statKey);

            return (
              <View
                key={a.id}
                style={[
                  styles.achCard,
                  {
                    backgroundColor: Platform.OS === "web" ? colors.card + "E6" : colors.card,
                    borderColor: colors.border,
                    ...(softShadow(colors) as any),
                    maxWidth: achMaxWidth,
                    alignSelf: "center",
                  },
                  Platform.OS === "web"
                    ? ({
                        backdropFilter: "blur(10px)",
                        WebkitBackdropFilter: "blur(10px)",
                      } as any)
                    : null,
                ]}
              >
                {/* Accent rail */}
                <View pointerEvents="none" style={[styles.achRail, { backgroundColor: railColor + "55", borderColor: railColor + "66" }]} />

                <View style={styles.achRow}>
                  {/* ICON */}
                  <View
                    style={[
                      styles.iconWrap,
                      {
                        width: isSM ? 56 : 62,
                        height: isSM ? 56 : 62,
                        borderColor: colors.border,
                        backgroundColor: colors.accent + "0E",
                      },
                    ]}
                  >
                    <PulseWrap colors={colors} intensity={isMaxed ? 0.7 : 1.2}>
                      <AchievementImage id={a.id} colors={{ ...colors }} size={isSM ? 44 : 48} />
                    </PulseWrap>

                    <View
                      style={[
                        styles.cornerBadge,
                        {
                          backgroundColor: isMaxed ? "#22c55e22" : colors.accent + "1A",
                          borderColor: isMaxed ? "#22c55e66" : colors.accent + "55",
                        },
                      ]}
                    >
                      <Ionicons name={isMaxed ? "checkmark" : "sparkles-outline"} size={12} color={isMaxed ? "#22c55e" : colors.accent} />
                    </View>
                  </View>

                  {/* CONTENT */}
                  <View style={[styles.achContentRow, isSM && styles.achContentRowStack]}>
                    {/* LEFT */}
                    <View style={styles.achMainCol}>
                      <View style={styles.achHeaderRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.achTitle, { color: colors.text }]} numberOfLines={1}>
                            {a.label}
                          </Text>
                          <Text style={[styles.achDesc, { color: colors.textMuted }]} numberOfLines={2}>
                            {a.description}
                          </Text>
                        </View>

                        <View style={styles.valueBox}>
                          <Text style={[styles.valueNum, { color: colors.text }]} numberOfLines={1}>
                            {p.progress}
                          </Text>
                          <View style={styles.valueSubRow}>
                            <Ionicons name={meta.icon} size={13} color={colors.textMuted} />
                            <Text style={[styles.valueSub, { color: colors.textMuted }]} numberOfLines={1}>
                              {meta.label}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.chipsRow}>
                        <MiniChip label={`Tytuł: ${currentTierName}`} colors={colors} tone="muted" />
                        <MiniChip label={`Tier: ${p.tierIndex}/${a.thresholds.length}`} colors={colors} tone="accent" />
                      </View>
                    </View>

                    {/* RIGHT */}
                    <View
                      style={[
                        styles.achMetaCol,
                        isSM ? { borderTopColor: colors.border + "55" } : { borderLeftColor: colors.border + "55" },
                      ]}
                    >
                      <View style={styles.metaTopRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          {n.hasNext ? (
                            <>
                              <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={2}>
                                Kolejny tytuł: <Text style={{ color: colors.text, fontWeight: "900" }}>{n.nextTierName}</Text>
                              </Text>
                              <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={2}>
                                Próg: <Text style={{ color: colors.text, fontWeight: "900" }}>{n.nextThreshold}</Text> • Brakuje:{" "}
                                <Text style={{ color: colors.text, fontWeight: "900" }}>{n.remaining}</Text>
                              </Text>
                            </>
                          ) : (
                            <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={2}>
                              Wszystkie progi zdobyte ✅
                            </Text>
                          )}
                        </View>

                        <View style={[styles.kpiPill, { borderColor: colors.border, backgroundColor: colors.border + "12" }]}>
                          <Ionicons name="speedometer-outline" size={14} color={colors.textMuted} />
                          <Text style={[styles.kpiText, { color: colors.textMuted }]} numberOfLines={1}>
                            {barPct}%
                          </Text>
                        </View>
                      </View>

                      <View style={{ marginTop: 10 }}>
                        <Text style={[styles.progressLabel, { color: colors.textMuted }]} numberOfLines={1}>
                          Postęp ({meta.label}): {progressLabel}
                        </Text>

                        <View style={{ marginTop: 8 }}>
                          <ProgressBar value={barPct} colors={colors} compact />
                        </View>

                        <View style={{ marginTop: 10 }}>
                          <TierSegments total={a.thresholds.length} active={p.tierIndex} colors={colors} />
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ height: 36 }} />
      </ScrollView>
    </View>
  );
}

/* =========================
   Styles
========================= */

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: Platform.OS === "web" ? ("100dvh" as any) : undefined,
  },

  bgOrbs: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },

  scroll: {
    paddingTop: 16,
    paddingBottom: 30,
    width: "100%",
    alignSelf: "center",
  },

  cardBase: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    overflow: "hidden",
  },
  cardTopLine: {
    position: "absolute",
    top: 0,
    left: 14,
    right: 14,
    height: 2,
    borderRadius: 999,
    opacity: 0.85,
  },

  heroRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },

  heroRowStack: {
    flexDirection: "column",
  },

  profileBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 380,
    overflow: "hidden",
  },

  avatarCol: {
    position: "relative",
  },
  avatarGlow: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 999,
    top: 4,
    left: 4,
  },

  avatar: {
    borderRadius: 18,
    borderWidth: 1,
  },

  name: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  profileSubRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  dot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    opacity: 0.9,
  },

  sub: {
    fontSize: 12,
    fontWeight: "800",
  },

  levelTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
    marginBottom: 8,
  },

  levelTitle: {
    fontSize: 22,
    fontWeight: "900",
    flexShrink: 1,
    minWidth: 0,
    letterSpacing: 0.2,
  },

  levelMeta: {
    fontSize: 12,
    fontWeight: "800",
    opacity: 0.92,
    marginTop: 4,
  },

  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },

  sectionHead: {
    marginTop: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  sectionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },

  list: {
    gap: 12,
  },

  achCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 12,
    overflow: "hidden",
    width: "100%",
  },

  achRail: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 4,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
    borderWidth: 1,
    borderLeftWidth: 0,
    opacity: 0.95,
  },

  achRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },

  iconWrap: {
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    position: "relative",
    overflow: "hidden",
  },

  cornerBadge: {
    position: "absolute",
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  pulseGlow: {
    position: "absolute",
    left: -10,
    right: -10,
    top: -10,
    bottom: -10,
    borderRadius: 999,
  },

  achContentRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  achContentRowStack: {
    flexDirection: "column",
  },

  achMainCol: {
    flex: 1.05,
    minWidth: 0,
  },

  achMetaCol: {
    flex: 0.95,
    minWidth: 0,
    paddingLeft: 12,
    borderLeftWidth: 1,
    paddingTop: 0,
  },

  metaTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },

  achHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },

  achTitle: {
    fontSize: 15,
    fontWeight: "900",
    flexShrink: 1,
    minWidth: 0,
    letterSpacing: 0.15,
  },

  achDesc: {
    fontSize: 12,
    fontWeight: "800",
    opacity: 0.95,
    marginTop: 4,
    lineHeight: 16,
  },

  valueBox: {
    alignItems: "flex-end",
    flexShrink: 0,
    minWidth: 92,
  },

  valueNum: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.1,
  },

  valueSubRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  valueSub: {
    fontSize: 11,
    fontWeight: "900",
  },

  chipsRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  metaText: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },

  progressLabel: {
    fontSize: 12,
    fontWeight: "800",
  },

  kpiPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },

  kpiText: {
    fontSize: 11,
    fontWeight: "900",
  },
});

const header = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    minHeight: 44,
  },
  wrapStack: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  backText: {
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.1,
  },
  titleCol: {
    flex: 1,
    paddingHorizontal: 6,
    minWidth: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "800",
    opacity: 0.9,
    textAlign: "center",
    marginTop: 3,
    lineHeight: 16,
  },
});

const ui = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "900",
    flexShrink: 1,
    minWidth: 0,
  },

  progressTrack: {
    width: "100%",
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    position: "relative",
  },
  progressFill: {
    height: "100%",
  },
  progressShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "100%",
  },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "100%",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "900",
  },

  segRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  seg: {
    height: 8,
    width: 18,
    borderRadius: 999,
    borderWidth: 1,
  },
});
