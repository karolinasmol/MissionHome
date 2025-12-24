// ============================================================
//  PROFILE VISIBILITY (2 tryby):
//  - publicProfileMode: "full" | "basic"
//     * full  -> widoczne: nick+avatar+level/exp + staty misji
//     * basic -> widoczne: nick+avatar+level/exp (bez statów misji)
//
//  DATA:
//  - Own profile: /users/{uid} + staty liczone z useMissions()
//  - Other profile:
//      * /public_users/{uid} (widoczne dla zalogowanych)
//      * opcjonalnie /users/{uid} (fallback jeśli mamy dostęp, ale staty i tak bierzemy z public_users)
//  - Auto-sync: na własnym profilu zapisujemy snapshot do /public_users/{uid}
// ============================================================

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useThemeColors } from "../src/context/ThemeContext";
import { auth } from "../src/firebase/firebase";
import { db } from "../src/firebase/firebase.web";
import { doc, onSnapshot, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useMissions } from "../src/hooks/useMissions";

/* ---------------------------------------------------------------------- */
/* ------------------------------ HELPERS -------------------------------- */
/* ---------------------------------------------------------------------- */

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
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDateLongPL(date: Date | null) {
  if (!date) return "-";
  try {
    return date.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "-";
  }
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

function formatDateKey(date: Date) {
  const d0 = startOfDay(date);
  const y = d0.getFullYear();
  const m = String(d0.getMonth() + 1).padStart(2, "0");
  const d = String(d0.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ------------------ XP / LEVEL ------------------- */

function requiredExpForLevel(level: number) {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 1; l < level; l++) {
    const gainForThisLevelUp = 100 + 50 * (l - 1);
    total += gainForThisLevelUp;
  }
  return total;
}

/* ------------------ MISSIONS ---------------------- */

function isMissionDoneByUserOnDate(m: any, date: Date, userId: string | null) {
  if (!m || !userId) return false;
  const uid = String(userId);
  const repeatType = m?.repeat?.type ?? "none";
  const dateKey = formatDateKey(date);

  if (repeatType !== "none") {
    const completedDates = Array.isArray(m.completedDates) ? m.completedDates : [];

    if (!completedDates.includes(dateKey)) {
      const completedAt = toSafeDate(m.completedAt);
      if (completedAt && isSameDay(completedAt, date) && String(m.completedByUserId || "") === uid) {
        return true;
      }
      return false;
    }

    const byDate = m.completedByByDate || {};
    const entry = byDate[dateKey];

    if (entry && String(entry.userId || entry.uid || "") === uid) return true;

    // fallback: jak nie ma wpisu w completedByByDate, to traktujemy assignedTo jako wykonawcę
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
      if (m.completed && String(m.completedByUserId || "") === uid) total += 1;
      return;
    }

    const completedDates = Array.isArray(m.completedDates) ? m.completedDates : [];

    if (completedDates.length === 0) {
      if (m.completed && String(m.completedByUserId || "") === uid) total += 1;
      return;
    }

    const byDate = m.completedByByDate || {};
    completedDates.forEach((dateKey: string) => {
      const entry = byDate[dateKey];
      if (entry && String(entry.userId || entry.uid || "") === uid) total += 1;
      else if (!entry && String(m.assignedToUserId || "") === uid) total += 1;
    });
  });

  return total;
}

function countTasksCreatedByUser(missions: any[], userId: string | null) {
  if (!userId || !Array.isArray(missions)) return 0;
  const uid = String(userId);

  return missions.filter((m) => {
    const createdBy = String(m.createdByUserId || m.assignedByUserId || "");
    return createdBy === uid;
  }).length;
}

function computeActiveStreak(missions: any[], userId: string | null) {
  if (!userId || !Array.isArray(missions) || missions.length === 0) return 0;
  const today = startOfDay(new Date());
  let count = 0;
  let cursor = today;

  for (let i = 0; i < 365; i++) {
    const anyDone = missions.some((m) => isMissionDoneByUserOnDate(m, cursor as Date, userId));
    if (!anyDone) break;

    count += 1;
    cursor = addDays(cursor, -1) as Date;
  }

  return count;
}

/* ---------------------------------------------------------------------- */
/* --------------------------- MAIN COMPONENT ---------------------------- */
/* ---------------------------------------------------------------------- */

