// app/index.tsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  Image,
  Animated,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import { db } from "../src/firebase/firebase"; // ✅ bez .web
import { auth } from "../src/firebase/firebase";

/* --------------------------------------------------------- */
/* ------------------------ HELPERS ------------------------- */
/* --------------------------------------------------------- */

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
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

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
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

function formatWeekRange(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  return `${weekStart.getDate()}–${weekEnd.getDate()} ${weekStart.toLocaleDateString(
    "pl-PL",
    { month: "short" }
  )}`;
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
 *
 * LVL 1 → 0
 * LVL 2 → 100
 * LVL 3 → 250
 * LVL 4 → 450
 * LVL 5 → 700
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

    const dueRaw =
      m.dueDate?.toDate?.() ? m.dueDate.toDate() : new Date(m.dueDate);
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

  // NEW: per-day completion for recurring missions
  if (repeat !== "none") {
    if (Array.isArray(m.completedDates) && m.completedDates.includes(dateKey)) {
      return true;
    }

    // legacy support
    const completedAt = toSafeDate(m.completedAt);
    if (completedAt && isSameDay(completedAt, date)) return true;

    return false;
  }

  // one-off missions
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
    const COLORS = [
      "#22c55e",
      "#0ea5e9",
      "#eab308",
      "#f43f5e",
      "#a855f7",
      "#f472b6",
      "#2dd4bf",
    ];

    const count = 32 + Math.floor(Math.random() * 12); // 32–44 cząstek
    const coreCount = Math.floor(count * 0.35); // ~1/3 – szybki flash
    const newParticles: FireworkParticle[] = [];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const isCore = i < coreCount;

      const distance = isCore
        ? 10 + Math.random() * 18 // krótki wybuch przy guziku
        : 40 + Math.random() * 80; // dalszy rozprysk

      const duration = isCore
        ? 350 + Math.random() * 200
        : 800 + Math.random() * 400;

      const delay = isCore ? 0 : 120 + Math.random() * 120; // druga faza lekko opóźniona

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
/* --------------------- MAIN COMPONENT --------------------- */
/* --------------------------------------------------------- */

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { missions, loading } = useMissions();
  const { members } = useFamily();

  const { particles: fireworkParticles, shoot: triggerFirework } =
    useFireworkManager();

  // refy do checkboxów
  const checkboxRefs = useRef<Record<string, any>>({});

  console.log("🟦 RENDER HOME – missions count:", missions?.length);

  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [timeTravelDialogOpen, setTimeTravelDialogOpen] = useState(false);

  const [userStats, setUserStats] = useState<{
    level: number;
    totalExp: number;
  } | null>(null);

  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

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
    return members
      .map((x: any) => String(x.uid || x.userId || x.id || ""))
      .filter((id: string) => !!id);
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

    // 1) Zadania przypisane bezpośrednio do mnie
    if (assignedTo && assignedTo === myId) return true;

    // 2) Legacy: brak assignedToUserId, ale jestem twórcą / przypisującym
    if (!assignedTo && (assignedBy === myId || createdBy === myId)) {
      return true;
    }

    // 3) Zadania, które JA przypisałem do kogoś z mojej rodziny
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
  /* --------- NASŁUCH userStats z kolekcji "users" ---------- */
  /* --------------------------------------------------------- */

  useEffect(() => {
    if (!myUid) return;

    const userDocRef = doc(db, "users", myUid);
    const unsub = onSnapshot(userDocRef, (snap) => {
      const data = snap.data();
      if (data) {
        setUserStats({
          level: (data.level as number | undefined) ?? 1,
          totalExp: (data.totalExp as number | undefined) ?? 0,
        });
      }
    });

    return unsub;
  }, [myUid]);

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

  // 🔸 kto DODAŁ / PRZYPISAŁ zadanie
  const getCreatorMember = (m: any) => {
    const rawId = m?.assignedByUserId || m?.createdByUserId || null;
    const creatorId = rawId ? String(rawId) : null;
    const creatorName = m?.assignedByName || m?.createdByName || null;

    if (!creatorId && !creatorName) return null;

    if (myUid && creatorId === String(myUid)) {
      const avatarUrl =
        (meFromMembers as any)?.avatarUrl ||
        (meFromMembers as any)?.photoURL ||
        myPhotoURL ||
        null;

      const label =
        creatorName ||
        (meFromMembers as any)?.displayName ||
        myDisplayName ||
        "Ty";

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
        label:
          found.displayName || found.username || creatorName || "Bez nazwy",
        avatarUrl: found.avatarUrl || found.photoURL || null,
      };
    }

    return {
      id: creatorId || "unknown",
      label: creatorName,
      avatarUrl: null,
    };
  };

  // 🔸 do kogo jest PRZYPISANE zadanie
  const getAssignedMember = (m: any) => {
    const assignedId = m?.assignedToUserId ? String(m.assignedToUserId) : null;
    const byId = m?.assignedByUserId || m?.createdByUserId || null;
    const treatAsSelf =
      !!myUid &&
      (assignedId === String(myUid) || (!assignedId && byId === myUid));

    if (treatAsSelf) {
      const level =
        (meFromMembers as any)?.level ??
        (m.assignedToLevel as number | undefined) ??
        1;
      const totalExp =
        (meFromMembers as any)?.totalExp ??
        (m.assignedToTotalExp as number | undefined) ??
        0;

      const avatarUrl =
        (meFromMembers as any)?.avatarUrl ||
        (meFromMembers as any)?.photoURL ||
        myPhotoURL ||
        null;

      const label =
        m.assignedToName ||
        (meFromMembers as any)?.displayName ||
        myDisplayName ||
        "Ty";

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
        avatarUrl:
          m.assignedToAvatarUrl || found.avatarUrl || found.photoURL || null,
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

  const missionsForDay = useMemo(
    () => filterMissionsForDate(visibleMissions, selectedDate),
    [visibleMissions, selectedDate]
  );

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

  const hudLevel = Math.max(
    1,
    Number(userStats?.level ?? hudMember?.level ?? 1)
  );
  const hudTotalExp = Math.max(
    0,
    Number(userStats?.totalExp ?? hudMember?.totalExp ?? 0)
  );

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
    return missionsForDaySorted.reduce((acc, m) => {
      return acc + ((m.expValue as number | undefined) ?? 0);
    }, 0);
  }, [missionsForDaySorted]);

  /* --------------------------------------------------------- */
  /* 🔹 ANIMACJE KART MISJI ---------------------------------- */
  /* --------------------------------------------------------- */

  const animationRefs = useRef<Record<string, Animated.Value>>({});

  /* --------------------------------------------------------- */
  /* -------------------- COMPLETE MISSION -------------------- */
  /* --------------------------------------------------------- */

  const handleComplete = (mission: any, anim?: Animated.Value) => {
    if (!mission?.id) {
      Alert.alert("Ups", "Brak ID zadania – nie mogę oznaczyć jako wykonane.");
      return;
    }

    const alreadyDone = isMissionDoneOnDate(mission, selectedDate);
    if (alreadyDone) {
      Alert.alert("Gotowe ✅", "To zadanie jest już oznaczone jako wykonane.");
      return;
    }

    // ✅ blokada: nie da się odznaczać poza dzisiaj
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

            // ✅ kto wykonał (per dzień)
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

          // ✅ kto wykonał (jednorazowe)
          completedByUserId: byUserId,
          completedByName: byName,
        });
      } catch (err: any) {
        console.error("🟥 COMPLETE ERROR:", err?.code, err?.message, err);
        Alert.alert(
          "Błąd",
          "Błąd podczas oznaczania jako wykonane. Spróbuj ponownie."
        );
      }
    };

    // jeśli mamy animację dla tej karty – zrób mały bounce przed zapisem
    if (anim) {
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 0.94,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // po animacji wykonaj zapis w Firestore
        doUpdate();
      });
    } else {
      // fallback – bez animacji
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
        Alert.alert("Błąd", "Brak ID zadania – nie mogę usunąć.");
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
        console.error(
          "🟥 DELETE ERROR (fallback archived):",
          err2?.code,
          err2?.message,
          err2
        );
      }

      Alert.alert(
        "Błąd",
        "Błąd podczas usuwania zadania. Spróbuj ponownie później."
      );
    }
  };

  const deleteOnlyToday = async (mission: any, dateKey: string) => {
    try {
      if (!mission?.id) {
        console.error("🟥 SKIP ABORT – missing mission.id", mission);
        Alert.alert("Błąd", "Brak ID zadania – nie mogę ukryć dla tego dnia.");
        return;
      }

      const missionRef = doc(db, "missions", mission.id);
      const prevSkip: string[] = Array.isArray(mission.skipDates)
        ? mission.skipDates
        : [];
      if (prevSkip.includes(dateKey)) {
        console.log("🟨 SKIP already contains date", dateKey);
        return;
      }

      const nextSkip = [...prevSkip, dateKey];

      await updateDoc(missionRef, {
        skipDates: nextSkip,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error("🟥 SKIP ERROR:", err?.code, err?.message, err);
      Alert.alert(
        "Błąd",
        "Błąd podczas ukrywania zadania dla tego dnia. Spróbuj ponownie."
      );
    }
  };

  const handleDelete = (mission: any) => {
    const isRepeating = mission?.repeat?.type && mission.repeat.type !== "none";
    const dateKey = formatDateKey(selectedDate);

    if (!isRepeating) {
      Alert.alert("Usuń zadanie", "Czy na pewno chcesz usunąć to zadanie?", [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Usuń",
          style: "destructive",
          onPress: () => deleteSeries(mission),
        },
      ]);
      return;
    }

    Alert.alert(
      "Usuń zadanie cykliczne",
      "To zadanie powtarza się w czasie. Co chcesz zrobić?",
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Tylko ten dzień",
          onPress: () => deleteOnlyToday(mission, dateKey),
        },
        {
          text: "Całą serię",
          style: "destructive",
          onPress: () => deleteSeries(mission),
        },
      ]
    );
  };

  /* --------------------------------------------------------- */
  /* ------------------------ EDIT NAV ------------------------ */
  /* --------------------------------------------------------- */

  const handleEdit = (mission: any) => {
    router.push({
      pathname: "/editmission",
      params: {
        missionId: mission.id,
        date: (
          mission.dueDate.toDate?.()
            ? mission.dueDate.toDate()
            : new Date(mission.dueDate)
        ).toISOString(),
      },
    });
  };

  const goToAddTask = () => {
    router.push({
      pathname: "/add-task",
      params: { date: selectedDate.toISOString() },
    });
  };

  const goToToday = () => {
    setSelectedDate(startOfDay(new Date()));
  };

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

  const FooterLink = ({ label, to }: { label: string; to?: any }) => {
    return (
      <TouchableOpacity
        activeOpacity={0.86}
        onPress={() => (to ? safePush(to) : undefined)}
        style={{ marginTop: 4 }}
      >
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: "600",
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
          marginTop: 32,
          paddingVertical: 18,
          paddingHorizontal: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        {/* LOGO + NAZWA */}
        <View
          style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.accent,
              marginRight: 10,
            }}
          >
            <Ionicons name="home-outline" size={18} color="#022c22" />
          </View>

          <View>
            <Text
              style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}
            >
              MissionHome
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                marginTop: 1,
                fontWeight: "700",
              }}
            >
              Porządek w domu, exp w życiu ✨
            </Text>
          </View>
        </View>

        {/* SOCIAL IKONY */}
        <View style={{ flexDirection: "row", marginBottom: 10 }}>
          {(
            [
              "logo-facebook",
              "logo-instagram",
              "logo-linkedin",
              "logo-youtube",
            ] as const
          ).map((icon) => (
            <TouchableOpacity
              key={icon}
              activeOpacity={0.9}
              style={{ marginHorizontal: 8 }}
            >
              <Ionicons name={icon as any} size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* LINKI LINIA 1 */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <FooterLink label="O aplikacji" to="/about-app" />
          <FooterLink label="Regulamin" to="/rules" />
          <FooterLink label="Polityka prywatności i cookies" to="/privacy" />
          <FooterLink label="Kontakt" to="/contact" />
        </View>

        {/* LINKI LINIA 2 */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            marginTop: 6,
          }}
        >
          <FooterLink label="FAQ" to="/faq" />
          <FooterLink label="Zgłoś błąd" to="/bug" />
          <FooterLink label="Zgłoś pomysł" to="/idea" />
        </View>

        {/* COPYRIGHT */}
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: "800",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          © {new Date().getFullYear()} MissionHome - wszystkie prawa
          zastrzeżone
        </Text>
      </View>
    );
  };

  /* --------------------------------------------------------------------- */
  /* ------------------------------- UI ---------------------------------- */
  /* --------------------------------------------------------------------- */

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          width: "100%",
          paddingVertical: 16,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: "100%",
            paddingHorizontal: 24,
            flexGrow: 1,
            alignSelf: "center",
          }}
        >
          {/* HUD */}
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 14,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {/* PLAYER HUD */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              {hudMember.avatarUrl ? (
                <Image
                  source={{ uri: hudMember.avatarUrl }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    marginRight: 10,
                  }}
                />
              ) : (
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    backgroundColor: "#22d3ee33",
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: "#22d3ee",
                      fontWeight: "800",
                      fontSize: 16,
                    }}
                  >
                    {hudMember.label?.[0] ?? "?"}
                  </Text>
                </View>
              )}

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 16,
                    fontWeight: "800",
                  }}
                >
                  {hudMember.id === "self" ? "Twój poziom" : hudMember.label}
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 4,
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    LVL{" "}
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      {hudLevel}
                    </Text>
                    {"  "}• EXP{" "}
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      {hudTotalExp}
                    </Text>
                  </Text>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: colors.accent + "22",
                      borderWidth: 1,
                      borderColor: colors.accent + "66",
                    }}
                  >
                    <Text
                      style={{
                        color: colors.accent,
                        fontSize: 11,
                        fontWeight: "800",
                      }}
                    >
                      Do LVL {hudLevel + 1}: {hudToNext} EXP
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: 8 }}>
                  <View
                    style={{
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: "#020617",
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        height: "100%",
                        width: `${hudProgress * 100}%`,
                        borderRadius: 999,
                        backgroundColor: colors.accent,
                      }}
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginTop: 6,
                    }}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      Dziś zgarnięte:{" "}
                      <Text style={{ color: colors.text, fontWeight: "800" }}>
                        {dayEarned}
                      </Text>{" "}
                      / {dayPossible} EXP
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      Próg LVL {hudLevel + 1}:{" "}
                      <Text style={{ color: colors.text, fontWeight: "800" }}>
                        {nextReq}
                      </Text>
                    </Text>
                  </View>

                  {/* STREAK */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 8,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: "#f9731622",
                        borderWidth: 1,
                        borderColor: "#f9731688",
                      }}
                    >
                      <Ionicons name="flame" size={14} color="#f97316" />
                      <Text
                        style={{
                          marginLeft: 6,
                          color: "#f97316",
                          fontSize: 11,
                          fontWeight: "800",
                        }}
                      >
                        Streak: {streak}{" "}
                        {streak === 1 ? "dzień z rzędu" : "dni z rzędu"}
                      </Text>
                    </View>

                    {streak > 0 && (
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        Trzymaj tempo! 🔥
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* header tygodnia + przyciski + DZIŚ */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 8,
                alignItems: "center",
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  setSelectedDate(addDays(selectedDate, -7));
                }}
                style={{
                  padding: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-back" size={18} color={colors.text} />
              </TouchableOpacity>

              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 16,
                    fontWeight: "700",
                  }}
                >
                  Tydzień
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {formatWeekRange(weekStart)}
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 6,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setSelectedDate(addMonths(selectedDate, -1))}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name="play-skip-back-outline"
                      size={14}
                      color={colors.text}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={goToToday}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: "#0ea5e944",
                      marginHorizontal: 8,
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 11,
                        fontWeight: "800",
                      }}
                    >
                      Dziś
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setSelectedDate(addMonths(selectedDate, 1))}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name="play-skip-forward-outline"
                      size={14}
                      color={colors.text}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setSelectedDate(addDays(selectedDate, 7));
                }}
                style={{
                  padding: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>

            {/* days */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              {weekDays.map((d, i) => {
                const active = isSameDay(d, selectedDate);
                const isTodayDay = isSameDay(d, today);
                const inPast = d < today && !isSameDay(d, today);
                const hasDone = inPast && hasCompletedMissionOnDate(d);

                const bgColor = active
                  ? colors.accent
                  : hasDone
                  ? "#22c55e22"
                  : colors.card;

                const borderColor = active
                  ? colors.accent
                  : hasDone
                  ? "#22c55e88"
                  : colors.border;

                const textColor = active
                  ? "#022c22"
                  : hasDone
                  ? "#16a34a"
                  : colors.text;

                const subTextColor = active
                  ? "#022c22"
                  : hasDone
                  ? "#16a34a"
                  : colors.textMuted;

                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setSelectedDate(startOfDay(d))}
                    style={{
                      flex: 1,
                      marginHorizontal: 2,
                      paddingVertical: 8,
                      alignItems: "center",
                      borderRadius: 12,
                      backgroundColor: bgColor,
                      borderWidth: 1,
                      borderColor: borderColor,
                    }}
                    hitSlop={{
                      top: 6,
                      bottom: 6,
                      left: 6,
                      right: 6,
                    }}
                  >
                    {isTodayDay && !active && (
                      <View
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 6,
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          backgroundColor: colors.accent,
                        }}
                      />
                    )}

                    <Text style={{ color: subTextColor, fontSize: 12 }}>
                      {WEEKDAY_LABELS[i]}
                    </Text>
                    <Text
                      style={{
                        color: textColor,
                        fontWeight: "700",
                        fontSize: 14,
                      }}
                    >
                      {d.getDate()}
                    </Text>

                    {hasDone && !active && (
                      <View
                        style={{
                          marginTop: 3,
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          backgroundColor: "#22c55e",
                        }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* HEADER */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                Zadania na:
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {formatDayLong(selectedDate)}
              </Text>
            </View>

            <TouchableOpacity
              onPress={goToAddTask}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.accent,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
              }}
              hitSlop={{
                top: 10,
                bottom: 10,
                left: 10,
                right: 10,
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color="#022c22" />
              <Text
                style={{
                  color: "#022c22",
                  fontWeight: "700",
                  marginLeft: 6,
                  fontSize: 14,
                }}
              >
                Dodaj zadanie
              </Text>
            </TouchableOpacity>
          </View>

          {/* LISTA ZADAŃ */}
          {loading ? (
            <Text style={{ color: colors.textMuted }}>Ładowanie…</Text>
          ) : missionsForDaySorted.length === 0 ? (
            <View
              style={{
                padding: 16,
                borderRadius: 16,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textMuted }}>
                Brak zadań tego dnia.
              </Text>
            </View>
          ) : (
            missionsForDaySorted.map((m: any, idx: number) => {
              const assigned = getAssignedMember(m);
              const creator = getCreatorMember(m);
              const diff = getDifficultyLabel(m);
              const expProgress = getExpProgress(m);
              const isDone = isMissionDoneOnDate(m, selectedDate);
              const expValue = (m.expValue ?? 0) as number;

              const samePersonAssignedAndCreator =
                creator && assigned ? isSameMember(assigned, creator) : false;

              const hideCreatorInfo = !creator || samePersonAssignedAndCreator;
              const hideAssignedInfo = samePersonAssignedAndCreator;
              const selfCompactRow = hideCreatorInfo && hideAssignedInfo;

              const animKey = m.id ?? `fallback-${idx}`;
              if (!animationRefs.current[animKey]) {
                animationRefs.current[animKey] = new Animated.Value(1);
              }
              const rowAnim = animationRefs.current[animKey];

              return (
                <Animated.View
                  key={m.id ?? `fallback-${idx}`}
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
                      borderRadius: 14,
                      borderWidth: 1,
                      backgroundColor: colors.card,
                      borderColor: isDone ? "#22c55e66" : colors.border,
                    }}
                  >
                    {/* Top row: checkbox + tytuł + akcje */}
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      {/* Wrapper na guzik */}
                      <View
                        ref={(el) => {
                          if (m.id) {
                            checkboxRefs.current[m.id] = el;
                          }
                        }}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          marginRight: 10,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => {
                            const node = checkboxRefs.current[m.id];
                            if (node && node.measureInWindow) {
                              node.measureInWindow(
                                (
                                  x: number,
                                  y: number,
                                  width: number,
                                  height: number
                                ) => {
                                  const cx = x + width / 2;
                                  const cy = y + height / 2;
                                  // 💥 globalny wybuch przy tym checkboxie
                                  triggerFirework(m.id, cx, cy);
                                  handleComplete({ ...m }, rowAnim);
                                }
                              );
                            } else {
                              // fallback – środek ekranu, gdyby measure nie zadziałał
                              triggerFirework(m.id, 200, 200);
                              handleComplete({ ...m }, rowAnim);
                            }
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: 10,
                            justifyContent: "center",
                            alignItems: "center",
                            borderWidth: 1,
                            borderColor: isDone ? "#22c55e88" : colors.border,
                            backgroundColor: isDone
                              ? "#22c55e22"
                              : "transparent",
                          }}
                          hitSlop={{
                            top: 10,
                            bottom: 10,
                            left: 10,
                            right: 10,
                          }}
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
                            fontWeight: "800",
                            textDecorationLine: isDone
                              ? "line-through"
                              : "none",
                          }}
                        >
                          {m.title}
                        </Text>

                        {isDone ? (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              marginTop: 4,
                            }}
                          >
                            <View
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 999,
                                backgroundColor: "#22c55e22",
                                borderWidth: 1,
                                borderColor: "#22c55e66",
                                marginRight: 8,
                              }}
                            >
                              <Text
                                style={{
                                  color: "#22c55e",
                                  fontSize: 11,
                                  fontWeight: "900",
                                }}
                              >
                                Wykonane ✅
                              </Text>
                            </View>

                            <View
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 999,
                                backgroundColor: colors.accent + "22",
                                borderWidth: 1,
                                borderColor: colors.accent + "55",
                              }}
                            >
                              <Text
                                style={{
                                  color: colors.accent,
                                  fontSize: 11,
                                  fontWeight: "900",
                                }}
                              >
                                EXP zgarnięty: +{expValue}
                              </Text>
                            </View>
                          </View>
                        ) : null}
                      </View>

                      {/* Edit */}
                      <TouchableOpacity
                        onPress={() => handleEdit({ ...m })}
                        style={{ marginRight: 8, padding: 6 }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons
                          name="create-outline"
                          size={18}
                          color={colors.textMuted}
                        />
                      </TouchableOpacity>

                      {/* Delete */}
                      <TouchableOpacity
                        onPress={() => {
                          const safeMission = { ...m };
                          handleDelete(safeMission);
                        }}
                        onLongPress={() => {
                          Alert.alert(
                            "DEBUG",
                            `id=${String(m?.id)}\nrepeat=${String(
                              m?.repeat?.type
                            )}\narchived=${String(m?.archived)}`
                          );
                        }}
                        delayLongPress={350}
                        style={{ padding: 6 }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={20}
                          color={colors.textMuted}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Assigned info + avatar + kto dodał */}
                    {selfCompactRow ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: 8,
                          marginBottom: 4,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                          }}
                        >
                          {assigned.avatarUrl ? (
                            <Image
                              source={{ uri: assigned.avatarUrl }}
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 999,
                                marginRight: 6,
                                opacity: isDone ? 0.8 : 1,
                              }}
                            />
                          ) : (
                            <View
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 999,
                                backgroundColor: "#22d3ee33",
                                justifyContent: "center",
                                alignItems: "center",
                                marginRight: 6,
                                opacity: isDone ? 0.8 : 1,
                              }}
                            >
                              <Text
                                style={{
                                  color: "#22d3ee",
                                  fontWeight: "700",
                                  fontSize: 12,
                                }}
                              >
                                {assigned.label?.[0] ?? "?"}
                              </Text>
                            </View>
                          )}

                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 12,
                            }}
                          >
                            Twoje zadanie
                          </Text>
                        </View>

                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 999,
                            backgroundColor: diff.color + "33",
                            borderWidth: 1,
                            borderColor: diff.color + "88",
                            opacity: isDone ? 0.8 : 1,
                          }}
                        >
                          <Text
                            style={{
                              color: diff.color,
                              fontSize: 11,
                              fontWeight: "600",
                            }}
                          >
                            {diff.label}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginTop: 10,
                          marginBottom: 4,
                        }}
                      >
                        {assigned.avatarUrl ? (
                          <Image
                            source={{ uri: assigned.avatarUrl }}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 999,
                              marginRight: 8,
                              opacity: isDone ? 0.7 : 1,
                            }}
                          />
                        ) : (
                          <View
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 999,
                              backgroundColor: "#22d3ee33",
                              justifyContent: "center",
                              alignItems: "center",
                              marginRight: 8,
                              opacity: isDone ? 0.7 : 1,
                            }}
                          >
                            <Text
                              style={{
                                color: "#22d3ee",
                                fontWeight: "700",
                                fontSize: 14,
                              }}
                            >
                              {assigned.label?.[0] ?? "?"}
                            </Text>
                          </View>
                        )}

                        <View style={{ flex: 1 }}>
                          {!hideAssignedInfo && (
                            <Text
                              style={{
                                color: colors.textMuted,
                                fontSize: 12,
                              }}
                            >
                              Przypisane do:{" "}
                              <Text style={{ color: colors.text }}>
                                {assigned.label}
                              </Text>
                            </Text>
                          )}

                          {!hideCreatorInfo && creator && (
                            <Text
                              style={{
                                color: colors.textMuted,
                                fontSize: 11,
                              }}
                            >
                              Dodane przez:{" "}
                              <Text style={{ color: colors.text }}>
                                {creator.label}
                              </Text>
                            </Text>
                          )}
                        </View>

                        <View
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 999,
                            backgroundColor: diff.color + "33",
                            borderWidth: 1,
                            borderColor: diff.color + "88",
                            opacity: isDone ? 0.8 : 1,
                          }}
                        >
                          <Text
                            style={{
                              color: diff.color,
                              fontSize: 11,
                              fontWeight: "600",
                            }}
                          >
                            {diff.label}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Cykliczność */}
                    {m.repeat?.type && m.repeat.type !== "none" && (
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: 11,
                          marginBottom: 6,
                        }}
                      >
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

                    {/* EXP bar za misję */}
                    <View style={{ marginTop: 6, opacity: isDone ? 0.85 : 1 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          marginBottom: 2,
                        }}
                      >
                        <Text
                          style={{ color: colors.textMuted, fontSize: 11 }}
                        >
                          EXP za misję
                        </Text>
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 11,
                            fontWeight: "800",
                          }}
                        >
                          {expValue} EXP
                        </Text>
                      </View>

                      <View
                        style={{
                          height: 6,
                          borderRadius: 999,
                          backgroundColor: "#020617",
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

                    {!isDone && (
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: 11,
                          marginTop: 10,
                        }}
                      >
                        Kliknij kółko po lewej, żeby odznaczyć jako wykonane i
                        zgarnąć EXP 💥
                      </Text>
                    )}
                  </View>
                </Animated.View>
              );
            })
          )}

          {/* SPACER */}
          <View style={{ flex: 1 }} />

          {/* FOOTER */}
          <AppFooter />
        </View>
      </ScrollView>

      {/* TIME TRAVEL modal: blokada odznaczania poza dzisiaj */}
      {timeTravelDialogOpen && (
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
            zIndex: 250,
            paddingHorizontal: 18,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 18,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#a855f722",
                  borderWidth: 1,
                  borderColor: "#a855f766",
                  marginRight: 10,
                }}
              >
                <Ionicons name="time-outline" size={18} color="#c084fc" />
              </View>

              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: "900",
                }}
              >
                Umiesz podróżować w czasie? 😏
              </Text>
            </View>

            <Text
              style={{
                color: colors.textMuted,
                fontSize: 13,
                marginBottom: 14,
                lineHeight: 18,
              }}
            >
              Możesz oznaczać zadania tylko w dniu, w którym je wykonujesz.
              Cofanie się w czasie zostawmy filmom science-fiction. ✨
            </Text>

            <TouchableOpacity
              activeOpacity={0.9}
              style={{
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: colors.accent,
                alignSelf: "center",
                paddingHorizontal: 22,
                minWidth: 140,
              }}
              onPress={() => setTimeTravelDialogOpen(false)}
            >
              <Text
                style={{
                  color: "#022c22",
                  fontSize: 13,
                  fontWeight: "900",
                  textAlign: "center",
                }}
              >
                Okej, wracam do dziś
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 🔥 GLOBALNY OVERLAY Z FAJERWERKAMI – NAD WSZYSTKIM */}
      {fireworkParticles.length > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
          }}
        >
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
                transform: [
                  { translateX: p.translateX },
                  { translateY: p.translateY },
                  { scale: p.scale },
                ],
                opacity: p.opacity,
              }}
            />
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}
// app/index.tsx
