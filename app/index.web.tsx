// app/index.web.tsx
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Image,
  Platform,
  Animated,
  useWindowDimensions,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import WelcomeTutorialModal from "../src/components/WelcomeTutorialModal";
import { useThemeColors } from "../src/context/ThemeContext";

import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  arrayUnion,
} from "firebase/firestore";

import { useMissions } from "../src/hooks/useMissions";
import { useFamily } from "../src/hooks/useFamily";
import { db } from "../src/firebase/firebase.web";
import { auth } from "../src/firebase/firebase";

// ✅ otwieramy krok 5 w globalnym CustomHeader (żeby nie dublować headera na ekranie)
import { setTourStep5Open as setTourStep5OpenBus } from "../src/utils/tourStep5Bus";

/* --------------------------------------------------------- */
/* ------------------------ HELPERS ------------------------- */
/* --------------------------------------------------------- */

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ✅ stabilny addDays (bez driftów godzin / DST)
function addDays(date: Date, days: number) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

// ✅ stabilny addMonths (bez driftów i „dziwnych” przeskoków)
function addMonths(date: Date, months: number) {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const targetY = base.getFullYear();
  const targetM = base.getMonth() + months;
  const day = base.getDate();

  const firstOfTarget = new Date(targetY, targetM, 1, 0, 0, 0, 0);
  const lastDay = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate();

  return new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth(), Math.min(day, lastDay), 0, 0, 0, 0);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDayLong(date: Date) {
  return date.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatWeekRange(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  return `${weekStart.getDate()}–${weekEnd.getDate()} ${weekStart.toLocaleDateString("pl-PL", {
    month: "short",
  })}`;
}

// 🔹 klucz daty do skipDates (RRRR-MM-DD)
function formatDateKey(date: Date) {
  const d0 = startOfDay(date);
  const y = d0.getFullYear();
  const m = String(d0.getMonth() + 1).padStart(2, "0");
  const d = String(d0.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toSafeDate(v: any): Date | null {
  if (!v) return null;
  const d = v?.toDate?.() ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/* ------------------ date UI helpers (web-friendly) ------------------ */

function startOfMonth(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  return d;
}

function formatMonthYear(date: Date) {
  return date.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}

function formatDatePill(date: Date) {
  return date.toLocaleDateString("pl-PL", { day: "2-digit", month: "short", year: "numeric" });
}

function formatISODate(date: Date) {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseISODate(value: string) {
  if (!value || typeof value !== "string") return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

function getMonthMatrix(viewMonth: Date) {
  const first = startOfMonth(viewMonth);
  const mondayIndex = (first.getDay() + 6) % 7; // monday-first index: 0..6
  const gridStart = addDays(first, -mondayIndex);

  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) row.push(addDays(gridStart, w * 7 + i));
    weeks.push(row);
  }
  return weeks;
}

/* --------------------------------------------------------- */
/* ---------------------- EXP HELPERS ----------------------- */
/* --------------------------------------------------------- */

const WEEKDAY_LABELS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

function getDifficultyLabel(m: any): { label: string; color: string } {
  const mode = m.expMode as string | undefined;
  const exp = (m.expValue as number | undefined) ?? 0;

  if (mode === "easy") return { label: "Łatwe", color: "#22c55e" };
  if (mode === "medium") return { label: "Średnie", color: "#eab308" };
  if (mode === "hard") return { label: "Trudne", color: "#ef4444" };

  if (exp >= 100) return { label: "Trudne", color: "#ef4444" };
  if (exp >= 50) return { label: "Średnie", color: "#eab308" };
  if (exp > 0) return { label: "Łatwe", color: "#22c55e" };

  return { label: "Brak", color: "#6b7280" };
}

function getExpProgress(m: any): number {
  const exp = (m.expValue as number | undefined) ?? 0;
  return Math.max(0, Math.min(1, exp / 100));
}

/**
 * EXP krzywa:
 *  - do LVL 2 potrzeba 100 EXP
 *  - każdy kolejny level wymaga +50 EXP więcej niż poprzedni
 */
function requiredExpForLevel(level: number) {
  if (level <= 1) return 0;

  let total = 0;
  for (let l = 1; l < level; l++) {
    const gainForThisLevelUp = 100 + 50 * (l - 1);
    total += gainForThisLevelUp;
  }
  return total;
}

/* --------------------------------------------------------- */
/* --- helper: czy Assigned i Creator to ta sama osoba? ----- */
/* --------------------------------------------------------- */

function isSameMember(a: any, b: any) {
  if (!a || !b) return false;

  const idA = (a.id ?? "").toString().trim();
  const idB = (b.id ?? "").toString().trim();
  if (idA && idB && idA === idB) return true;

  const labelA = (a.label ?? "").toString().trim().toLowerCase();
  const labelB = (b.label ?? "").toString().trim().toLowerCase();
  if (labelA && labelB && labelA === labelB) return true;

  return false;
}

/* --------------------------------------------------------- */
/* ---------- WSPÓLNY FILTR ZADAŃ DLA DOWOLNEGO DNIA -------- */
/* --------------------------------------------------------- */

function filterMissionsForDate(allMissions: any[], selectedDate: Date) {
  const sel = startOfDay(selectedDate);
  const dateKey = formatDateKey(sel);

  return allMissions.filter((m) => {
    if (m.archived) return false;
    if (!m.dueDate) return false;

    // jeśli misja ma skipDates i zawiera ten dzień -> pomijamy
    if (Array.isArray(m.skipDates) && m.skipDates.includes(dateKey)) {
      return false;
    }

    const dueRaw = m.dueDate?.toDate?.() ? m.dueDate.toDate() : new Date(m.dueDate);
    const due = startOfDay(dueRaw);

    const repeat = m.repeat?.type ?? "none";

    if (repeat === "none") return isSameDay(due, sel);

    // start serii dopiero od dueDate (bez bugów przez godziny)
    if (due.getTime() > sel.getTime()) return false;

    if (repeat === "daily") return true;
    if (repeat === "weekly") return sel.getDay() === due.getDay();
    if (repeat === "monthly") return sel.getDate() === due.getDate();

    return false;
  });
}

function isMissionDoneOnDate(m: any, date: Date) {
  const repeat = m?.repeat?.type ?? "none";
  const dateKey = formatDateKey(date);

  if (repeat !== "none") {
    if (Array.isArray(m.completedDates) && m.completedDates.includes(dateKey)) {
      return true;
    }

    // legacy support
    const completedAt = toSafeDate(m.completedAt);
    if (completedAt && isSameDay(completedAt, date)) return true;

    return false;
  }

  return !!m.completed;
}

/* --------------------------------------------------------- */
/* --------- FIREWORK MANAGER – GLOBALNY OVERLAY ------------ */
/* --------------------------------------------------------- */

type FireworkParticle = {
  id: string;
  missionId: string;
  originX: number;
  originY: number;
  translateX: Animated.Value;
  translateY: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
  color: string;
  angle: number;
  distance: number;
  duration: number;
  delay: number;
};

function useFireworkManager() {
  const [particles, setParticles] = useState<FireworkParticle[]>([]);

  const shoot = (missionId: string, originX: number, originY: number) => {
    const COLORS = ["#22c55e", "#0ea5e9", "#eab308", "#f43f5e", "#a855f7", "#f472b6", "#2dd4bf"];

    const count = 32 + Math.floor(Math.random() * 12); // 32–44 cząstek
    const coreCount = Math.floor(count * 0.35); // ~1/3 – szybki flash
    const newParticles: FireworkParticle[] = [];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const isCore = i < coreCount;

      const distance = isCore ? 10 + Math.random() * 18 : 40 + Math.random() * 80;
      const duration = isCore ? 350 + Math.random() * 200 : 800 + Math.random() * 400;
      const delay = isCore ? 0 : 120 + Math.random() * 120;

      newParticles.push({
        id: `${missionId}_${Date.now()}_${i}`,
        missionId,
        originX,
        originY,
        translateX: new Animated.Value(0),
        translateY: new Animated.Value(0),
        scale: new Animated.Value(0.4),
        opacity: new Animated.Value(1),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        angle,
        distance,
        duration,
        delay,
      });
    }

    setParticles((prev) => [...prev, ...newParticles]);

    newParticles.forEach((p) => {
      const targetX = Math.cos(p.angle) * p.distance;
      const targetY = Math.sin(p.angle) * p.distance;

      Animated.parallel([
        Animated.timing(p.translateX, {
          toValue: targetX,
          duration: p.duration,
          delay: p.delay,
          useNativeDriver: true,
        }),
        Animated.timing(p.translateY, {
          toValue: targetY,
          duration: p.duration,
          delay: p.delay,
          useNativeDriver: true,
        }),
        Animated.timing(p.scale, {
          toValue: 1.3,
          duration: p.duration * 0.6,
          delay: p.delay,
          useNativeDriver: true,
        }),
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: p.duration,
          delay: p.delay + p.duration * 0.4,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setParticles((prev) => prev.filter((pp) => pp.id !== p.id));
      });
    });
  };

  return { particles, shoot };
}

/* --------------------------------------------------------- */
/* ------------------- GUIDED TOUR OVERLAY ------------------ */
/* --------------------------------------------------------- */

type Rect = { x: number; y: number; width: number; height: number };

type TourStep = {
  id: "hud" | "week" | "add" | "checkbox";
  title: string;
  body: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function measureRect(node: any): Promise<Rect | null> {
  return new Promise((resolve) => {
    try {
      if (!node || !node.measureInWindow) return resolve(null);
      node.measureInWindow((x: number, y: number, width: number, height: number) => {
        if ([x, y, width, height].some((v) => typeof v !== "number" || Number.isNaN(v))) {
          resolve(null);
        } else {
          resolve({ x, y, width, height });
        }
      });
    } catch {
      resolve(null);
    }
  });
}

function GuidedTourOverlay({
  visible,
  colors,
  steps,
  getNodeForStep,
  getScreenNode,
  onClose,
  onFinish,
}: {
  visible: boolean;
  colors: any;
  steps: TourStep[];
  getNodeForStep: (id: TourStep["id"]) => any;
  getScreenNode: () => any;
  onClose: () => void;
  onFinish: () => void;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const [idx, setIdx] = useState(0);

  const [target, setTarget] = useState<Rect | null>(null);
  const [bubbleH, setBubbleH] = useState(0);

  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const step = steps[idx];

  const refresh = useCallback(async () => {
    if (!visible || !step) return;

    await new Promise((r) => setTimeout(r, 60));

    const screenNode = getScreenNode?.();
    const screenRect = await measureRect(screenNode);
    const offX = screenRect?.x ?? 0;
    const offY = screenRect?.y ?? 0;

    const node = getNodeForStep(step.id);
    const rect = await measureRect(node);

    if (!rect) {
      setTarget({
        x: W / 2 - 120,
        y: H / 2 - 40,
        width: 240,
        height: 80,
      });
      return;
    }

    setTarget({
      x: rect.x - offX,
      y: rect.y - offY,
      width: rect.width,
      height: rect.height,
    });
  }, [visible, step?.id, getNodeForStep, getScreenNode, W, H, step]);

  useEffect(() => {
    if (!visible) return;

    setIdx(0);
    setTarget(null);
    setBubbleH(0);

    fade.setValue(0);
    pulse.setValue(0);

    Animated.timing(fade, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 720, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 720, useNativeDriver: true }),
      ])
    );

    loop.start();
    refresh();

    return () => {
      loop.stop();
      pulse.stopAnimation();
      pulse.setValue(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    refresh();
  }, [idx, visible, refresh]);

  if (!visible || !step) return null;

  const safeTarget: Rect =
    target ?? ({
      x: W / 2 - 120,
      y: H / 2 - 40,
      width: 240,
      height: 80,
    } as Rect);

  const pad = 14;
  const hlPad = 8;

  const hlX = clamp(safeTarget.x - hlPad, pad, W - pad);
  const hlY = clamp(safeTarget.y - hlPad, pad, H - pad);
  const hlW = clamp(safeTarget.width + hlPad * 2, 64, W - pad * 2);
  const hlH = clamp(safeTarget.height + hlPad * 2, 48, H - pad * 2);

  const bubbleW = clamp(Math.min(420, W - pad * 2), 260, 520);

  const preferBelow = hlY + hlH + 12 + bubbleH < H - pad;
  const bubbleTop = preferBelow ? hlY + hlH + 12 : Math.max(pad, hlY - 12 - bubbleH);
  const bubbleLeft = clamp(hlX + hlW / 2 - bubbleW / 2, pad, W - pad - bubbleW);

  const arrowSize = 10;
  const arrowTop = preferBelow ? bubbleTop - arrowSize / 2 : bubbleTop + bubbleH - arrowSize / 2;
  const arrowLeft = clamp(hlX + hlW / 2 - arrowSize / 2, pad, W - pad - arrowSize);

  const isLast = idx === steps.length - 1;

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 12000 }}>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(2,6,23,0.72)",
          opacity: fade,
        }}
      />

      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: hlX,
          top: hlY,
          width: hlW,
          height: hlH,
          borderRadius: 18,
          borderWidth: 2,
          borderColor: colors.accent,
          backgroundColor: "rgba(255,255,255,0.03)",
          opacity: Animated.multiply(
            fade,
            pulse.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [1, 0.9, 1],
            })
          ),
        }}
      />

      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: hlX - 10,
          top: hlY - 10,
          width: hlW + 20,
          height: hlH + 20,
          borderRadius: 22,
          borderWidth: 2,
          borderColor: colors.accent,
          backgroundColor: colors.accent + "10",
          opacity: Animated.multiply(
            fade,
            pulse.interpolate({
              inputRange: [0, 0.4, 1],
              outputRange: [0.55, 0.25, 0],
            })
          ),
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.16],
              }),
            },
          ],
        }}
      />

      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: hlX - 18,
          top: hlY - 18,
          width: hlW + 36,
          height: hlH + 36,
          borderRadius: 26,
          borderWidth: 2,
          borderColor: colors.accent + "CC",
          backgroundColor: "transparent",
          opacity: Animated.multiply(
            fade,
            pulse.interpolate({
              inputRange: [0, 0.2, 1],
              outputRange: [0.22, 0.18, 0],
            })
          ),
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [1.06, 1.32],
              }),
            },
          ],
        }}
      />

      <Animated.View
        style={{
          position: "absolute",
          left: bubbleLeft,
          top: bubbleTop,
          width: bubbleW,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 14,
          opacity: fade,
          ...(Platform.OS === "web"
            ? ({ boxShadow: "0px 18px 50px rgba(0,0,0,0.45)" } as any)
            : {
                shadowColor: "#000",
                shadowOpacity: 0.28,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: 12 },
                elevation: 10,
              }),
        }}
        onLayout={(e) => setBubbleH(e.nativeEvent.layout.height)}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.accent + "22",
              borderWidth: 1,
              borderColor: colors.accent + "55",
              marginRight: 10,
            }}
          >
            <Ionicons name="navigate-outline" size={16} color={colors.accent} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 14 }}>{step.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2, fontWeight: "800" }}>
              Krok {idx + 1}/{steps.length}
            </Text>
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
              alignItems: "center",
              justifyContent: "center",
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 10, lineHeight: 18, fontWeight: "700" }}>
          {step.body}
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <TouchableOpacity
            disabled={idx === 0}
            onPress={() => setIdx((p) => Math.max(0, p - 1))}
            style={{
              flex: 1,
              opacity: idx === 0 ? 0.5 : 1,
              paddingVertical: 11,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
              alignItems: "center",
              justifyContent: "center",
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 13 }}>Wstecz</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              if (isLast) onFinish();
              else setIdx((p) => Math.min(steps.length - 1, p + 1));
            }}
            style={{
              flex: 1,
              paddingVertical: 11,
              borderRadius: 999,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Text style={{ color: "#022c22", fontWeight: "900", fontSize: 13 }}>{isLast ? "Dalej" : "Dalej"}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: arrowLeft,
          top: arrowTop,
          width: arrowSize,
          height: arrowSize,
          backgroundColor: colors.card,
          borderLeftWidth: 1,
          borderTopWidth: 1,
          borderColor: colors.border,
          transform: [{ rotate: preferBelow ? "45deg" : "225deg" }],
          opacity: fade,
        }}
      />
    </View>
  );
}

