// Profile.native.tsx — wersja natywna iOS + Android

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useThemeColors } from "../src/context/ThemeContext";
import { auth } from "../src/firebase/firebase";
import { db } from "../src/firebase/firebase"; // <-- na native NIE używamy .web
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { useMissions } from "../src/hooks/useMissions";

/* -------------------------- HELPERS -------------------------- */

function startOfDay(date: any) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: any, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateLongPL(date: Date | null) {
  if (!date) return "-";
  return date.toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

/* --------------------- XP / LEVEL --------------------- */

function requiredExpForLevel(level: number) {
  if (level <= 1) return 0;
  let total = 0;

  for (let l = 1; l < level; l++) {
    const gain = 100 + 50 * (l - 1);
    total += gain;
  }
  return total;
}

/* ----------------------- MISSIONS ----------------------- */

function isMissionDoneByUserOnDate(m: any, date: Date, userId: string | null) {
  if (!m || !userId) return false;
  const uid = String(userId);

  const repeatType = m?.repeat?.type ?? "none";
  const dateKey = formatDateKey(date);

  if (repeatType !== "none") {
    const completedDates = Array.isArray(m.completedDates)
      ? m.completedDates
      : [];

    if (!completedDates.includes(dateKey)) {
      const completedAt = toSafeDate(m.completedAt);
      if (
        completedAt &&
        isSameDay(completedAt, date) &&
        String(m.completedByUserId || "") === uid
      ) {
        return true;
      }
      return false;
    }

    const byDate = m.completedByByDate || {};
    const entry = byDate[dateKey];

    if (entry && String(entry.userId || entry.uid || "") === uid) return true;

    if (String(m.assignedToUserId || "") === uid) return true;

    return false;
  }

  if (!m.completed) return false;
  if (String(m.completedByUserId || "") !== uid) return false;

  const completedAt = toSafeDate(m.completedAt);
  if (!completedAt) return false;

  return isSameDay(completedAt, date);
}

function countUserCompletedMissions(missions: any[], userId: string | null) {
  if (!userId || !Array.isArray(missions)) return 0;
  const uid = String(userId);

  let total = 0;
  missions.forEach((m) => {
    const repeatType = m?.repeat?.type ?? "none";

    if (repeatType === "none") {
      if (m.completed && String(m.completedByUserId || "") === uid) {
        total += 1;
      }
      return;
    }

    const completedDates = Array.isArray(m.completedDates)
      ? m.completedDates
      : [];

    if (completedDates.length === 0) {
      if (m.completed && String(m.completedByUserId || "") === uid) {
        total += 1;
      }
      return;
    }

    const byDate = m.completedByByDate || {};
    completedDates.forEach((dateKey: string) => {
      const entry = byDate[dateKey];
      if (entry && String(entry.userId || entry.uid || "") === uid) {
        total += 1;
      } else if (!entry && String(m.assignedToUserId || "") === uid) {
        total += 1;
      }
    });
  });

  return total;
}

function countTasksCreatedByUser(missions: any[], userId: string | null) {
  if (!userId) return 0;
  const uid = String(userId);

  return missions.filter((m) => {
    const createdBy = String(m.createdByUserId || m.assignedByUserId || "");
    return createdBy === uid;
  }).length;
}

function computeActiveStreak(missions: any[], userId: string | null) {
  if (!userId || missions.length === 0) return 0;

  const today = startOfDay(new Date());
  let count = 0;
  let cursor = today;

  for (let i = 0; i < 365; i++) {
    const anyDone = missions.some((m) =>
      isMissionDoneByUserOnDate(m, cursor as Date, userId)
    );
    if (!anyDone) break;

    count += 1;
    cursor = addDays(cursor, -1);
  }

  return count;
}

/* ---------------------------------------------------------------------- */
/* --------------------------- MAIN COMPONENT ---------------------------- */
/* ---------------------------------------------------------------------- */

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useThemeColors();
  const { missions, loading: missionsLoading } = useMissions();

  const myUid = auth.currentUser?.uid || null;
  const viewedUid = params.uid ? String(params.uid) : myUid;

  const viewingSomeoneElse =
    !!viewedUid && !!myUid && String(viewedUid) !== String(myUid);
  const isOwnProfile = !!myUid && String(viewedUid) === String(myUid);

  const [userDoc, setUserDoc] = useState<any | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  const [showStatsOverride, setShowStatsOverride] = useState<boolean | null>(null);
  const [savingShowStats, setSavingShowStats] = useState(false);

  /* ----------------------------- FETCH USER ----------------------------- */
  useEffect(() => {
    if (!viewedUid) return;

    const ref = doc(db, "users", viewedUid);
    const unsub = onSnapshot(ref, (snap) => {
      setUserDoc(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setUserLoading(false);
    });

    return () => unsub();
  }, [viewedUid]);

  const rawShowStats = userDoc?.showStats;
  useEffect(() => setShowStatsOverride(null), [rawShowStats]);

  const showStats =
    showStatsOverride ??
    (rawShowStats === undefined || rawShowStats === null
      ? true
      : !!rawShowStats);

  const displayName =
    userDoc?.displayName || userDoc?.username || "Użytkownik";

  const email = viewingSomeoneElse ? null : userDoc?.email || auth.currentUser?.email;

  const photoURL = userDoc?.photoURL || null;

  const createdAtDate = toSafeDate(userDoc?.createdAt);
  const memberSinceLabel = formatDateLongPL(createdAtDate);

  const level = Math.max(1, Number(userDoc?.level ?? 1));
  const totalExp = Math.max(0, Number(userDoc?.totalExp ?? 0));

  const baseReq = requiredExpForLevel(level);
  const nextReq = requiredExpForLevel(level + 1);
  const intoLevel = Math.max(0, totalExp - baseReq);
  const span = Math.max(1, nextReq - baseReq);
  const progress = Math.max(0, Math.min(1, intoLevel / span));
  const toNext = Math.max(0, nextReq - totalExp);

  const { completedMissions, createdTasks, activeStreak } = useMemo(() => {
    if (!viewedUid) {
      return { completedMissions: 0, createdTasks: 0, activeStreak: 0 };
    }

    return {
      completedMissions: countUserCompletedMissions(missions, viewedUid),
      createdTasks: countTasksCreatedByUser(missions, viewedUid),
      activeStreak: computeActiveStreak(missions, viewedUid),
    };
  }, [missions, viewedUid]);

  const isLoading = userLoading || missionsLoading;

  const initialLetter = displayName[0]?.toUpperCase?.() || "U";

  /* ------------------------- UPDATE showStats --------------------------- */
  const handleToggleShowStats = async () => {
    if (!isOwnProfile || !myUid) return;

    const newValue = !showStats;
    setShowStatsOverride(newValue);
    setSavingShowStats(true);

    try {
      await updateDoc(doc(db, "users", myUid), { showStats: newValue });
    } catch (err) {
      setShowStatsOverride(null);
    } finally {
      setSavingShowStats(false);
    }
  };

  const canShowStatsToViewer = isOwnProfile || showStats;

  /* ====================================================================== */
  /* =============================== RENDER =============================== */
  /* ====================================================================== */

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingVertical: 16,
        paddingHorizontal: 20,
      }}
    >
      {/* HEADER */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            padding: 8,
            borderRadius: 50,
            borderWidth: 1,
            borderColor: colors.border,
            marginRight: 12,
          }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
            {viewingSomeoneElse ? "Profil użytkownika" : "Twój profil"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {viewingSomeoneElse
              ? "Podgląd profilu w MissionHome"
              : "Podsumowanie Twojego progresu"}
          </Text>
        </View>
      </View>

      {/* PROFILE CARD */}
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 16,
          marginBottom: 16,
        }}
      >
        {isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={{ marginTop: 10, color: colors.textMuted, fontSize: 13 }}>
              Ładuję profil…
            </Text>
          </View>
        ) : (
          <>
            {/* TOP ROW */}
            <View style={{ flexDirection: "row", marginBottom: 16 }}>
              {photoURL ? (
                <Image
                  source={{ uri: photoURL }}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 999,
                    marginRight: 14,
                    borderWidth: 2,
                    borderColor: colors.accent,
                  }}
                />
              ) : (
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 999,
                    marginRight: 14,
                    backgroundColor: colors.accent + "22",
                    borderWidth: 2,
                    borderColor: colors.accent + "66",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: colors.accent, fontSize: 30, fontWeight: "900" }}>
                    {initialLetter}
                  </Text>
                </View>
              )}

              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>
                  {displayName}
                </Text>

                {!viewingSomeoneElse && email ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
                    {email}
                  </Text>
                ) : null}

                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                  W MissionHome od{" "}
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    {memberSinceLabel}
                  </Text>
                </Text>

                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                  Ukończone misje:{" "}
                  <Text style={{ color: colors.text, fontWeight: "800" }}>
                    {completedMissions}
                  </Text>
                </Text>
              </View>

              {/* LEVEL BADGE */}
              <View
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.accent,
                  backgroundColor: colors.accent + "22",
                  shadowColor: colors.accent,
                  shadowOpacity: 0.25,
                  shadowOffset: { width: 0, height: 2 },
                  shadowRadius: 6,
                  elevation: 4,
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 70,
                }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
                  POZIOM
                </Text>

                <Text style={{ color: colors.accent, fontSize: 24, fontWeight: "900" }}>
                  {level}
                </Text>
              </View>
            </View>

            {/* XP BAR */}
            <View style={{ marginBottom: 10 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  EXP ogółem:{" "}
                  <Text style={{ color: colors.text, fontWeight: "800" }}>{totalExp}</Text>
                </Text>

                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Do LVL {level + 1}:{" "}
                  <Text style={{ color: colors.text, fontWeight: "800" }}>
                    {toNext} EXP
                  </Text>
                </Text>
              </View>

              <View
                style={{
                  height: 14,
                  borderRadius: 999,
                  backgroundColor: "#020617",
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    width: `${progress * 100}%`,
                    backgroundColor: colors.accent,
                    borderRadius: 999,
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 4,
                }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  LVL {level} • próg: {baseReq} EXP
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  LVL {level + 1} • próg: {nextReq} EXP
                </Text>
              </View>
            </View>

            {/* STREAK */}
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
              <Ionicons
                name="flame"
                size={18}
                color={activeStreak > 0 ? "#f97316" : colors.textMuted}
              />

              <Text style={{ marginLeft: 8, color: colors.text, fontSize: 13 }}>
                Streak:{" "}
                {activeStreak > 0
                  ? `${activeStreak} ${activeStreak === 1 ? "dzień" : "dni"} z rzędu`
                  : "brak aktywnego ciągu"}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* STATS SECTION */}
      {canShowStatsToViewer && (
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>
              Statystyki
            </Text>

            {isOwnProfile && (
              <TouchableOpacity
                onPress={handleToggleShowStats}
                activeOpacity={0.8}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Pokaż innym</Text>

                <View
                  style={{
                    width: 34,
                    height: 18,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: showStats ? colors.accent : colors.border,
                    backgroundColor: showStats ? colors.accent + "44" : "transparent",
                    paddingHorizontal: 2,
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 999,
                      backgroundColor: showStats ? colors.accent : colors.textMuted,
                      alignSelf: showStats ? "flex-end" : "flex-start",
                    }}
                  />
                </View>

                {savingShowStats && (
                  <ActivityIndicator
                    size="small"
                    color={colors.textMuted}
                    style={{ marginLeft: 4 }}
                  />
                )}
              </TouchableOpacity>
            )}
          </View>

          {isOwnProfile && (
            <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 10 }}>
              {showStats
                ? "Twoje statystyki są widoczne dla innych osób (np. w Rankingu)."
                : "Twoje statystyki są ukryte – inni zobaczą tylko Twój poziom i EXP w Rankingu."}
            </Text>
          )}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <StatCard label="Łączny EXP" value={totalExp} suffix="EXP" icon="sparkles" colors={colors} />

            <StatCard
              label="Ukończone misje"
              value={completedMissions}
              icon="checkmark-circle-outline"
              colors={colors}
            />

            <StatCard
              label="Aktywny streak"
              value={activeStreak}
              suffix={activeStreak === 1 ? "dzień" : "dni"}
              icon="flame-outline"
              colors={colors}
            />

            <StatCard
              label="Utworzone zadania"
              value={createdTasks}
              icon="create-outline"
              colors={colors}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

/* ---------------------------- STAT CARD ---------------------------- */

function StatCard({
  label,
  value,
  suffix,
  icon,
  colors,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon?: any;
  colors: any;
}) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: "48%",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
        {icon && (
          <Ionicons
            name={icon}
            size={16}
            color={colors.textMuted}
            style={{ marginRight: 6 }}
          />
        )}

        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700" }}>
          {label}
        </Text>
      </View>

      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>
        {value}{" "}
        {suffix && (
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700" }}>
            {suffix}
          </Text>
        )}
      </Text>
    </View>
  );
}
