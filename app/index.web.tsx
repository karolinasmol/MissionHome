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

import GuidedTourOverlay from "../src/components/GuidedTourOverlay";
import type { TourStep as GuidedTourStep } from "../src/components/GuidedTourOverlay";

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
import { db, auth, onAuthStateChanged } from "../src/firebase/firebase.web";

// ✅ otwieramy krok 5 w globalnym CustomHeader (żeby nie dublować headera na ekranie)
import { setTourStep5Open as setTourStep5OpenBus } from "../src/tour/steps/homeTourSteps";

import { HOME_TOUR_STEPS } from "../src/tour/steps/homeTourSteps";

/* --------------------------------------------------------- */
/* ------------------------ HELPERS ------------------------- */
/* --------------------------------------------------------- */

// ✅ WEB-only: wyłączamy native driver na stałe (usuwa warning na web)
const USE_NATIVE_DRIVER = false;

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

  return new Date(
    firstOfTarget.getFullYear(),
    firstOfTarget.getMonth(),
    Math.min(day, lastDay),
    0,
    0,
    0,
    0
  );
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
  originX: number; // ✅ już względem screenRef
  originY: number; // ✅ już względem screenRef
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
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(p.translateY, {
          toValue: targetY,
          duration: p.duration,
          delay: p.delay,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(p.scale, {
          toValue: 1.3,
          duration: p.duration * 0.6,
          delay: p.delay,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: p.duration,
          delay: p.delay + p.duration * 0.4,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start(() => {
        setParticles((prev) => prev.filter((pp) => pp.id !== p.id));
      });
    });
  };

  return { particles, shoot };
}

/* --------------------------------------------------------- */
/* ------------------- MEASURE (web + native) ---------------- */
/* --------------------------------------------------------- */

type Rect = { x: number; y: number; width: number; height: number };

function isHTMLElement(node: any): node is HTMLElement {
  return !!node && typeof node.getBoundingClientRect === "function";
}