/* --------------------------------------------------------- */
/* ------------------- DATE PICKER MODAL -------------------- */
/* --------------------------------------------------------- */

function DatePickerModal({
  visible,
  colors,
  selectedDate,
  today,
  hasCompletedMissionOnDate,
  onSelectDate,
  onClose,
}: {
  visible: boolean;
  colors: any;
  selectedDate: Date;
  today: Date;
  hasCompletedMissionOnDate: (d: Date) => boolean;
  onSelectDate: (d: Date) => void;
  onClose: () => void;
}) {
  const { width: W } = useWindowDimensions();
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(selectedDate));

  useEffect(() => {
    if (!visible) return;
    setViewMonth(startOfMonth(selectedDate));
  }, [visible, selectedDate]);

  if (!visible) return null;

  const pad = 18;
  const maxW = 560;

  const weeks = getMonthMatrix(viewMonth);
  const monthLabel = formatMonthYear(viewMonth);

  const softShadow =
    Platform.OS === "web"
      ? ({ boxShadow: "0px 18px 60px rgba(0,0,0,0.45)" } as any)
      : {
          shadowColor: "#000",
          shadowOpacity: 0.22,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 14 },
          elevation: 10,
        };

  const inputValue = formatISODate(selectedDate);

  const selectAndClose = (d: Date) => {
    onSelectDate(startOfDay(d));
    onClose();
  };

  const WebDateInput =
    Platform.OS === "web"
      ? React.createElement("input", {
          type: "date",
          value: inputValue,
          onChange: (e: any) => {
            const v = e?.target?.value;
            const parsed = parseISODate(v);
            if (parsed) {
              selectAndClose(parsed);
            }
          },
          style: {
            width: "100%",
            padding: "12px 12px",
            borderRadius: 16,
            border: `1px solid ${colors.border}`,
            background: colors.bg,
            color: colors.text,
            fontSize: 14,
            fontWeight: 900,
            outline: "none",
          },
        } as any)
      : null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 260,
        backgroundColor: "rgba(15,23,42,0.78)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: pad,
        paddingVertical: pad,
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: maxW,
          backgroundColor: colors.card,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
          ...softShadow,
        }}
      >
        {/* header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.accent + "18",
                borderWidth: 1,
                borderColor: colors.accent + "55",
              }}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.accent} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900", letterSpacing: 0.2 }}>Wybierz datę</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: "800" }}>
                Aktualnie: {formatDatePill(selectedDate)}
              </Text>
            </View>
          </View>

          {/* ✅ tylko X */}
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
              alignItems: "center",
              justifyContent: "center",
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* system date input (web/mobile browsers) */}
        <View style={{ marginTop: 12 }}>
          {WebDateInput}
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800", marginTop: 8 }}>
            Możesz też kliknąć dzień w kalendarzu niżej.
          </Text>
        </View>

        {/* month header */}
        <View style={{ marginTop: 14 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 10,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
            }}
          >
            <TouchableOpacity
              onPress={() => setViewMonth((m) => startOfMonth(addMonths(m, -1)))}
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
                ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Poprzedni miesiąc"
            >
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </TouchableOpacity>

            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 }}>{monthLabel}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 }}>Kliknij dzień</Text>
            </View>

            <TouchableOpacity
              onPress={() => setViewMonth((m) => startOfMonth(addMonths(m, 1)))}
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
                ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Następny miesiąc"
            >
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* weekday labels */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingHorizontal: 4 }}>
            {WEEKDAY_LABELS.map((w) => (
              <View key={w} style={{ width: `${100 / 7}%`, alignItems: "center" }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900" }}>{w}</Text>
              </View>
            ))}
          </View>

          {/* calendar grid */}
          <View style={{ marginTop: 10 }}>
            {weeks.map((row, ri) => (
              <View key={ri} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                {row.map((d, ci) => {
                  const inMonth = d.getMonth() === viewMonth.getMonth();
                  const active = isSameDay(d, selectedDate);
                  const isToday = isSameDay(d, today);
                  const inPast = d < today && !isSameDay(d, today);
                  const hasDone = inPast && hasCompletedMissionOnDate(d);

                  const bg = active ? colors.accent : inMonth ? colors.bg : "transparent";
                  const border = active ? colors.accent : colors.border;
                  const text = active ? "#022c22" : inMonth ? colors.text : colors.textMuted;

                  return (
                    <TouchableOpacity
                      key={`${ri}-${ci}`}
                      onPress={() => selectAndClose(d)} // ✅ wybór dnia = zamknięcie
                      style={{ width: `${100 / 7}%`, paddingHorizontal: 4 }}
                      activeOpacity={0.85}
                    >
                      <View
                        style={{
                          height: 46,
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: bg,
                          borderWidth: inMonth || active ? 1 : 0,
                          borderColor: border,
                          opacity: inMonth ? 1 : 0.45,
                          ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                        }}
                      >
                        <Text style={{ color: text, fontWeight: "900", fontSize: 13 }}>{d.getDate()}</Text>

                        {isToday && !active && (
                          <View
                            style={{
                              position: "absolute",
                              top: 8,
                              right: 9,
                              width: 7,
                              height: 7,
                              borderRadius: 999,
                              backgroundColor: colors.accent,
                            }}
                          />
                        )}

                        {hasDone && !active && (
                          <View
                            style={{
                              position: "absolute",
                              bottom: 8,
                              width: 6,
                              height: 6,
                              borderRadius: 999,
                              backgroundColor: "#22c55e",
                            }}
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* ✅ usunięto przyciski "Zamknij/Gotowe" */}
      </View>
    </View>
  );
}

/* --------------------------------------------------------- */
/* --------------------- MAIN COMPONENT --------------------- */
/* --------------------------------------------------------- */

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { missions, loading } = useMissions();
  const { members } = useFamily();

  const { width: screenW } = useWindowDimensions();

  const { particles: fireworkParticles, shoot: triggerFirework } = useFireworkManager();

  // ✅ ref do kontenera ekranu (GuidedTourOverlay odejmuje offset)
  const screenRef = useRef<any>(null);

  // refy do checkboxów
  const checkboxRefs = useRef<Record<string, any>>({});
  const demoCheckboxAnchorRef = useRef<any>(null);

  // refs do animacji kart
  const animationRefs = useRef<Record<string, Animated.Value>>({});

  // Anchory guided tour
  const hudAnchorRef = useRef<any>(null);
  const weekDaysAnchorRef = useRef<any>(null);
  const addTaskAnchorRef = useRef<any>(null);

  const [tourOpen, setTourOpen] = useState(false);

  console.log("🟦 RENDER HOME – missions count:", missions?.length);

  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [repeatDeleteDialog, setRepeatDeleteDialog] = useState<{ mission: any; dateKey: string } | null>(null);
  const [timeTravelDialogOpen, setTimeTravelDialogOpen] = useState(false);

  const [userStats, setUserStats] = useState<{ level: number; totalExp: number } | null>(null);

  // ✅ modal wyboru daty
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // welcome modal
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const [welcomeModalReady, setWelcomeModalReady] = useState(false);

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = useMemo(() => startOfDay(new Date()), []);

  const currentUser = auth.currentUser;
  const myUid = currentUser?.uid ?? null;
  const myPhotoURL = currentUser?.photoURL || null;
  const myDisplayName = currentUser?.displayName || null;

  /* --------------------------------------------------------- */
  /* ✅ LISTA UID-ÓW CZŁONKÓW RODZINY (do filtrów widoczności) */
  /* --------------------------------------------------------- */

  const familyMemberIds: string[] = useMemo(() => {
    if (!members) return [];
    return members.map((x: any) => String(x.uid || x.userId || x.id || "")).filter((id: string) => !!id);
  }, [members]);

  /* --------------------------------------------------------- */
  /* ✅ VISIBILITY */
  /* --------------------------------------------------------- */

  const isMine = (m: any) => {
    if (!myUid) return false;

    const myId = String(myUid);
    const assignedTo = m?.assignedToUserId ? String(m.assignedToUserId) : null;
    const assignedBy = m?.assignedByUserId ? String(m.assignedByUserId) : null;
    const createdBy = m?.createdByUserId ? String(m.createdByUserId) : null;

    if (assignedTo && assignedTo === myId) return true;

    if (!assignedTo && (assignedBy === myId || createdBy === myId)) {
      return true;
    }

    const isFamilyTarget = !!assignedTo && familyMemberIds.includes(assignedTo);
    if (isFamilyTarget && (assignedBy === myId || createdBy === myId)) {
      return true;
    }

    return false;
  };

  const visibleMissions = useMemo(() => {
    const list = Array.isArray(missions) ? missions : [];
    return list.filter(isMine);
  }, [missions, myUid, familyMemberIds]);

  /* --------------------------------------------------------- */
  /* --------- NASŁUCH userStats + onboarding z "users" ------- */
  /* --------------------------------------------------------- */

  useEffect(() => {
    if (!myUid) return;

    const userDocRef = doc(db, "users", myUid);
    const unsub = onSnapshot(userDocRef, (snap) => {
      const data = snap.data() as any;
      if (data) {
        setUserStats({
          level: (data.level as number | undefined) ?? 1,
          totalExp: (data.totalExp as number | undefined) ?? 0,
        });

        const seen = !!data?.onboarding?.welcomeSeen;
        setWelcomeModalOpen(!seen);
        setWelcomeModalReady(true);
      } else {
        setWelcomeModalOpen(true);
        setWelcomeModalReady(true);
      }
    });

    return unsub;
  }, [myUid]);

  const markWelcomeSeen = async (action: "start" | "skip") => {
    if (!myUid) return;

    try {
      await setDoc(
        doc(db, "users", myUid),
        {
          onboarding: {
            welcomeSeen: true,
            welcomeSeenAt: serverTimestamp(),
            welcomeAction: action,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setWelcomeModalOpen(false);

      if (action === "start") {
        setTourOpen(true);
      } else {
        router.replace("/");
      }
    } catch (err: any) {
      console.error("🟥 WELCOME MODAL save error:", err?.code, err?.message, err);
      alert("Nie udało się zapisać statusu wprowadzenia. Spróbuj ponownie.");
    }
  };

  /* --------------------------------------------------------- */
  /* -------------- MAP ASSIGNED / CREATOR MEMBER ------------ */
  /* --------------------------------------------------------- */

  const meFromMembers = useMemo(() => {
    if (!members || !myUid) return null;
    return (
      members.find((x: any) => {
        const uid = String(x.uid || x.userId || x.id || "");
        return uid === String(myUid);
      }) || null
    );
  }, [members, myUid]);

  const getCreatorMember = (m: any) => {
    const rawId = m?.assignedByUserId || m?.createdByUserId || null;
    const creatorId = rawId ? String(rawId) : null;
    const creatorName = m?.assignedByName || m?.createdByName || null;

    if (!creatorId && !creatorName) return null;

    if (myUid && creatorId === String(myUid)) {
      const avatarUrl =
        (meFromMembers as any)?.avatarUrl || (meFromMembers as any)?.photoURL || myPhotoURL || null;

      const label = creatorName || (meFromMembers as any)?.displayName || myDisplayName || "Ty";

      return {
        id: "self",
        label,
        avatarUrl,
      };
    }

    const found = members?.find((x: any) => {
      const uid = String(x.uid || x.userId || x.id || "");
      return creatorId && uid === creatorId;
    });

    if (found) {
      return {
        id: creatorId!,
        label: found.displayName || found.username || creatorName || "Bez nazwy",
        avatarUrl: found.avatarUrl || found.photoURL || null,
      };
    }

    return {
      id: creatorId || "unknown",
      label: creatorName,
      avatarUrl: null,
    };
  };

  const getAssignedMember = (m: any) => {
    const assignedId = m?.assignedToUserId ? String(m.assignedToUserId) : null;
    const byId = m?.assignedByUserId || m?.createdByUserId || null;
    const treatAsSelf = !!myUid && (assignedId === String(myUid) || (!assignedId && byId === myUid));

    if (treatAsSelf) {
      const level = (meFromMembers as any)?.level ?? (m.assignedToLevel as number | undefined) ?? 1;
      const totalExp =
        (meFromMembers as any)?.totalExp ?? (m.assignedToTotalExp as number | undefined) ?? 0;

      const avatarUrl =
        (meFromMembers as any)?.avatarUrl || (meFromMembers as any)?.photoURL || myPhotoURL || null;

      const label = m.assignedToName || (meFromMembers as any)?.displayName || myDisplayName || "Ty";

      return {
        id: "self",
        label,
        avatarUrl,
        level,
        totalExp,
      };
    }

    const found = members?.find((x: any) => {
      const uid = String(x.uid || x.userId || x.id || "");
      return assignedId && uid === assignedId;
    });

    if (found) {
      return {
        id: assignedId!,
        label: found.displayName || found.username || "Bez nazwy",
        avatarUrl: m.assignedToAvatarUrl || found.avatarUrl || found.photoURL || null,
        level: found.level ?? 1,
        totalExp: (found as any).totalExp ?? 0,
      };
    }

    return {
      id: assignedId || "unknown",
      label: m.assignedToName || "Bez nazwy",
      avatarUrl: null,
      level: 1,
      totalExp: 0,
    };
  };

  /* --------------------------------------------------------- */
  /* ---------------------- DAY FILTER ------------------------ */
  /* --------------------------------------------------------- */

  const missionsForDay = useMemo(() => filterMissionsForDate(visibleMissions, selectedDate), [
    visibleMissions,
    selectedDate,
  ]);

  const missionsForDaySorted = useMemo(() => {
    const list = [...missionsForDay];
    list.sort((a, b) => {
      const ac = isMissionDoneOnDate(a, selectedDate) ? 1 : 0;
      const bc = isMissionDoneOnDate(b, selectedDate) ? 1 : 0;
      if (ac !== bc) return ac - bc;
      const ae = (a.expValue ?? 0) as number;
      const be = (b.expValue ?? 0) as number;
      return be - ae;
    });
    return list;
  }, [missionsForDay, selectedDate]);

  const hasCompletedMissionOnDate = (date: Date) => {
    const list = filterMissionsForDate(visibleMissions, date);
    return list.some((m) => isMissionDoneOnDate(m, date));
  };

  const streak = useMemo(() => {
    let count = 0;
    let cursor = new Date(today);
    const MAX_DAYS = 365;

    for (let i = 0; i < MAX_DAYS; i++) {
      const list = filterMissionsForDate(visibleMissions, cursor);
      const anyCompleted = list.some((m) => isMissionDoneOnDate(m, cursor));

      if (!anyCompleted) break;

      count += 1;
      cursor = addDays(cursor, -1);
    }

    return count;
  }, [visibleMissions, today]);

  /* --------------------------------------------------------- */
  /* ---------------------- HUD METRICS ----------------------- */
  /* --------------------------------------------------------- */

  const hudMember = useMemo(() => {
    const me =
      members?.find((x: any) => x?.isMe || x?.isCurrentUser) ??
      members?.find((x: any) => {
        const uid = String(x.uid || x.userId || x.id || "");
        return myUid && uid === myUid;
      }) ??
      members?.find((x: any) => x?.me === true) ??
      null;

    if (me) {
      return {
        id: String(me.uid || me.userId || me.id),
        label: me.displayName || me.username || "Ty",
        avatarUrl: me.avatarUrl || me.photoURL || myPhotoURL || null,
        level: me.level ?? 1,
        totalExp: (me as any).totalExp ?? 0,
      };
    }

    if (missionsForDaySorted.length > 0) {
      return getAssignedMember(missionsForDaySorted[0]);
    }

    return {
      id: "self",
      label: myDisplayName || "Ty",
      avatarUrl: myPhotoURL,
      level: 1,
      totalExp: 0,
    };
  }, [members, missionsForDaySorted, myUid, myPhotoURL, myDisplayName]);

  const hudLevel = Math.max(1, Number(userStats?.level ?? hudMember?.level ?? 1));
  const hudTotalExp = Math.max(0, Number(userStats?.totalExp ?? hudMember?.totalExp ?? 0));

  const baseReq = hudLevel <= 1 ? 0 : requiredExpForLevel(hudLevel);
  const nextReq = requiredExpForLevel(hudLevel + 1);
  const intoLevel = Math.max(0, hudTotalExp - baseReq);
  const span = Math.max(1, nextReq - baseReq);
  const hudProgress = Math.max(0, Math.min(1, intoLevel / span));
  const hudToNext = Math.max(0, nextReq - hudTotalExp);

  const dayEarned = useMemo(() => {
    return missionsForDaySorted.reduce((acc, m) => {
      if (!isMissionDoneOnDate(m, selectedDate)) return acc;
      return acc + ((m.expValue as number | undefined) ?? 0);
    }, 0);
  }, [missionsForDaySorted, selectedDate]);

  const dayPossible = useMemo(() => {
    return missionsForDaySorted.reduce((acc, m) => acc + ((m.expValue as number | undefined) ?? 0), 0);
  }, [missionsForDaySorted]);

  /* --------------------------------------------------------- */
  /* -------------------- COMPLETE MISSION -------------------- */
  /* --------------------------------------------------------- */

  const handleComplete = (mission: any, anim?: Animated.Value) => {
    if (!mission?.id) {
      alert("Brak ID zadania – nie mogę oznaczyć jako wykonane.");
      return;
    }

    const alreadyDone = isMissionDoneOnDate(mission, selectedDate);
    if (alreadyDone) {
      // @ts-ignore
      window.alert("To zadanie jest już oznaczone jako wykonane ✅");
      return;
    }

    const isTodaySelected = isSameDay(selectedDate, new Date());
    if (!isTodaySelected) {
      setTimeTravelDialogOpen(true);
      return;
    }

    const doUpdate = async () => {
      try {
        const repeat = mission?.repeat?.type ?? "none";
        const todayKey = formatDateKey(new Date());

        const byUserId = myUid ?? null;
        const byName = myDisplayName || "Ty";

        if (repeat !== "none") {
          await updateDoc(doc(db, "missions", mission.id), {
            completed: false,
            completedDates: arrayUnion(todayKey),
            completedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            [`completedByByDate.${todayKey}`]: {
              userId: byUserId,
              name: byName,
              at: serverTimestamp(),
            },
          });
          return;
        }

        await updateDoc(doc(db, "missions", mission.id), {
          completed: true,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          completedByUserId: byUserId,
          completedByName: byName,
        });
      } catch (err: any) {
        console.error("🟥 COMPLETE ERROR:", err?.code, err?.message, err);
        alert("Błąd podczas oznaczania jako wykonane.");
      }
    };

    if (anim) {
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.94, duration: 120, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start(() => doUpdate());
    } else {
      doUpdate();
    }
  };

  /* --------------------------------------------------------- */
  /* -------------------- DELETE MISSION ---------------------- */
  /* --------------------------------------------------------- */

  const deleteSeries = async (mission: any) => {
    try {
      if (!mission?.id) {
        console.error("🟥 DELETE ABORT – missing mission.id", mission);
        alert("Brak ID zadania – nie mogę usunąć.");
        return;
      }

      const missionRef = doc(db, "missions", mission.id);
      const deletedRef = doc(db, "deleted_missions", mission.id);

      await setDoc(
        deletedRef,
        {
          ...mission,
          originalCollection: "missions",
          deletedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await deleteDoc(missionRef);
    } catch (err: any) {
      console.error("🟥 DELETE ERROR (primary):", err?.code, err?.message, err);

      try {
        if (mission?.id) {
          await updateDoc(doc(db, "missions", mission.id), { archived: true });
        }
      } catch (err2: any) {
        console.error("🟥 DELETE ERROR (fallback archived):", err2?.code, err2?.message, err2);
      }

      alert("Błąd podczas usuwania (sprawdź konsolę).");
    }
  };

  const deleteOnlyToday = async (mission: any, dateKey: string) => {
    try {
      if (!mission?.id) {
        console.error("🟥 SKIP ABORT – missing mission.id", mission);
        alert("Brak ID zadania – nie mogę ukryć dla tego dnia.");
        return;
      }

      const missionRef = doc(db, "missions", mission.id);
      const prevSkip: string[] = Array.isArray(mission.skipDates) ? mission.skipDates : [];
      if (prevSkip.includes(dateKey)) return;

      const nextSkip = [...prevSkip, dateKey];

      await updateDoc(missionRef, {
        skipDates: nextSkip,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error("🟥 SKIP ERROR:", err?.code, err?.message, err);
      alert("Błąd podczas ukrywania tego dnia.");
    }
  };

  const handleDelete = (mission: any) => {
    const isRepeating = mission?.repeat?.type && mission.repeat.type !== "none";
    const dateKey = formatDateKey(selectedDate);

    if (!isRepeating) {
      // @ts-ignore
      const ok = window.confirm("Czy na pewno chcesz usunąć to zadanie?");
      if (ok) deleteSeries(mission);
      return;
    }

    setRepeatDeleteDialog({ mission, dateKey });
  };

  /* --------------------------------------------------------- */
  /* ------------------------ EDIT NAV ------------------------ */
  /* --------------------------------------------------------- */

  const handleEdit = (mission: any) => {
    router.push({
      pathname: "/editmission",
      params: {
        missionId: mission.id,
        date: (mission.dueDate.toDate?.() ? mission.dueDate.toDate() : new Date(mission.dueDate)).toISOString(),
      },
    });
  };

  const goToAddTask = () => {
    router.push({
      pathname: "/add-task",
      params: { date: selectedDate.toISOString() },
    });
  };

  const goToToday = () => setSelectedDate(startOfDay(new Date()));

  /* --------------------------------------------------------- */
  /* -------------------------- FOOTER ------------------------ */
  /* --------------------------------------------------------- */

  const safePush = (to: any) => {
    try {
      router.push(to);
    } catch (e) {
      console.log("🟨 NAV blocked / route missing:", to);
    }
  };

  /* --------------------------------------------------------- */
  /* ---------------------- UI HELPERS ------------------------ */
  /* --------------------------------------------------------- */

  const cardShadow =
    Platform.OS === "web"
      ? ({ boxShadow: "0px 12px 34px rgba(0,0,0,0.24)" } as any)
      : {
          shadowColor: "#000",
          shadowOpacity: 0.14,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 6,
        };

  const softShadow =
    Platform.OS === "web"
      ? ({ boxShadow: "0px 10px 26px rgba(0,0,0,0.20)" } as any)
      : {
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 4,
        };

  const orbBlur = Platform.OS === "web" ? ({ filter: "blur(56px)" } as any) : null;

  const isNarrow = screenW < 640;

  const TinyChip = ({
    label,
    iconLeft,
    onPress,
    tone = "neutral",
    width,
  }: {
    label: string;
    iconLeft?: any;
    onPress: () => void;
    tone?: "neutral" | "accent";
    width?: number | string;
  }) => {
    const bg = tone === "accent" ? colors.accent : colors.bg;
    const border = tone === "accent" ? colors.accent + "00" : colors.border;
    const text = tone === "accent" ? "#022c22" : colors.text;

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.9}
        style={{
          height: 44,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: border,
          backgroundColor: bg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          ...(width ? ({ width } as any) : null),
          ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {iconLeft ? <Ionicons name={iconLeft} size={16} color={tone === "accent" ? "#022c22" : colors.textMuted} /> : null}
        <Text style={{ color: text, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const Stepper = ({
    label,
    onPrev,
    onNext,
  }: {
    label: string;
    onPrev: () => void;
    onNext: () => void;
  }) => {
    return (
      <View
        style={{
          height: 44,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
          flexDirection: "row",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        <TouchableOpacity
          onPress={onPrev}
          style={{
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`${label} - poprzedni`}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </TouchableOpacity>

        <View style={{ paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 }}>{label}</Text>
        </View>

        <TouchableOpacity
          onPress={onNext}
          style={{
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`${label} - następny`}
        >
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
    );
  };

  /* --------------------------------------------------------- */
  /* -------------------- TOUR: steps + node ------------------ */
  /* --------------------------------------------------------- */

  const TOUR_STEPS: TourStep[] = useMemo(
    () => [
      {
        id: "hud",
        title: "Tu widzisz swój progres",
        body: "Poziom, EXP i streak. To jest Twój „panel gracza” — wszystko tu rośnie, gdy odhacasz zadania.",
      },
      {
        id: "week",
        title: "Wybierz dzień",
        body: "Klikasz dzień tygodnia i widzisz zadania na konkretną datę. Prosto i bez gimnastyki.",
      },
      {
        id: "add",
        title: "Dodaj zadanie",
        body: "Ten przycisk to Twoja fabryka misji. Dodaj coś małego na start i od razu zgarnij pierwsze EXP.",
      },
      {
        id: "checkbox",
        title: "Odhacz i zgarnij EXP",
        body:
          "Kliknij kółko po lewej przy zadaniu. Wykonane = EXP + streak + satysfakcja 💥\n\nPoniżej widzisz przykładowe zadanie, żebyś od razu wiedział o co chodzi.",
      },
    ],
    []
  );

  const getNodeForStep = useCallback(
    (id: TourStep["id"]) => {
      if (id === "hud") return hudAnchorRef.current;
      if (id === "week") return weekDaysAnchorRef.current;
      if (id === "add") return addTaskAnchorRef.current;

      if (id === "checkbox") {
        const first = missionsForDaySorted?.[0];
        if (first?.id && checkboxRefs.current[first.id]) return checkboxRefs.current[first.id];
        if (demoCheckboxAnchorRef.current) return demoCheckboxAnchorRef.current;
        return addTaskAnchorRef.current;
      }

      return null;
    },
    [missionsForDaySorted]
  );

  const markTourSeen = async () => {
    if (!myUid) return;
    try {
      await setDoc(
        doc(db, "users", myUid),
        {
          onboarding: {
            tourSeen: true,
            tourSeenAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.log("🟨 tourSeen save failed", e);
    }
  };

  const closeTour = async () => {
    setTourOpen(false);
    await markTourSeen();
  };

  const finishTour = async () => {
    setTourOpen(false);
    await markTourSeen();
    try {
      setTourStep5OpenBus(true);
    } catch {}
  };

  /* --------------------------------------------------------- */
  /* -------------------------- FOOTER ------------------------ */
  /* --------------------------------------------------------- */

  const FooterLink = ({ label, to }: { label: string; to?: any }) => {
    return (
      <TouchableOpacity
        activeOpacity={0.86}
        onPress={() => (to ? safePush(to) : undefined)}
        style={
          Platform.OS === "web"
            ? ({ cursor: "pointer", marginHorizontal: 8, marginVertical: 4 } as any)
            : { marginHorizontal: 8, marginVertical: 4 }
        }
      >
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 0.2,
            textAlign: "center",
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const AppFooter = () => {
    return (
      <View
        style={{
          marginTop: 28,
          paddingVertical: 18,
          paddingHorizontal: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "transparent",
        }}
      >
        <View style={{ alignItems: "center", maxWidth: 720 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "900", letterSpacing: 0.2, textAlign: "center" }}>
            MissionHome
          </Text>

          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, fontWeight: "700", textAlign: "center" }}>
            Wbijaj poziom w codzienności ✨
          </Text>

          <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
            <FooterLink label="O aplikacji" to="/about-app" />
            <FooterLink label="Regulamin" to="/rules" />
            <FooterLink label="Polityka prywatności" to="/privacy" />
            <FooterLink label="Kontakt" to="/contact" />
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 2 }}>
            <FooterLink label="FAQ" to="/faq" />
            <FooterLink label="Zgłoś błąd" to="/bug" />
            <FooterLink label="Zgłoś pomysł" to="/idea" />
          </View>

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800", marginTop: 10, textAlign: "center" }}>
            © {new Date().getFullYear()} MissionHome — wszystkie prawa zastrzeżone
          </Text>
        </View>
      </View>
    );
  };

  /* --------------------------------------------------------------------- */
  /* ------------------------------- UI ---------------------------------- */
  /* --------------------------------------------------------------------- */

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View ref={screenRef} style={{ flex: 1 }}>
        {/* tło: “orby” */}
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 }}>
          <View
            style={{
              position: "absolute",
              width: 360,
              height: 360,
              borderRadius: 999,
              backgroundColor: colors.accent + "24",
              top: -190,
              left: -160,
              ...(orbBlur as any),
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 300,
              height: 300,
              borderRadius: 999,
              backgroundColor: "#22c55e1f",
              top: -120,
              right: -150,
              ...(orbBlur as any),
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 260,
              height: 260,
              borderRadius: 999,
              backgroundColor: "#a855f71c",
              top: 240,
              left: -120,
              ...(orbBlur as any),
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 340,
              height: 340,
              borderRadius: 999,
              backgroundColor: "#0ea5e91c",
              top: 480,
              right: -190,
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
              top: 780,
              left: 20,
              ...(orbBlur as any),
            }}
          />
        </View>

        <ScrollView
          style={{ flex: 1, zIndex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            width: "100%",
            paddingVertical: 18,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 1344,
              paddingHorizontal: 18,
              flexGrow: 1,
              alignSelf: "center",
              ...(Platform.OS === "web" ? ({ marginHorizontal: "auto" } as any) : null),
            }}
          >
            {/* HUD */}
            <View
              ref={hudAnchorRef}
              style={{
                backgroundColor: colors.card,
                borderRadius: 24,
                padding: 16,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: colors.border,
                ...cardShadow,
              }}
            >
              {/* PLAYER HUD */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
                {hudMember.avatarUrl ? (
                  <Image
                    source={{ uri: hudMember.avatarUrl }}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 999,
                      marginRight: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  />
                ) : (
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 999,
                      backgroundColor: colors.accent + "14",
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ color: colors.accent, fontWeight: "900", fontSize: 16 }}>{hudMember.label?.[0] ?? "?"}</Text>
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900", letterSpacing: 0.2 }}>
                    {hudMember.id === "self" ? "Twój poziom" : hudMember.label}
                  </Text>

                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, justifyContent: "space-between", gap: 10 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      LVL <Text style={{ color: colors.text, fontWeight: "900" }}>{hudLevel}</Text>
                      {"  "}• EXP <Text style={{ color: colors.text, fontWeight: "900" }}>{hudTotalExp}</Text>
                    </Text>

                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: colors.accent + "18",
                        borderWidth: 1,
                        borderColor: colors.accent + "55",
                      }}
                    >
                      <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 0.2 }}>
                        Do LVL {hudLevel + 1}: {hudToNext} EXP
                      </Text>
                    </View>
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <View
                      style={{
                        height: 10,
                        borderRadius: 999,
                        backgroundColor: colors.bg,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <View style={{ height: "100%", width: `${hudProgress * 100}%`, borderRadius: 999, backgroundColor: colors.accent }} />
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, gap: 10 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        Dziś zgarnięte: <Text style={{ color: colors.text, fontWeight: "900" }}>{dayEarned}</Text> / {dayPossible} EXP
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        Próg LVL {hudLevel + 1}: <Text style={{ color: colors.text, fontWeight: "900" }}>{requiredExpForLevel(hudLevel + 1)}</Text>
                      </Text>
                    </View>

                    {/* ✅ STREAK + KRÓTKA NAWIGACJA DATY (4 elementy) */}
                    <View
                      style={{
                        marginTop: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      {/* streak */}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                          borderRadius: 999,
                          backgroundColor: "#f9731618",
                          borderWidth: 1,
                          borderColor: "#f9731655",
                        }}
                      >
                        <Ionicons name="flame" size={14} color="#f97316" />
                        <Text style={{ marginLeft: 6, color: "#f97316", fontSize: 11, fontWeight: "900", letterSpacing: 0.2 }}>
                          Streak: {streak} {streak === 1 ? "dzień z rzędu" : "dni z rzędu"}
                        </Text>
                      </View>

                      {/* 1) Data, 2) Dziś, 3) Tydzień, 4) Miesiąc */}
                      {isNarrow ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
                          <TinyChip label={formatDatePill(selectedDate)} iconLeft="calendar-outline" onPress={() => setDatePickerOpen(true)} />
                          <TinyChip label="Dziś" iconLeft="today-outline" tone="accent" onPress={goToToday} />
                          <Stepper
                            label="Tydzień"
                            onPrev={() => setSelectedDate(startOfDay(addDays(selectedDate, -7)))}
                            onNext={() => setSelectedDate(startOfDay(addDays(selectedDate, 7)))}
                          />
                          <Stepper
                            label="Miesiąc"
                            onPrev={() => setSelectedDate(startOfDay(addMonths(selectedDate, -1)))}
                            onNext={() => setSelectedDate(startOfDay(addMonths(selectedDate, 1)))}
                          />
                        </ScrollView>
                      ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <TinyChip label={formatDatePill(selectedDate)} iconLeft="calendar-outline" onPress={() => setDatePickerOpen(true)} />
                          <TinyChip label="Dziś" iconLeft="today-outline" tone="accent" onPress={goToToday} />
                          <Stepper
                            label="Tydzień"
                            onPrev={() => setSelectedDate(startOfDay(addDays(selectedDate, -7)))}
                            onNext={() => setSelectedDate(startOfDay(addDays(selectedDate, 7)))}
                          />
                          <Stepper
                            label="Miesiąc"
                            onPrev={() => setSelectedDate(startOfDay(addMonths(selectedDate, -1)))}
                            onNext={() => setSelectedDate(startOfDay(addMonths(selectedDate, 1)))}
                          />
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>

              {/* ✅ Tydzień jako paski dni */}
              <View ref={weekDaysAnchorRef} style={{ marginTop: 14 }}>
                {isNarrow ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 2, paddingHorizontal: 2 }}>
                    {weekDays.map((d, i) => {
                      const active = isSameDay(d, selectedDate);
                      const isTodayDay = isSameDay(d, today);
                      const inPast = d < today && !isSameDay(d, today);
                      const hasDone = inPast && hasCompletedMissionOnDate(d);

                      const bgColor = active ? colors.accent : hasDone ? "#22c55e18" : colors.bg;
                      const borderColor = active ? colors.accent : hasDone ? "#22c55e66" : colors.border;
                      const textColor = active ? "#022c22" : hasDone ? "#16a34a" : colors.text;
                      const subTextColor = active ? "#022c22" : hasDone ? "#16a34a" : colors.textMuted;

                      return (
                        <TouchableOpacity
                          key={i}
                          onPress={() => setSelectedDate(startOfDay(d))}
                          style={{
                            width: 72,
                            marginRight: 10,
                            paddingVertical: 12,
                            alignItems: "center",
                            borderRadius: 18,
                            backgroundColor: bgColor,
                            borderWidth: 1,
                            borderColor: borderColor,
                            ...(active ? softShadow : null),
                            ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          {isTodayDay && !active && (
                            <View
                              style={{
                                position: "absolute",
                                top: 9,
                                right: 10,
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                backgroundColor: colors.accent,
                              }}
                            />
                          )}

                          <Text style={{ color: subTextColor, fontSize: 12, fontWeight: "900" }}>{WEEKDAY_LABELS[i]}</Text>
                          <Text style={{ color: textColor, fontWeight: "900", fontSize: 16, marginTop: 2 }}>{d.getDate()}</Text>

                          {hasDone && !active && (
                            <View style={{ marginTop: 6, width: 7, height: 7, borderRadius: 999, backgroundColor: "#22c55e" }} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    {weekDays.map((d, i) => {
                      const active = isSameDay(d, selectedDate);
                      const isTodayDay = isSameDay(d, today);
                      const inPast = d < today && !isSameDay(d, today);
                      const hasDone = inPast && hasCompletedMissionOnDate(d);

                      const bgColor = active ? colors.accent : hasDone ? "#22c55e18" : colors.bg;
                      const borderColor = active ? colors.accent : hasDone ? "#22c55e66" : colors.border;
                      const textColor = active ? "#022c22" : hasDone ? "#16a34a" : colors.text;
                      const subTextColor = active ? "#022c22" : hasDone ? "#16a34a" : colors.textMuted;

                      return (
                        <TouchableOpacity
                          key={i}
                          onPress={() => setSelectedDate(startOfDay(d))}
                          style={{
                            flex: 1,
                            marginHorizontal: 4,
                            paddingVertical: 12,
                            alignItems: "center",
                            borderRadius: 18,
                            backgroundColor: bgColor,
                            borderWidth: 1,
                            borderColor: borderColor,
                            ...(active ? softShadow : null),
                            ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          {isTodayDay && !active && (
                            <View
                              style={{
                                position: "absolute",
                                top: 9,
                                right: 10,
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                backgroundColor: colors.accent,
                              }}
                            />
                          )}

                          <Text style={{ color: subTextColor, fontSize: 12, fontWeight: "900" }}>{WEEKDAY_LABELS[i]}</Text>
                          <Text style={{ color: textColor, fontWeight: "900", fontSize: 16, marginTop: 2 }}>{d.getDate()}</Text>

                          {hasDone && !active && (
                            <View style={{ marginTop: 6, width: 7, height: 7, borderRadius: 999, backgroundColor: "#22c55e" }} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10, fontWeight: "800" }}>
                  Tydzień: <Text style={{ color: colors.text, fontWeight: "900" }}>{formatWeekRange(weekStart)}</Text>
                </Text>
              </View>
            </View>

            {/* HEADER */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900", letterSpacing: 0.2 }}>Zadania na:</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2, fontWeight: "800" }}>{formatDayLong(selectedDate)}</Text>
              </View>

              <View ref={addTaskAnchorRef}>
                <TouchableOpacity
                  onPress={goToAddTask}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.accent,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: 999,
                    ...softShadow,
                    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#022c2218",
                      borderWidth: 1,
                      borderColor: "#022c2233",
                    }}
                  >
                    <Ionicons name="add" size={18} color="#022c22" />
                  </View>
                  <Text style={{ color: "#022c22", fontWeight: "900", marginLeft: 10, fontSize: 14, letterSpacing: 0.2 }}>
                    Dodaj zadanie
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* LISTA ZADAŃ */}
            {loading ? (
              <Text style={{ color: colors.textMuted }}>Ładowanie…</Text>
            ) : missionsForDaySorted.length === 0 ? (
              tourOpen ? (
                <View
                  style={{
                    padding: 16,
                    borderRadius: 18,
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    ...softShadow,
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontWeight: "800", marginBottom: 12 }}>
                    Brak zadań tego dnia — ale spokojnie, poniżej masz przykład 👇
                  </Text>

                  <View
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.bg,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View
                        ref={demoCheckboxAnchorRef}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 12,
                          marginRight: 10,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <View
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: 12,
                            justifyContent: "center",
                            alignItems: "center",
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: colors.bg,
                          }}
                        >
                          <Ionicons name="ellipse-outline" size={18} color={colors.textMuted} />
                        </View>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "900", letterSpacing: 0.2 }}>
                          (Przykład) Wyniosę śmieci
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                          Kliknij kółko po lewej, żeby oznaczyć jako wykonane ✅
                        </Text>
                      </View>

                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 999,
                          backgroundColor: colors.accent + "18",
                          borderWidth: 1,
                          borderColor: colors.accent + "55",
                        }}
                      >
                        <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 0.2 }}>+25 EXP</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 999,
                          backgroundColor: "#22c55e18",
                          borderWidth: 1,
                          borderColor: "#22c55e55",
                        }}
                      >
                        <Text style={{ color: "#22c55e", fontSize: 11, fontWeight: "900", letterSpacing: 0.2 }}>Wykonane ✅</Text>
                      </View>

                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>…i wtedy rośnie streak + dostajesz EXP.</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View
                  style={{
                    padding: 16,
                    borderRadius: 18,
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    ...softShadow,
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontWeight: "700" }}>Brak zadań tego dnia.</Text>
                </View>
              )
            ) : (
              missionsForDaySorted.map((m: any, idx2: number) => {
                const assigned = getAssignedMember(m);
                const creator = getCreatorMember(m);
                const diff = getDifficultyLabel(m);
                const expProgress = getExpProgress(m);
                const isDone = isMissionDoneOnDate(m, selectedDate);
                const expValue = (m.expValue ?? 0) as number;

                const samePersonAssignedAndCreator = creator && assigned ? isSameMember(assigned, creator) : false;

                const hideCreatorInfo = !creator || samePersonAssignedAndCreator;
                const hideAssignedInfo = samePersonAssignedAndCreator;
                const selfCompactRow = hideCreatorInfo && hideAssignedInfo;

                const animKey = m.id ?? `fallback-${idx2}`;
                if (!animationRefs.current[animKey]) {
                  animationRefs.current[animKey] = new Animated.Value(1);
                }
                const rowAnim = animationRefs.current[animKey];

                return (
                  <Animated.View
                    key={m.id ?? `fallback-${idx2}`}
                    style={{
                      transform: [{ scale: rowAnim }],
                      opacity: rowAnim.interpolate({
                        inputRange: [0.9, 1],
                        outputRange: [0.85, 1],
                        extrapolate: "clamp",
                      }),
                    }}
                  >
                    <View
                      style={{
                        padding: 14,
                        marginBottom: 12,
                        borderRadius: 18,
                        borderWidth: 1,
                        backgroundColor: colors.card,
                        borderColor: isDone ? "#22c55e55" : colors.border,
                        ...softShadow,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View
                          ref={(el) => {
                            if (m.id) checkboxRefs.current[m.id] = el;
                          }}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            marginRight: 10,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => {
                              const node = checkboxRefs.current[m.id];
                              if (node && node.measureInWindow) {
                                node.measureInWindow((x: number, y: number, width: number, height: number) => {
                                  const cx = x + width / 2;
                                  const cy = y + height / 2;
                                  triggerFirework(m.id, cx, cy);
                                  handleComplete({ ...m }, rowAnim);
                                });
                              } else {
                                triggerFirework(m.id, 200, 200);
                                handleComplete({ ...m }, rowAnim);
                              }
                            }}
                            style={{
                              width: "100%",
                              height: "100%",
                              borderRadius: 12,
                              justifyContent: "center",
                              alignItems: "center",
                              borderWidth: 1,
                              borderColor: isDone ? "#22c55e77" : colors.border,
                              backgroundColor: isDone ? "#22c55e18" : colors.bg,
                              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                            }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons
                              name={isDone ? "checkmark" : "ellipse-outline"}
                              size={18}
                              color={isDone ? "#22c55e" : colors.textMuted}
                            />
                          </TouchableOpacity>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: isDone ? colors.textMuted : colors.text,
                              fontSize: 15,
                              fontWeight: "900",
                              letterSpacing: 0.2,
                              textDecorationLine: isDone ? "line-through" : "none",
                            }}
                          >
                            {m.title}
                          </Text>

                          {isDone ? (
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, flexWrap: "wrap", gap: 8 }}>
                              <View
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 999,
                                  backgroundColor: "#22c55e18",
                                  borderWidth: 1,
                                  borderColor: "#22c55e55",
                                }}
                              >
                                <Text style={{ color: "#22c55e", fontSize: 11, fontWeight: "900", letterSpacing: 0.2 }}>
                                  Wykonane ✅
                                </Text>
                              </View>

                              <View
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 999,
                                  backgroundColor: colors.accent + "18",
                                  borderWidth: 1,
                                  borderColor: colors.accent + "55",
                                }}
                              >
                                <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 0.2 }}>
                                  EXP zgarnięty: +{expValue}
                                </Text>
                              </View>
                            </View>
                          ) : null}
                        </View>

                        <TouchableOpacity
                          onPress={() => handleEdit({ ...m })}
                          style={{
                            marginRight: 6,
                            padding: 10,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: colors.bg,
                            ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="create-outline" size={18} color={colors.textMuted} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleDelete({ ...m })}
                          delayLongPress={350}
                          style={{
                            padding: 10,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: colors.bg,
                            ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>

                      {selfCompactRow ? (
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 4, gap: 10 }}>
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            {assigned.avatarUrl ? (
                              <Image
                                source={{ uri: assigned.avatarUrl }}
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 999,
                                  marginRight: 8,
                                  opacity: isDone ? 0.8 : 1,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                }}
                              />
                            ) : (
                              <View
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 999,
                                  backgroundColor: colors.accent + "14",
                                  justifyContent: "center",
                                  alignItems: "center",
                                  marginRight: 8,
                                  opacity: isDone ? 0.8 : 1,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                }}
                              >
                                <Text style={{ color: colors.accent, fontWeight: "900", fontSize: 12 }}>{assigned.label?.[0] ?? "?"}</Text>
                              </View>
                            )}

                            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700" }}>Twoje zadanie</Text>
                          </View>

                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 999,
                              backgroundColor: diff.color + "22",
                              borderWidth: 1,
                              borderColor: diff.color + "66",
                              opacity: isDone ? 0.85 : 1,
                            }}
                          >
                            <Text style={{ color: diff.color, fontSize: 11, fontWeight: "800", letterSpacing: 0.2 }}>{diff.label}</Text>
                          </View>
                        </View>
                      ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 4, gap: 10 }}>
                          {assigned.avatarUrl ? (
                            <Image
                              source={{ uri: assigned.avatarUrl }}
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 999,
                                opacity: isDone ? 0.7 : 1,
                                borderWidth: 1,
                                borderColor: colors.border,
                              }}
                            />
                          ) : (
                            <View
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 999,
                                backgroundColor: colors.accent + "14",
                                justifyContent: "center",
                                alignItems: "center",
                                opacity: isDone ? 0.7 : 1,
                                borderWidth: 1,
                                borderColor: colors.border,
                              }}
                            >
                              <Text style={{ color: colors.accent, fontWeight: "900", fontSize: 14 }}>{assigned.label?.[0] ?? "?"}</Text>
                            </View>
                          )}

                          <View style={{ flex: 1 }}>
                            {!hideAssignedInfo && (
                              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                                Przypisane do: <Text style={{ color: colors.text, fontWeight: "800" }}>{assigned.label}</Text>
                              </Text>
                            )}

                            {!hideCreatorInfo && creator && (
                              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                Dodane przez: <Text style={{ color: colors.text, fontWeight: "800" }}>{creator.label}</Text>
                              </Text>
                            )}
                          </View>

                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 999,
                              backgroundColor: diff.color + "22",
                              borderWidth: 1,
                              borderColor: diff.color + "66",
                              opacity: isDone ? 0.85 : 1,
                            }}
                          >
                            <Text style={{ color: diff.color, fontSize: 11, fontWeight: "800", letterSpacing: 0.2 }}>{diff.label}</Text>
                          </View>
                        </View>
                      )}

                      {m.repeat?.type && m.repeat.type !== "none" && (
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8, marginTop: 2 }}>
                          Cykliczność:{" "}
                          {m.repeat.type === "daily"
                            ? "Codziennie"
                            : m.repeat.type === "weekly"
                            ? "Co tydzień"
                            : m.repeat.type === "monthly"
                            ? "Co miesiąc"
                            : "Brak"}
                        </Text>
                      )}

                      <View style={{ marginTop: 6, opacity: isDone ? 0.88 : 1 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>EXP za misję</Text>
                          <Text style={{ color: colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.2 }}>{expValue} EXP</Text>
                        </View>

                        <View
                          style={{
                            height: 8,
                            borderRadius: 999,
                            backgroundColor: colors.bg,
                            overflow: "hidden",
                            borderWidth: 1,
                            borderColor: colors.border,
                          }}
                        >
                          <View style={{ height: "100%", width: `${expProgress * 100}%`, borderRadius: 999, backgroundColor: colors.accent }} />
                        </View>
                      </View>

                      {!isDone && (
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 10, lineHeight: 16 }}>
                          Kliknij kółko po lewej, żeby odznaczyć jako wykonane i zgarnąć EXP 💥
                        </Text>
                      )}
                    </View>
                  </Animated.View>
                );
              })
            )}

            <View style={{ flex: 1 }} />
            <AppFooter />
          </View>
        </ScrollView>

        {/* ✅ Date picker modal */}
        <DatePickerModal
          visible={datePickerOpen && !repeatDeleteDialog && !timeTravelDialogOpen && !tourOpen}
          colors={colors}
          selectedDate={selectedDate}
          today={today}
          hasCompletedMissionOnDate={hasCompletedMissionOnDate}
          onSelectDate={(d) => setSelectedDate(startOfDay(d))}
          onClose={() => setDatePickerOpen(false)}
        />

        {/* ✅ WELCOME MODAL */}
        <WelcomeTutorialModal
          visible={welcomeModalReady && welcomeModalOpen && !repeatDeleteDialog && !timeTravelDialogOpen && !tourOpen && !datePickerOpen}
          colors={colors}
          onStart={() => markWelcomeSeen("start")}
          onSkip={() => markWelcomeSeen("skip")}
        />

        {/* ✅ Guided Tour Overlay */}
        <GuidedTourOverlay
          visible={tourOpen && !repeatDeleteDialog && !timeTravelDialogOpen && !datePickerOpen}
          colors={colors}
          steps={TOUR_STEPS}
          getNodeForStep={getNodeForStep}
          getScreenNode={() => screenRef.current}
          onClose={closeTour}
          onFinish={finishTour}
        />

        {/* WEB modal do usuwania zadań cyklicznych */}
        {repeatDeleteDialog && Platform.OS === "web" && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(15,23,42,0.70)",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 200,
              paddingHorizontal: 18,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 440,
                backgroundColor: colors.card,
                borderRadius: 18,
                padding: 18,
                borderWidth: 1,
                borderColor: colors.border,
                ...cardShadow,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900", marginBottom: 8, letterSpacing: 0.2 }}>
                Usuń zadanie cykliczne
              </Text>

              <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16, lineHeight: 18 }}>
                To zadanie powtarza się w czasie. Wybierz, co chcesz zrobić dla dnia {formatDayLong(selectedDate)}.
              </Text>

              <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                  }}
                  onPress={async () => {
                    if (!repeatDeleteDialog) return;
                    await deleteOnlyToday(repeatDeleteDialog.mission, repeatDeleteDialog.dateKey);
                    setRepeatDeleteDialog(null);
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800", textAlign: "center", letterSpacing: 0.2 }}>
                    Usuń tylko ten dzień
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: 999,
                    backgroundColor: "#ef4444",
                    ...(Platform.OS === "web"
                      ? ({ boxShadow: "0px 10px 22px rgba(239,68,68,0.22)", cursor: "pointer" } as any)
                      : {
                          shadowColor: "#ef4444",
                          shadowOpacity: 0.25,
                          shadowRadius: 14,
                          shadowOffset: { width: 0, height: 8 },
                          elevation: 5,
                        }),
                  }}
                  onPress={async () => {
                    if (!repeatDeleteDialog) return;
                    await deleteSeries(repeatDeleteDialog.mission);
                    setRepeatDeleteDialog(null);
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900", textAlign: "center", letterSpacing: 0.2 }}>
                    Usuń całą serię
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={{ alignSelf: "center", marginTop: 4, paddingVertical: 8, paddingHorizontal: 18 }} onPress={() => setRepeatDeleteDialog(null)}>
                <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700" }}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* TIME TRAVEL modal */}
        {timeTravelDialogOpen && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(15,23,42,0.75)",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 250,
              paddingHorizontal: 18,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 440,
                backgroundColor: colors.card,
                borderRadius: 18,
                padding: 18,
                borderWidth: 1,
                borderColor: colors.border,
                ...cardShadow,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#a855f718",
                    borderWidth: 1,
                    borderColor: "#a855f755",
                    marginRight: 10,
                  }}
                >
                  <Ionicons name="time-outline" size={18} color="#c084fc" />
                </View>

                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900", letterSpacing: 0.2 }}>Umiesz podróżować w czasie? 😏</Text>
              </View>

              <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 14, lineHeight: 18 }}>
                Możesz oznaczać zadania tylko w dniu, w którym je wykonujesz. Cofanie się w czasie zostawmy filmom science-fiction. ✨
              </Text>

              <TouchableOpacity
                activeOpacity={0.9}
                style={{
                  paddingVertical: 11,
                  borderRadius: 999,
                  backgroundColor: colors.accent,
                  alignSelf: "center",
                  paddingHorizontal: 22,
                  minWidth: 160,
                  ...softShadow,
                  ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                }}
                onPress={() => setTimeTravelDialogOpen(false)}
              >
                <Text style={{ color: "#022c22", fontSize: 13, fontWeight: "900", textAlign: "center", letterSpacing: 0.2 }}>
                  Okej, wracam do dziś
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 🔥 fajerwerki */}
        {!tourOpen && fireworkParticles.length > 0 && (
          <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
            {fireworkParticles.map((p) => (
              <Animated.View
                key={p.id}
                style={{
                  position: "absolute",
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: p.color,
                  left: p.originX - 4,
                  top: p.originY - 4,
                  transform: [{ translateX: p.translateX }, { translateY: p.translateY }, { scale: p.scale }],
                  opacity: p.opacity,
                }}
              />
            ))}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// app/index.web.tsx