type PublicProfileMode = "full" | "basic";

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useThemeColors();
  const { missions, loading: missionsLoading } = useMissions();

  const myUid = auth.currentUser?.uid || null;

  // expo-router czasem daje string | string[]
  const rawUid: any = (params as any)?.uid;
  const viewedUid =
    (Array.isArray(rawUid) ? rawUid[0] : rawUid) ? String(Array.isArray(rawUid) ? rawUid[0] : rawUid) : myUid || null;

  const isOwnProfile = !!myUid && !!viewedUid && String(viewedUid) === String(myUid);
  const viewingSomeoneElse = !!myUid && !!viewedUid && !isOwnProfile;

  // public_users (dla wszystkich zalogowanych)
  const [publicUserDoc, setPublicUserDoc] = useState<any | null>(null);
  const [publicLoading, setPublicLoading] = useState(false);

  // users (dla mnie + rodziny / fallback)
  const [privateUserDoc, setPrivateUserDoc] = useState<any | null>(null);
  const [privateLoading, setPrivateLoading] = useState(false);

  // UI: tryb widoczności profilu (dla właściciela)
  const [profileModeOverride, setProfileModeOverride] = useState<PublicProfileMode | null>(null);
  const [savingProfileMode, setSavingProfileMode] = useState(false);

  // OWN: /users/{uid}
  useEffect(() => {
    if (!viewedUid || !isOwnProfile) {
      setPrivateUserDoc(null);
      setPrivateLoading(false);
      return;
    }

    setPrivateLoading(true);
    const ref = doc(db, "users", viewedUid);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        setPrivateUserDoc(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setPrivateLoading(false);
      },
      (err) => {
        console.log("[Profile] users snapshot error:", err);
        setPrivateUserDoc(null);
        setPrivateLoading(false);
      }
    );

    return () => unsub();
  }, [viewedUid, isOwnProfile]);

  // OTHER: /public_users/{uid} + opcjonalnie /users/{uid} jako fallback (ale staty i tak z public_users)
  useEffect(() => {
    if (!viewedUid || !viewingSomeoneElse) {
      setPublicUserDoc(null);
      setPublicLoading(false);
      setPrivateUserDoc(null);
      setPrivateLoading(false);
      return;
    }

    // public_users
    setPublicLoading(true);
    const publicRef = doc(db, "public_users", viewedUid);
    const unsubPublic = onSnapshot(
      publicRef,
      (snap) => {
        setPublicUserDoc(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setPublicLoading(false);
      },
      (err) => {
        console.log("[Profile] public_users snapshot error:", err);
        setPublicUserDoc(null);
        setPublicLoading(false);
      }
    );

    // users fallback (family / permission)
    setPrivateLoading(true);
    const usersRef = doc(db, "users", viewedUid);
    const unsubUsers = onSnapshot(
      usersRef,
      (snap) => {
        setPrivateUserDoc(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setPrivateLoading(false);
      },
      (err) => {
        // permission-denied u obcych = OK
        console.log("[Profile] users snapshot (fallback) error:", err);
        setPrivateUserDoc(null);
        setPrivateLoading(false);
      }
    );

    return () => {
      unsubPublic();
      unsubUsers();
    };
  }, [viewedUid, viewingSomeoneElse]);

  // wybór doca do renderu:
  // - own: private
  // - other: prefer public, fallback private (jeśli public nie istnieje)
  const userDoc = isOwnProfile ? privateUserDoc : publicUserDoc || privateUserDoc;

  const userLoading = isOwnProfile ? privateLoading : publicLoading || (privateLoading && !publicUserDoc);

  // --- Tryb widoczności profilu ---
  const rawMode: PublicProfileMode | null =
    (userDoc?.publicProfileMode as PublicProfileMode | undefined) || (userDoc?.showStats === false ? "basic" : "full");

  useEffect(() => {
    setProfileModeOverride(null);
  }, [rawMode]);

  const publicProfileMode: PublicProfileMode = profileModeOverride ?? (rawMode || "full");

  // W basic: pokazujemy nick/avatar + level/exp, ale chowamy staty misji.
  const canShowMissionStatsToViewer = isOwnProfile || publicProfileMode === "full";

  const displayName = userDoc?.displayName || userDoc?.username || "Użytkownik";
  const email = isOwnProfile ? userDoc?.email || auth.currentUser?.email : null;
  const photoURL = userDoc?.photoURL || null;

  const createdAtDate = toSafeDate(userDoc?.createdAt);
  const memberSinceLabel = formatDateLongPL(createdAtDate);

  const premiumUntilDate = toSafeDate(
    userDoc?.premiumUntil || userDoc?.premiumExpiresAt || userDoc?.premiumExpiration || userDoc?.subscriptionEndsAt
  );

  const isPremium =
    !!(
      userDoc?.isPremium ||
      userDoc?.premium ||
      userDoc?.premiumActive ||
      userDoc?.plan === "premium" ||
      userDoc?.subscriptionTier === "premium" ||
      userDoc?.subscriptionPlan === "premium"
    ) || (premiumUntilDate ? premiumUntilDate.getTime() > Date.now() : false);

  const premiumGold = "#fbbf24";

  const level = Math.max(1, Number(userDoc?.level ?? 1));
  const totalExp = Math.max(0, Number(userDoc?.totalExp ?? 0));

  // XP STATS calculating
  const baseReq = requiredExpForLevel(level);
  const nextReq = requiredExpForLevel(level + 1);
  const intoLevel = Math.max(0, totalExp - baseReq);
  const span = Math.max(1, nextReq - baseReq);
  const progress = Math.max(0, Math.min(1, intoLevel / span));
  const toNext = Math.max(0, nextReq - totalExp);

  // ✅ MISJE/STATS:
  // - own -> liczymy z missions
  // - other -> BIERZEMY Z PUBLIC_USERS.STATS (bo missions hook nie reprezentuje cudzych misji w całości)
  const { completedMissions, createdTasks, activeStreak } = useMemo(() => {
    if (!viewedUid) return { completedMissions: 0, createdTasks: 0, activeStreak: 0 };

    if (!canShowMissionStatsToViewer) {
      return { completedMissions: "ukryte" as any, createdTasks: "ukryte" as any, activeStreak: "ukryte" as any };
    }

    if (isOwnProfile) {
      const completed = countUserCompletedMissions(missions, viewedUid);
      const created = countTasksCreatedByUser(missions, viewedUid);
      const streak = computeActiveStreak(missions, viewedUid);
      return { completedMissions: completed, createdTasks: created, activeStreak: streak };
    }

    // other user: z public_users.stats
    const stats = (publicUserDoc?.stats || userDoc?.stats || {}) as any;

    return {
      completedMissions: Number(stats.completedMissions ?? 0),
      createdTasks: Number(stats.createdTasks ?? 0),
      activeStreak: Number(stats.activeStreak ?? 0),
    };
  }, [viewedUid, canShowMissionStatsToViewer, isOwnProfile, missions, userDoc, publicUserDoc]);

  // ✅ AUTO-SYNC: na własnym profilu zapisujemy publiczny doc, żeby inni widzieli.
  useEffect(() => {
    if (!isOwnProfile || !myUid) return;
    if (!privateUserDoc) return; // sync tylko z /users
    if (missionsLoading) return;

    const mode: PublicProfileMode =
      (privateUserDoc?.publicProfileMode as PublicProfileMode | undefined) ||
      (privateUserDoc?.showStats === false ? "basic" : "full") ||
      "full";

    const completed = countUserCompletedMissions(missions, myUid);
    const created = countTasksCreatedByUser(missions, myUid);
    const streak = computeActiveStreak(missions, myUid);

    const payload: any = {
      displayName: privateUserDoc?.displayName || privateUserDoc?.username || "Użytkownik",
      photoURL: privateUserDoc?.photoURL || null,
      createdAt: privateUserDoc?.createdAt || null,
      level: Math.max(1, Number(privateUserDoc?.level ?? 1)),
      totalExp: Math.max(0, Number(privateUserDoc?.totalExp ?? 0)),

      publicProfileMode: mode,
      // legacy
      showStats: mode === "full",

      isPremium: !!privateUserDoc?.isPremium || !!privateUserDoc?.premium || !!privateUserDoc?.premiumActive,
      premiumUntil:
        privateUserDoc?.premiumUntil ||
        privateUserDoc?.premiumExpiresAt ||
        privateUserDoc?.premiumExpiration ||
        privateUserDoc?.subscriptionEndsAt ||
        null,

      updatedAt: serverTimestamp(),
    };

    if (mode === "full") {
      payload.stats = { completedMissions: completed, createdTasks: created, activeStreak: streak };
    } else {
      payload.stats = null;
    }

    setDoc(doc(db, "public_users", myUid), payload, { merge: true }).catch((e) =>
      console.log("[Profile] public_users sync error:", e)
    );
  }, [isOwnProfile, myUid, privateUserDoc, missions, missionsLoading]);

  const isLoading = userLoading || (isOwnProfile ? missionsLoading : false);
  const initialLetter = (displayName || "U")[0]?.toUpperCase?.() || "U";

  const handleSetProfileMode = async (mode: PublicProfileMode) => {
    if (!isOwnProfile || !myUid) return;
    setProfileModeOverride(mode);
    setSavingProfileMode(true);

    try {
      await Promise.all([
        updateDoc(doc(db, "users", myUid), { publicProfileMode: mode, showStats: mode === "full" }),
        setDoc(
          doc(db, "public_users", myUid),
          { publicProfileMode: mode, showStats: mode === "full", updatedAt: serverTimestamp() },
          { merge: true }
        ),
      ]);
    } catch (err) {
      console.log("[Profile] set publicProfileMode error:", err);
      setProfileModeOverride(null);
    } finally {
      setSavingProfileMode(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ flexGrow: 1, width: "100%", paddingVertical: 16, alignItems: "center" }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 1344,
          paddingHorizontal: 24,
          alignSelf: "center",
          ...(Platform.OS === "web" ? ({ marginHorizontal: "auto" } as any) : null),
        }}
      >
        {/* HEADER */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ padding: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, marginRight: 12 }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
              {viewingSomeoneElse ? "Profil użytkownika" : "Twój profil"}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {viewingSomeoneElse ? "Podgląd profilu w MissionHome" : "Podsumowanie Twojego progresu"}
            </Text>
          </View>
        </View>

        {/* PROFILE CARD */}
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            padding: 18,
            marginBottom: 16,
          }}
        >
          {isLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={{ marginTop: 10, color: colors.textMuted, fontSize: 13 }}>Ładuję profil…</Text>
            </View>
          ) : (
            <>
              {!userDoc && viewingSomeoneElse ? (
                <View style={{ paddingVertical: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>Profil niedostępny</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6, lineHeight: 16 }}>
                    Ten użytkownik nie opublikował jeszcze profilu publicznego (albo ma starą wersję aplikacji).
                  </Text>
                </View>
              ) : (
                <>
                  {/* TOP ROW */}
                  <View style={{ flexDirection: "row", marginBottom: 16 }}>
                    {/* AVATAR + PREMIUM OVERLAY */}
                    <View style={{ position: "relative", marginRight: 14 }}>
                      {photoURL ? (
                        <Image
                          source={{ uri: photoURL }}
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 999,
                            borderWidth: 2,
                            borderColor: isPremium ? premiumGold : colors.accent + "88",
                          }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 999,
                            backgroundColor: isPremium ? premiumGold + "22" : colors.accent + "22",
                            borderWidth: 2,
                            borderColor: isPremium ? premiumGold + "AA" : colors.accent + "66",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text style={{ color: isPremium ? premiumGold : colors.accent, fontSize: 30, fontWeight: "900" }}>
                            {initialLetter}
                          </Text>
                        </View>
                      )}

                      {isPremium ? (
                        <View
                          pointerEvents="none"
                          style={{ position: "absolute", left: 0, right: 0, bottom: -2, alignItems: "center" }}
                          accessibilityLabel="Użytkownik Premium"
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: "#0b1220CC",
                              borderWidth: 1,
                              borderColor: premiumGold,
                              shadowColor: premiumGold,
                              shadowOpacity: 0.25,
                              shadowOffset: { width: 0, height: 2 },
                              shadowRadius: 4,
                              elevation: 6,
                            }}
                          >
                            <Ionicons name="sparkles" size={12} color={premiumGold} style={{ marginRight: 6 }} />
                            <Text style={{ color: premiumGold, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 }}>
                              PREMIUM
                            </Text>
                          </View>
                        </View>
                      ) : null}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>{displayName}</Text>

                      {!viewingSomeoneElse && email ? (
                        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{email}</Text>
                      ) : null}

                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
                        W MissionHome od <Text style={{ color: colors.text, fontWeight: "700" }}>{memberSinceLabel}</Text>
                      </Text>

                      {canShowMissionStatsToViewer ? (
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                          Ukończone misje: <Text style={{ color: colors.text, fontWeight: "800" }}>{completedMissions}</Text>
                        </Text>
                      ) : (
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                          Statystyki misji: <Text style={{ color: colors.text, fontWeight: "800" }}>ukryte</Text>
                        </Text>
                      )}
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
                      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 2 }}>POZIOM</Text>
                      <Text style={{ color: colors.accent, fontSize: 24, fontWeight: "900" }}>{level}</Text>
                    </View>
                  </View>

                  {/* XP BAR */}
                  <View style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        EXP ogółem: <Text style={{ color: colors.text, fontWeight: "800" }}>{totalExp}</Text>
                      </Text>

                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        Do LVL {level + 1}: <Text style={{ color: colors.text, fontWeight: "800" }}>{toNext} EXP</Text>
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
                      <View style={{ height: "100%", width: `${progress * 100}%`, borderRadius: 999, backgroundColor: colors.accent }} />
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        LVL {level} • próg: {baseReq} EXP
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        LVL {level + 1} • próg: {nextReq} EXP
                      </Text>
                    </View>
                  </View>

                  {/* STREAK (tylko full) */}
                  {canShowMissionStatsToViewer && (
                    <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center" }}>
                      <Ionicons
                        name="flame"
                        size={18}
                        color={typeof activeStreak === "number" && activeStreak > 0 ? "#f97316" : colors.textMuted}
                      />
                      <Text style={{ marginLeft: 8, color: colors.text, fontSize: 13 }}>
                        Streak:{" "}
                        {typeof activeStreak === "number" && activeStreak > 0
                          ? `${activeStreak} ${activeStreak === 1 ? "dzień z rzędu" : "dni z rzędu"}`
                          : "brak aktywnego ciągu"}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </View>

        {/* STATS SECTION */}
        {!!userDoc && canShowMissionStatsToViewer && (
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>Statystyki</Text>

              {/* ✅ ZMIENIONY TYLKO GUIZK (bez ruszania logiki) */}
              {isOwnProfile && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 4,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => handleSetProfileMode("full")}
                    activeOpacity={0.9}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: publicProfileMode === "full" ? colors.accent : "transparent",
                      borderWidth: 1,
                      borderColor: publicProfileMode === "full" ? colors.accent : "transparent",
                      ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                      marginRight: 6,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Ionicons
                        name={publicProfileMode === "full" ? "eye" : "eye-outline"}
                        size={14}
                        color={publicProfileMode === "full" ? "#022c22" : colors.textMuted}
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        style={{
                          color: publicProfileMode === "full" ? "#022c22" : colors.textMuted,
                          fontSize: 12,
                          fontWeight: "900",
                          letterSpacing: 0.2,
                        }}
                      >
                        Pełny
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleSetProfileMode("basic")}
                    activeOpacity={0.9}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: publicProfileMode === "basic" ? colors.accent : "transparent",
                      borderWidth: 1,
                      borderColor: publicProfileMode === "basic" ? colors.accent : "transparent",
                      ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Ionicons
                        name={publicProfileMode === "basic" ? "lock-closed" : "lock-closed-outline"}
                        size={14}
                        color={publicProfileMode === "basic" ? "#022c22" : colors.textMuted}
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        style={{
                          color: publicProfileMode === "basic" ? "#022c22" : colors.textMuted,
                          fontSize: 12,
                          fontWeight: "900",
                          letterSpacing: 0.2,
                        }}
                      >
                        Tylko poziom i EXP
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {savingProfileMode && (
                    <View style={{ marginLeft: 10 }}>
                      <ActivityIndicator size="small" color={colors.textMuted} />
                    </View>
                  )}
                </View>
              )}
            </View>

            {isOwnProfile && (
              <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 10 }}>
                {publicProfileMode === "full"
                  ? "Twój profil publiczny pokazuje statystyki misji."
                  : "Twój profil publiczny ukrywa statystyki misji (inni widzą tylko nick, avatar, poziom i EXP)."}
              </Text>
            )}

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <StatCard label="Łączny EXP" value={totalExp} suffix="EXP" icon="sparkles" colors={colors} />
              <StatCard label="Ukończone misje" value={completedMissions} icon="checkmark-circle-outline" colors={colors} />
              <StatCard
                label="Aktywny streak"
                value={activeStreak}
                suffix={typeof activeStreak === "number" ? (activeStreak === 1 ? "dzień" : "dni") : undefined}
                icon="flame-outline"
                colors={colors}
              />
              <StatCard label="Utworzone zadania" value={createdTasks} icon="create-outline" colors={colors} />
            </View>
          </View>
        )}

        {!!userDoc && viewingSomeoneElse && !canShowMissionStatsToViewer && (
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 14,
              marginBottom: 24,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Ten użytkownik ukrywa statystyki misji.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/* ---------------------------------------------------------------------- */
/* ------------------------------- STAT CARD ----------------------------- */
/* ---------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  suffix,
  icon,
  colors,
}: {
  label: string;
  value: any;
  suffix?: string;
  icon?: any;
  colors: any;
}) {
  const isNumber = typeof value === "number" && !Number.isNaN(value);

  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 160,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
        {icon ? <Ionicons name={icon} size={16} color={colors.textMuted} style={{ marginRight: 6 }} /> : null}
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700" }}>{label}</Text>
      </View>

      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>
        {value ?? 0}{" "}
        {suffix && isNumber ? <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700" }}>{suffix}</Text> : null}
      </Text>
    </View>
  );
}

// app/Profile.tsx