async function measureRect(node: any): Promise<Rect | null> {
  return new Promise((resolve) => {
    try {
      if (!node) return resolve(null);

      // ✅ WEB: DOM
      if (isHTMLElement(node)) {
        const r = node.getBoundingClientRect();
        return resolve({
          x: r.left,
          y: r.top,
          width: r.width,
          height: r.height,
        });
      }

      // ✅ RN: measureInWindow
      if (node.measureInWindow) {
        node.measureInWindow((x: number, y: number, width: number, height: number) => {
          if ([x, y, width, height].some((v) => typeof v !== "number" || Number.isNaN(v))) {
            resolve(null);
          } else {
            resolve({ x, y, width, height });
          }
        });
        return;
      }

      resolve(null);
    } catch {
      resolve(null);
    }
  });
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

  // ✅ ref do scrolla (żeby po zmianie dnia wracać na górę i “odświeżać” sekcje)
  const scrollRef = useRef<any>(null);

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
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const [tourSession, setTourSession] = useState(0);



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

  // ✅ dziś jako STATE (żeby po północy UI nie “zamrażało” logiki inPast / streak)
  const [today, setToday] = useState<Date>(() => startOfDay(new Date()));
  useEffect(() => {
    const t = setInterval(() => {
      const now = startOfDay(new Date());
      setToday((prev) => (isSameDay(prev, now) ? prev : now));
    }, 60 * 1000); // co minutę wystarczy
    return () => clearInterval(t);
  }, []);

  const [currentUser, setCurrentUser] = useState(() => auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u: any) => setCurrentUser(u));
    return unsub;
  }, []);

  const myUid = currentUser?.uid ?? null;
  const myPhotoURL = currentUser?.photoURL || null;
  const myDisplayName = currentUser?.displayName || null;

  // ✅ OPTIMISTIC UI (żeby po kliknięciu checkboxa od razu było widać "Wykonane")
  const [optimisticDone, setOptimisticDone] = useState<Record<string, true>>({});

  // ✅ HOLD SORT (żeby po odkliknięciu misja nie przeskakiwała od razu na dół)
  const COMPLETE_PREVIEW_MS = 900;
  const [holdSort, setHoldSort] = useState<Record<string, number>>({});
  const holdTimersRef = useRef<Record<string, any>>({});
  useEffect(() => {
    return () => {
      Object.values(holdTimersRef.current).forEach((t) => {
        try {
          clearTimeout(t);
        } catch {}
      });
      holdTimersRef.current = {};
    };
  }, []);

  const makeDoneKey = useCallback((m: any, date: Date) => {
    const id = String(m?.id ?? "");
    if (!id) return "";
    const repeat = m?.repeat?.type ?? "none";
    if (repeat !== "none") return `${id}::${formatDateKey(date)}`;
    return id;
  }, []);

  const isMissionDoneOnDateUI = useCallback(
    (m: any, date: Date) => {
      const k = makeDoneKey(m, date);
      if (k && optimisticDone[k]) return true;
      return isMissionDoneOnDate(m, date);
    },
    [optimisticDone, makeDoneKey]
  );

  // czyścimy optimistic po zmianie usera
  useEffect(() => {
    setOptimisticDone({});
    setHoldSort({});
    // czyścimy timery hold
    Object.values(holdTimersRef.current).forEach((t) => {
      try {
        clearTimeout(t);
      } catch {}
    });
    holdTimersRef.current = {};
  }, [myUid]);

  // czyścimy optimistic, gdy snapshot już "dogoni" stan
  useEffect(() => {
    if (!missions || !Array.isArray(missions)) return;
    setOptimisticDone((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;

      const next = { ...prev };
      let changed = false;

      for (const k of keys) {
        const parts = k.split("::");
        const id = parts[0];
        const dk = parts[1] || null;

        const m = (missions as any[]).find((x) => String(x?.id ?? "") === String(id));
        if (!m) {
          delete next[k];
          changed = true;
          continue;
        }

        if (dk) {
          const dt = parseISODate(dk);
          if (dt && isMissionDoneOnDate(m, dt)) {
            delete next[k];
            changed = true;
          }
        } else {
          if (!!m.completed) {
            delete next[k];
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [missions]);

  // ✅ po zmianie dnia: przewiń na górę (to mocno poprawia “odświeżanie sekcji” UX)
  useEffect(() => {
    try {
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
    } catch {}
  }, [selectedDate]);

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

    const unsub = onSnapshot(
      userDocRef,
      (snap) => {
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
      },
      (err) => {
        console.error("🟥 users/{uid} onSnapshot error:", err?.code, err?.message, err);

        // żeby UI nie wywalało overlay’a na twarz
        setUserStats({ level: 1, totalExp: 0 });
        setWelcomeModalOpen(true);
        setWelcomeModalReady(true);
      }
    );

    return unsub;
  }, [myUid]);

  const markWelcomeSeen = async (action: "start" | "skip") => {
    // ✅ 1) UI ma zareagować OD RAZU (bez czekania na Firebase/auth)
    setWelcomeModalOpen(false);

    if (action === "start") {
      setTourStepIndex(0);       // ✅ start od 1. kroku
      setTourOpen(true);         // ✅ pokaż overlay
      setTourSession((s) => s + 1); // ✅ wymusza świeże pomiary
    } else {
      router.replace("/");
    }


    // ✅ 2) Zapis do Firestore – tylko jeśli znamy UID
    if (!myUid) {
      console.log("🟨 markWelcomeSeen: myUid is null – started UI locally, skip saving for now.");
      return;
    }

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
    } catch (err: any) {
      console.error("🟥 WELCOME MODAL save error:", err?.code, err?.message, err);
      // ❗ nie blokujemy tutorialu alertem – UI już działa
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

    // ✅ ważne: do SORTOWANIA trzymamy świeżo odkliknięte misje "na miejscu" przez ~900ms
    const isDoneForSort = (m: any) => {
      const k = makeDoneKey(m, selectedDate);
      if (k && holdSort[k]) return false; // hold = traktuj jak "nie-done" tylko do sortu
      return isMissionDoneOnDateUI(m, selectedDate);
    };

    list.sort((a, b) => {
      const ac = isDoneForSort(a) ? 1 : 0;
      const bc = isDoneForSort(b) ? 1 : 0;
      if (ac !== bc) return ac - bc;
      const ae = (a.expValue ?? 0) as number;
      const be = (b.expValue ?? 0) as number;
      return be - ae;
    });
    return list;
  }, [missionsForDay, selectedDate, isMissionDoneOnDateUI, makeDoneKey, holdSort]);

  const hasCompletedMissionOnDate = (date: Date) => {
    const list = filterMissionsForDate(visibleMissions, date);
    return list.some((m) => isMissionDoneOnDateUI(m, date));
  };

  const streak = useMemo(() => {
    let count = 0;
    let cursor = new Date(today);
    const MAX_DAYS = 365;

    for (let i = 0; i < MAX_DAYS; i++) {
      const list = filterMissionsForDate(visibleMissions, cursor);
      const anyCompleted = list.some((m) => isMissionDoneOnDateUI(m, cursor));

      if (!anyCompleted) break;

      count += 1;
      cursor = addDays(cursor, -1);
    }

    return count;
  }, [visibleMissions, today, isMissionDoneOnDateUI]);

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
      if (!isMissionDoneOnDateUI(m, selectedDate)) return acc;
      return acc + ((m.expValue as number | undefined) ?? 0);
    }, 0);
  }, [missionsForDaySorted, selectedDate, isMissionDoneOnDateUI]);

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

    const alreadyDone = isMissionDoneOnDateUI(mission, selectedDate);
    if (alreadyDone) return; // ✅ już wykonane = nic nie rób (bez spamu alertami)

    // ✅ nie róbmy porównań na "new Date()" w środku — używamy today (startOfDay)
    const isTodaySelected = isSameDay(selectedDate, today);
    if (!isTodaySelected) {
      setTimeTravelDialogOpen(true);
      return;
    }

    // ✅ OPTIMISTIC: od razu ustawiamy done w UI
    const doneKey = makeDoneKey(mission, selectedDate);
    if (doneKey) {
      setOptimisticDone((prev) => (prev[doneKey] ? prev : { ...prev, [doneKey]: true }));

      // ✅ HOLD: utrzymaj pozycję w liście na chwilę (żeby user zobaczył ✅ + EXP)
      const expiresAt = Date.now() + COMPLETE_PREVIEW_MS;
      setHoldSort((prev) => ({ ...prev, [doneKey]: expiresAt }));

      if (holdTimersRef.current[doneKey]) {
        try {
          clearTimeout(holdTimersRef.current[doneKey]);
        } catch {}
      }

      holdTimersRef.current[doneKey] = setTimeout(() => {
        setHoldSort((prev) => {
          if (!prev[doneKey]) return prev;
          const next = { ...prev };
          delete next[doneKey];
          return next;
        });
        try {
          delete holdTimersRef.current[doneKey];
        } catch {}
      }, COMPLETE_PREVIEW_MS);
    }

    const doUpdate = async () => {
      try {
        const repeat = mission?.repeat?.type ?? "none";
        const todayKey = formatDateKey(today);

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

        // ✅ rollback optimistic + hold jeśli zapis nie wyjdzie
        if (doneKey) {
          setOptimisticDone((prev) => {
            if (!prev[doneKey]) return prev;
            const next = { ...prev };
            delete next[doneKey];
            return next;
          });

          setHoldSort((prev) => {
            if (!prev[doneKey]) return prev;
            const next = { ...prev };
            delete next[doneKey];
            return next;
          });

          if (holdTimersRef.current[doneKey]) {
            try {
              clearTimeout(holdTimersRef.current[doneKey]);
            } catch {}
            try {
              delete holdTimersRef.current[doneKey];
            } catch {}
          }
        }

        alert("Błąd podczas oznaczania jako wykonane.");
      }
    };

    if (anim) {
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.94, duration: 120, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(anim, { toValue: 1, duration: 120, useNativeDriver: USE_NATIVE_DRIVER }),
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

      // ✅ WAŻNE: na web w twoich rules masz bucket /deleted_missions/{bucketId}/deleted_missions/{missionId}
      // więc zapisujemy do: deleted_missions/{bucketId}/deleted_missions/{missionId}
      // bucketId = uid (dla prywatnych) albo familyId (dla rodzinnych)
      const bucketId = mission?.familyId ? String(mission.familyId) : String(myUid || "");

      if (!bucketId) {
        console.error("🟥 DELETE ABORT – missing bucketId (no myUid)", { mission, myUid });
        alert("Brak UID – zaloguj się ponownie.");
        return;
      }

      const deletedRef = doc(db, "deleted_missions", bucketId, "deleted_missions", mission.id);

      // ✅ kto może widzieć w koszu
      const vis = Array.from(
        new Set(
          [
            myUid,
            mission?.assignedToUserId,
            mission?.assignedByUserId,
            mission?.createdByUserId,
            mission?.assignedTo,
            mission?.assignedBy,
            mission?.createdBy,
          ]
            .filter(Boolean)
            .map((x) => String(x))
        )
      );

      await setDoc(
        deletedRef,
        {
          ...mission,
          id: mission.id, // ✅ żeby zawsze było w dokumencie
          bucketId, // ✅ debug/łatwiejsze zapytania
          originalCollection: "missions",
          deletedAt: new Date().toISOString(),
          visibleTo: vis,
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

  const webConfirm = (msg: string) => {
    try {
      // @ts-ignore
      return typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(msg) : true;
    } catch {
      return true;
    }
  };

  const handleDelete = (mission: any) => {
    const isRepeating = mission?.repeat?.type && mission.repeat.type !== "none";
    const dateKey = formatDateKey(selectedDate);

    if (!isRepeating) {
      const ok = webConfirm("Czy na pewno chcesz usunąć to zadanie?");
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
  const [hintNavRow, setHintNavRow] = useState(true);
  const [hintWeekRow, setHintWeekRow] = useState(true);
  const isPhone = screenW < 420;
  const uiScale = Math.max(0.82, Math.min(1, screenW / 430));
  // ✅ mobile-web: kiedy da się zmieścić 7 dni bez scrolla
  const canFitWeekRow = screenW >= 360;

  // ✅ stabilne odstępy bez `gap` (Safari/iOS/RNW)
  const HSP = isPhone ? 6 : 8; // horizontal spacing

  // ✅ na telefonie pokazujemy hint przez kilka sekund i dopiero gaśnie
  useEffect(() => {
    if (!isNarrow) return;
    setHintNavRow(true);
    const t = setTimeout(() => setHintNavRow(false), 4500);
    return () => clearTimeout(t);
  }, [isNarrow, selectedDate]);

  useEffect(() => {
    if (!isNarrow) return;
    setHintWeekRow(true);
    const t = setTimeout(() => setHintWeekRow(false), 4500);
    return () => clearTimeout(t);
  }, [isNarrow, selectedDate]);

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

    // ✅ RESPONSYWNE ROZMIARY
    const h = Math.round(44 * uiScale);
    const px = Math.round(12 * uiScale);
    const gap = Math.round(8 * uiScale);
    const iconSize = Math.round(16 * uiScale);
    const fontSize = Math.round(12 * uiScale);

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.9}
        style={{
          height: h,
          paddingHorizontal: px,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: border,
          backgroundColor: bg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap,
          ...(width ? ({ width } as any) : null),
          ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {iconLeft ? (
          <Ionicons name={iconLeft} size={iconSize} color={tone === "accent" ? "#022c22" : colors.textMuted} />
        ) : null}

        <Text style={{ color: text, fontSize: fontSize, fontWeight: "900", letterSpacing: 0.2 }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const ScrollHintOverlay = ({ side }: { side: "left" | "right" }) => {
    if (Platform.OS !== "web") return null;
    if (!isNarrow) return null; // ✅ tylko mobile-web

    const isLeft = side === "left";
    return (
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 34,
          ...(isLeft ? { left: 0 } : { right: 0 }),
          justifyContent: "center",
          alignItems: isLeft ? "flex-start" : "flex-end",
          paddingHorizontal: 6,
          zIndex: 5,
          ...(Platform.OS === "web"
            ? ({
                background: isLeft
                  ? `linear-gradient(90deg, ${colors.card} 0%, ${colors.card}00 100%)`
                  : `linear-gradient(270deg, ${colors.card} 0%, ${colors.card}00 100%)`,
              } as any)
            : null),
        }}
        pointerEvents="none"
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            backgroundColor: colors.bg,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.85,
          }}
        >
          <Ionicons name={isLeft ? "chevron-back" : "chevron-forward"} size={14} color={colors.textMuted} />
        </View>
      </View>
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
    // ✅ RESPONSYWNE ROZMIARY (ciasny Stepper)
    const h = Math.round(36 * uiScale);        // ✅ brakowało -> fix error
    const btn = h;                             // strzałki mają tyle co wysokość
    const minW = isPhone ? 112 : isNarrow ? 128 : 150;
    const padX = isPhone ? 6 : isNarrow ? 8 : 10;
    const iconSize = Math.round(16 * uiScale);
    const fontSize = Math.round(12 * uiScale);

    return (
      <View
        style={{
          height: h,
          minWidth: minW,
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
            width: btn,
            height: h,
            alignItems: "center",
            justifyContent: "center",
            ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`${label} - poprzedni`}
        >
          <Ionicons name="chevron-back" size={iconSize} color={colors.text} />
        </TouchableOpacity>

        <View
          style={{
            paddingHorizontal: padX, // ✅ mniejsze = mniej miejsca obok strzałek
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.text, fontSize, fontWeight: "900", letterSpacing: 0.2 }}>
            {label}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onNext}
          style={{
            width: btn,
            height: h,
            alignItems: "center",
            justifyContent: "center",
            ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`${label} - następny`}
        >
          <Ionicons name="chevron-forward" size={iconSize} color={colors.text} />
        </TouchableOpacity>
      </View>
    );
  };


  /* --------------------------------------------------------- */
  /* -------------------- TOUR: steps + node ------------------ */
  /* --------------------------------------------------------- */

  const getNodeForStep = useCallback(
    (key: GuidedTourStep["key"]) => {
      if (key === "hud") return hudAnchorRef.current;
      if (key === "week") return weekDaysAnchorRef.current;
      if (key === "add") return addTaskAnchorRef.current;

      if (key === "checkbox") {
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

  // ✅ token do wymuszenia re-measure w tourze (zmiana dnia / lista / pierwszy checkbox)
  const tourRefreshToken = useMemo(() => {
    const firstId = missionsForDaySorted?.[0]?.id ?? "none";
    const len = missionsForDaySorted?.length ?? 0;
    return `${formatDateKey(selectedDate)}|${firstId}|${len}`;
  }, [selectedDate, missionsForDaySorted]);

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
            © {new Date().getFullYear()} MissionHome - wszystkie prawa zastrzeżone
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
        <View
          style={{
            ...({ pointerEvents: "none" } as any), // ✅ RNW: pointerEvents prop deprecated
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
          ref={scrollRef}
          style={{ flex: 1, zIndex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            width: "100%",
            paddingVertical: isNarrow ? 12 : 18,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 980, // ✅ na mobile web 1344 robi “desktop vibe”
              paddingHorizontal: isNarrow ? 12 : 18,
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
                borderRadius: isNarrow ? 18 : 24,
                padding: isNarrow ? 12 : 16,
                marginBottom: isNarrow ? 12 : 16,
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
                    <Text style={{ color: colors.accent, fontWeight: "900", fontSize: 16 }}>
                      {hudMember.label?.[0] ?? "?"}
                    </Text>
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
                        Dziś zgarnięte: <Text style={{ color: colors.text, fontWeight: "900" }}>{dayEarned}</Text> EXP
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        Próg LVL {hudLevel + 1}:{" "}
                        <Text style={{ color: colors.text, fontWeight: "900" }}>{requiredExpForLevel(hudLevel + 1)}</Text>
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
                        <View style={{ position: "relative" }}>
                          {hintNavRow && <ScrollHintOverlay side="right" />}

                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingVertical: 2, paddingRight: 28 }}
                            onScrollBeginDrag={() => setHintNavRow(false)}
                          >
                            <View style={{ marginRight: HSP }}>
                              <TinyChip label={formatDatePill(selectedDate)} iconLeft="calendar-outline" onPress={() => setDatePickerOpen(true)} />
                            </View>

                            <View style={{ marginRight: HSP }}>
                              <TinyChip label="Dziś" iconLeft="today-outline" tone="accent" onPress={goToToday} />
                            </View>

                            <View style={{ marginRight: HSP }}>
                              <Stepper
                                label="Tydzień"
                                onPrev={() => setSelectedDate(startOfDay(addDays(selectedDate, -7)))}
                                onNext={() => setSelectedDate(startOfDay(addDays(selectedDate, 7)))}
                              />
                            </View>

                            <View style={{ marginRight: 0 }}>
                              <Stepper
                                label="Miesiąc"
                                onPrev={() => setSelectedDate(startOfDay(addMonths(selectedDate, -1)))}
                                onNext={() => setSelectedDate(startOfDay(addMonths(selectedDate, 1)))}
                              />
                            </View>
                          </ScrollView>
                        </View>
                      ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <TinyChip label={formatDatePill(selectedDate)} iconLeft="calendar-outline" onPress={() => setDatePickerOpen(true)} />
                          <TinyChip label="Dziś" iconLeft="today-outline" tone="accent" onPress={goToToday} />
                          <Stepper
                            label=" Tydzień"
                            onPrev={() => setSelectedDate(startOfDay(addDays(selectedDate, -7)))}
                            onNext={() => setSelectedDate(startOfDay(addDays(selectedDate, 7)))}
                          />
                          <Stepper
                            label="  Miesiąc"
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
                {!isNarrow ? (
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
                            justifyContent: "center",
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

                          <Text style={{ color: subTextColor, fontSize: isPhone ? 11 : 12, fontWeight: "900" }}>{WEEKDAY_LABELS[i]}</Text>
                          <Text style={{ color: textColor, fontWeight: "900", fontSize: isPhone ? 15 : 16, marginTop: 2 }}>{d.getDate()}</Text>

                          {hasDone && !active && <View style={{ marginTop: 6, width: 7, height: 7, borderRadius: 999, backgroundColor: "#22c55e" }} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : canFitWeekRow ? (
                  <View
                    style={{
                      padding: 8,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.bg,
                    }}
                  >
                    <View style={{ flexDirection: "row" }}>
                      {weekDays.map((d, i) => {
                        const active = isSameDay(d, selectedDate);
                        const isTodayDay = isSameDay(d, today);
                        const inPast = d < today && !isSameDay(d, today);
                        const hasDone = inPast && hasCompletedMissionOnDate(d);

                        const bgColor = active ? colors.accent : hasDone ? "#22c55e18" : colors.card;
                        const borderColor = active ? colors.accent : hasDone ? "#22c55e66" : colors.border;
                        const textColor = active ? "#022c22" : hasDone ? "#16a34a" : colors.text;
                        const subTextColor = active ? "#022c22" : hasDone ? "#16a34a" : colors.textMuted;

                        return (
                          <TouchableOpacity
                            key={i}
                            onPress={() => setSelectedDate(startOfDay(d))}
                            activeOpacity={0.9}
                            style={{
                              flex: 1,
                              marginHorizontal: 3,
                              paddingVertical: isPhone ? 10 : 12,
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 16,
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
                                  top: 8,
                                  right: 8,
                                  width: 7,
                                  height: 7,
                                  borderRadius: 999,
                                  backgroundColor: colors.accent,
                                }}
                              />
                            )}

                            <Text style={{ color: subTextColor, fontSize: 11, fontWeight: "900" }}>{WEEKDAY_LABELS[i]}</Text>
                            <Text style={{ color: textColor, fontWeight: "900", fontSize: 15, marginTop: 2 }}>{d.getDate()}</Text>

                            {hasDone && !active && <View style={{ marginTop: 6, width: 6, height: 6, borderRadius: 999, backgroundColor: "#22c55e" }} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <View style={{ position: "relative" }}>
                    {hintWeekRow && <ScrollHintOverlay side="right" />}

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingVertical: 2, paddingHorizontal: 2, paddingRight: 28 }}
                      onScrollBeginDrag={() => setHintWeekRow(false)}
                    >
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
                              width: isPhone ? 54 : 64,
                              marginRight: 8,
                              paddingVertical: isPhone ? 8 : 10,
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: isPhone ? 14 : 16,
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

                            {hasDone && !active && <View style={{ marginTop: 6, width: 7, height: 7, borderRadius: 999, backgroundColor: "#22c55e" }} />}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10, fontWeight: "800" }}>
                  Tydzień: <Text style={{ color: colors.text, fontWeight: "900" }}>{formatWeekRange(weekStart)}</Text>
                </Text>
              </View>
            </View>

            {/* LISTA ZADAŃ */}
            {/* HEADER: Zadania + Dodaj */}
            <View
              style={{
                marginTop: 14,
                marginBottom: 10,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900", letterSpacing: 0.2 }}>Zadania na dziś</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "800", marginTop: 2 }}>{formatDayLong(selectedDate)}</Text>
              </View>

              <TouchableOpacity
                ref={addTaskAnchorRef}
                onPress={goToAddTask}
                activeOpacity={0.9}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 999,
                  backgroundColor: colors.accent,
                  borderWidth: 1,
                  borderColor: colors.accent + "00",
                  flexDirection: "row",
                  alignItems: "center",
                  ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Dodaj zadanie"
              >
                <Ionicons name="add" size={18} color="#022c22" />
                <Text style={{ color: "#022c22", fontWeight: "900", marginLeft: 8, fontSize: 13, letterSpacing: 0.2 }}>
                  Dodaj zadanie
                </Text>
              </TouchableOpacity>
            </View>

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
                const isDone = isMissionDoneOnDateUI(m, selectedDate);
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

                const renderAvatar = (avatarUrl: string | null, label: string, size: number) => {
                  if (avatarUrl) {
                    return (
                      <Image
                        source={{ uri: avatarUrl }}
                        style={{
                          width: size,
                          height: size,
                          borderRadius: 999,
                          marginRight: 8,
                          opacity: isDone ? 0.8 : 1,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      />
                    );
                  }

                  return (
                    <View
                      style={{
                        width: size,
                        height: size,
                        borderRadius: 999,
                        marginRight: 8,
                        backgroundColor: colors.accent + "14",
                        borderWidth: 1,
                        borderColor: colors.border,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: isDone ? 0.8 : 1,
                      }}
                    >
                      <Text style={{ color: colors.accent, fontWeight: "900", fontSize: Math.max(11, Math.round(size * 0.45)) }}>
                        {(label?.[0] ?? "?").toUpperCase()}
                      </Text>
                    </View>
                  );
                };

                const repeatLabel =
                  m?.repeat?.type === "daily"
                    ? "Codziennie"
                    : m?.repeat?.type === "weekly"
                    ? "Co tydzień"
                    : m?.repeat?.type === "monthly"
                    ? "Co miesiąc"
                    : null;

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
                        padding: isNarrow ? 12 : 14,
                        marginBottom: isNarrow ? 10 : 12,
                        borderRadius: isNarrow ? 18 : 22,
                        borderWidth: 1,
                        backgroundColor: colors.card,
                        borderColor: isDone ? "#22c55e66" : colors.border,
                        ...cardShadow,
                      }}
                    >
                      {/* Top row: checkbox + title + actions */}
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        {/* Checkbox wrapper (anchor for fireworks + tour) */}
                        <View
                          ref={(node) => {
                            try {
                              if (m?.id) checkboxRefs.current[m.id] = node;
                            } catch {}
                          }}
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            marginRight: 10,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <TouchableOpacity
                            onPress={async () => {
                              try {
                                const node = checkboxRefs.current[m.id];
                                const r = await measureRect(node);
                                const sr = await measureRect(screenRef.current);
                                const offX = sr?.x ?? 0;
                                const offY = sr?.y ?? 0;

                                if (r) {
                                  const cx = r.x - offX + r.width / 2;
                                  const cy = r.y - offY + r.height / 2;
                                  triggerFirework(String(m.id), cx, cy);
                                }
                              } catch {}

                              handleComplete(m, rowAnim);
                            }}
                            activeOpacity={0.9}
                            style={{
                              width: "100%",
                              height: "100%",
                              borderRadius: 12,
                              justifyContent: "center",
                              alignItems: "center",
                              borderWidth: 1,
                              borderColor: isDone ? "#22c55e88" : colors.border,
                              backgroundColor: isDone ? "#22c55e18" : "transparent",
                              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                            }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityLabel={isDone ? "Zadanie wykonane" : "Oznacz jako wykonane"}
                          >
                            <Ionicons name={isDone ? "checkmark" : "ellipse-outline"} size={18} color={isDone ? "#22c55e" : colors.textMuted} />
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
                            numberOfLines={2}
                          >
                            {m.title || m.name || "Bez tytułu"}
                          </Text>

                          {/* DONE badges (like native) */}
                          {isDone ? (
                            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                              <View
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 999,
                                  backgroundColor: "#22c55e22",
                                  borderWidth: 1,
                                  borderColor: "#22c55e66",
                                  marginRight: 8,
                                  marginBottom: 6,
                                }}
                              >
                                <Text style={{ color: "#22c55e", fontSize: 11, fontWeight: "900", letterSpacing: 0.2 }}>Wykonane ✅</Text>
                              </View>

                              <View
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 999,
                                  backgroundColor: colors.accent + "18",
                                  borderWidth: 1,
                                  borderColor: colors.accent + "55",
                                  marginBottom: 6,
                                }}
                              >
                                <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 0.2 }}>
                                  EXP zgarnięty: +{expValue}
                                </Text>
                              </View>
                            </View>
                          ) : null}
                        </View>

                        {/* Edit */}
                        <TouchableOpacity
                          onPress={() => handleEdit({ ...m })}
                          style={{ marginRight: 6, padding: 6, ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null) }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          accessibilityLabel="Edytuj"
                        >
                          <Ionicons name="create-outline" size={18} color={colors.textMuted} />
                        </TouchableOpacity>

                        {/* Delete */}
                        <TouchableOpacity
                          onPress={() => handleDelete({ ...m })}
                          style={{ padding: 6, ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null) }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          accessibilityLabel="Usuń"
                        >
                          <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>

                      {/* Assigned/Creator row + difficulty chip (like native) */}
                      {selfCompactRow ? (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginTop: 10,
                            marginBottom: 4,
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 10 }}>
                            {renderAvatar(assigned?.avatarUrl || null, assigned?.label || "Ty", 24)}
                            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "800" }} numberOfLines={1}>
                              Twoje zadanie
                            </Text>
                          </View>

                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 999,
                              backgroundColor: diff.color + "33",
                              borderWidth: 1,
                              borderColor: diff.color + "88",
                              opacity: isDone ? 0.85 : 1,
                            }}
                          >
                            <Text style={{ color: diff.color, fontSize: 11, fontWeight: "800", letterSpacing: 0.2 }}>{diff.label}</Text>
                          </View>
                        </View>
                      ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, marginBottom: 4 }}>
                          {renderAvatar(assigned?.avatarUrl || null, assigned?.label || "?", 32)}

                          <View style={{ flex: 1 }}>
                            {!hideAssignedInfo ? (
                              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "800" }}>
                                Przypisane do: <Text style={{ color: colors.text, fontWeight: "900" }}>{assigned?.label}</Text>
                              </Text>
                            ) : null}

                            {!hideCreatorInfo && creator ? (
                              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800", marginTop: 2 }}>
                                Dodane przez: <Text style={{ color: colors.text, fontWeight: "900" }}>{creator?.label}</Text>
                              </Text>
                            ) : null}
                          </View>

                          <View
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 999,
                              backgroundColor: diff.color + "33",
                              borderWidth: 1,
                              borderColor: diff.color + "88",
                              opacity: isDone ? 0.85 : 1,
                            }}
                          >
                            <Text style={{ color: diff.color, fontSize: 11, fontWeight: "800", letterSpacing: 0.2 }}>{diff.label}</Text>
                          </View>
                        </View>
                      )}

                      {/* Repeat info */}
                      {repeatLabel ? (
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 6, fontWeight: "800" }}>
                          Cykliczność: {repeatLabel}
                        </Text>
                      ) : null}

                      {/* EXP bar */}
                      <View style={{ marginTop: 6, opacity: isDone ? 0.85 : 1 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800" }}>EXP za misję</Text>
                          <Text style={{ color: colors.text, fontSize: 11, fontWeight: "900" }}>{expValue} EXP</Text>
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
                          <View
                            style={{
                              height: "100%",
                              width: `${expProgress * 100}%`,
                              borderRadius: 999,
                              backgroundColor: colors.accent,
                            }}
                          />
                        </View>
                      </View>

                      {/* Hint only when NOT done */}
                      {!isDone ? (
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 10, fontWeight: "800", lineHeight: 16 }}>
                          Kliknij kółko po lewej, żeby odznaczyć jako wykonane i zgarnąć EXP 💥
                        </Text>
                      ) : null}
                    </View>
                  </Animated.View>
                );
              })
            )}

            {/* FOOTER */}
            <AppFooter />
          </View>
        </ScrollView>

        {/* ✅ FIREWORK OVERLAY */}
        <View
          style={{
            ...({ pointerEvents: "none" } as any),
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 5000,
          }}
        >
          {fireworkParticles.map((p) => (
            <Animated.View
              key={p.id}
              style={{
                position: "absolute",
                left: p.originX,
                top: p.originY,
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: p.color,
                opacity: p.opacity,
                transform: [{ translateX: p.translateX }, { translateY: p.translateY }, { scale: p.scale }],
              }}
            />
          ))}
        </View>

        {/* ✅ Date picker modal */}
        <DatePickerModal
          visible={datePickerOpen}
          colors={colors}
          selectedDate={selectedDate}
          today={today}
          hasCompletedMissionOnDate={hasCompletedMissionOnDate}
          onSelectDate={(d) => setSelectedDate(startOfDay(d))}
          onClose={() => setDatePickerOpen(false)}
        />

        {/* ✅ Repeat delete dialog */}
        {repeatDeleteDialog ? (
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 9000,
              backgroundColor: "rgba(15,23,42,0.78)",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 18,
              paddingVertical: 18,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 520,
                backgroundColor: colors.card,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 16,
                ...cardShadow,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "900" }}>Usuwanie powtarzanego zadania</Text>
                <TouchableOpacity
                  onPress={() => setRepeatDeleteDialog(null)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                  }}
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 10, lineHeight: 18, fontWeight: "700" }}>
                To zadanie jest powtarzane. Chcesz usunąć całą serię, czy tylko ukryć je w wybranym dniu?
              </Text>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <TouchableOpacity
                  onPress={async () => {
                    const { mission } = repeatDeleteDialog;
                    setRepeatDeleteDialog(null);
                    await deleteSeries(mission);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    paddingVertical: 12,
                    borderRadius: 999,
                    backgroundColor: "#ef4444",
                    alignItems: "center",
                    justifyContent: "center",
                    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>Usuń serię</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    const { mission, dateKey } = repeatDeleteDialog;
                    setRepeatDeleteDialog(null);
                    await deleteOnlyToday(mission, dateKey);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    paddingVertical: 12,
                    borderRadius: 999,
                    backgroundColor: colors.accent,
                    alignItems: "center",
                    justifyContent: "center",
                    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                  }}
                >
                  <Text style={{ color: "#022c22", fontWeight: "900", fontSize: 13 }}>Tylko ten dzień</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => setRepeatDeleteDialog(null)}
                style={{
                  marginTop: 10,
                  paddingVertical: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bg,
                  alignItems: "center",
                  justifyContent: "center",
                  ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "900", fontSize: 13 }}>Anuluj</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* ✅ Time-travel dialog */}
        {timeTravelDialogOpen ? (
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 9000,
              backgroundColor: "rgba(15,23,42,0.78)",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 18,
              paddingVertical: 18,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 520,
                backgroundColor: colors.card,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 16,
                ...cardShadow,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "900" }}>Hej, to nie jest „dziś” 😉</Text>
                <TouchableOpacity
                  onPress={() => setTimeTravelDialogOpen(false)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                  }}
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 10, lineHeight: 18, fontWeight: "700" }}>
                Odhaczanie działa tylko dla dzisiejszej daty, żeby EXP i streak były uczciwe. Przeskoczyć na „Dziś”?
              </Text>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  onPress={() => {
                    setTimeTravelDialogOpen(false);
                    goToToday();
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 999,
                    backgroundColor: colors.accent,
                    alignItems: "center",
                    justifyContent: "center",
                    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                  }}
                >
                  <Text style={{ color: "#022c22", fontWeight: "900", fontSize: 13 }}>Idź na dziś</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setTimeTravelDialogOpen(false)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                    alignItems: "center",
                    justifyContent: "center",
                    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 13 }}>Zostaję</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

                {/* ✅ Welcome modal */}
                {welcomeModalReady ? (
                  <WelcomeTutorialModal
                    visible={welcomeModalOpen}
                    colors={colors}
                    onStart={() => markWelcomeSeen("start")}
                    onSkip={() => markWelcomeSeen("skip")}
                  />
                ) : null}

                {/* ✅ Guided tour overlay (MUSI być w środku komponentu) */}
                <GuidedTourOverlay
                  visible={tourOpen}
                  stepIndex={tourStepIndex}
                  steps={HOME_TOUR_STEPS}
                  totalSteps={15}
                  stepIndexOffset={0}
                  getNodeForStep={getNodeForStep}
                  getScreenNode={() => screenRef.current}
                  refreshToken={`${tourRefreshToken}|${tourSession}`}
                  colors={colors}
                  onPrev={() => setTourStepIndex((i) => Math.max(0, i - 1))}
                  onNext={() => {
                    const last = HOME_TOUR_STEPS.length - 1;
                    if (tourStepIndex >= last) {
                      finishTour();
                    } else {
                      setTourStepIndex((i) => i + 1);
                    }
                  }}
                  onClose={() => {
                    setTourOpen(false);
                    setTourStepIndex(0);
                    closeTour();
                  }}
                />
              </View>
            </SafeAreaView>
          );
        }


//app/index.web.tsx
