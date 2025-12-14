// app/Ranking.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useThemeColors } from "../src/context/ThemeContext";
import { db } from "../src/firebase/firebase.web";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { auth } from "../src/firebase/firebase";

/* ===========================================
   Helpers – daty
=========================================== */

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // poniedziałek
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfWeek(date: Date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
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

function toJs(v: any) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function addMonths(base: Date, months: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function fmtCompact(n: number) {
  const x = Number(n || 0);
  if (x >= 1000000) return `${(x / 1000000).toFixed(x % 1000000 === 0 ? 0 : 1)}M`;
  if (x >= 1000) return `${(x / 1000).toFixed(x % 1000 === 0 ? 0 : 1)}k`;
  return `${x}`;
}

/* ===========================================
   Ranking Screen (WEB)
=========================================== */

export default function RankingScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const myUid = auth.currentUser?.uid ?? null;

  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [missions, setMissions] = useState<any[]>([]);
  const [loadingMissions, setLoadingMissions] = useState(true);

  /* Fetch users */
  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("totalExp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const arr: any[] = [];
      snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
      setUsers(arr);
      setLoadingUsers(false);
    });
    return unsub;
  }, []);

  /* Fetch missions */
  useEffect(() => {
    const q = query(collection(db, "missions"), orderBy("completedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const arr: any[] = [];
      snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
      setMissions(arr);
      setLoadingMissions(false);
    });
    return unsub;
  }, []);

  /* Ranking mode */
  const [mode, setMode] = useState<"day" | "week" | "month" | "all">("day");
  const [cursorDate, setCursorDate] = useState<Date>(new Date());

  const range = useMemo(() => {
    if (mode === "all") return { start: null, end: null };
    if (mode === "day") return { start: startOfDay(cursorDate), end: endOfDay(cursorDate) };
    if (mode === "week") return { start: startOfWeek(cursorDate), end: endOfWeek(cursorDate) };
    if (mode === "month") return { start: startOfMonth(cursorDate), end: endOfMonth(cursorDate) };
    return { start: null, end: null };
  }, [cursorDate, mode]);

  const periodLabel = useMemo(() => {
    if (mode === "day") return cursorDate.toLocaleDateString("pl-PL");
    if (mode === "week") {
      const s = range.start!;
      const e = range.end!;
      return `${s.toLocaleDateString("pl-PL")} – ${e.toLocaleDateString("pl-PL")}`;
    }
    if (mode === "month")
      return cursorDate.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
    return "Cały czas";
  }, [cursorDate, mode, range]);

  /* Sorting EXP */
  const ranking = useMemo(() => {
    if (!users.length) return [];

    const map: Record<string, number> = {};
    users.forEach((u) => (map[u.id] = 0));

    if (mode === "all") {
      users.forEach((u) => (map[u.id] = Number(u.totalExp ?? 0)));
    } else {
      missions.forEach((m) => {
        if (!m?.completed) return;
        const uid = m.assignedToId || m.assignedToUserId || m.assignedToUID;
        if (!uid) return;

        const d = toJs(m.completedAt);
        if (!d) return;

        const exp = Number(m.expValue ?? 0);

        if (range.start && range.end && d >= range.start && d <= range.end) {
          map[uid] = (map[uid] || 0) + exp;
        }
      });
    }

    return users
      .map((u) => ({ ...u, periodExp: map[u.id] || 0 }))
      .sort((a, b) => b.periodExp - a.periodExp);
  }, [users, missions, mode, range]);

  const busy = loadingUsers || loadingMissions;

  const top3 = useMemo(() => ranking.slice(0, 3), [ranking]);

  const movePrev = useCallback(() => {
    if (mode === "day") setCursorDate((d) => addDays(d, -1));
    else if (mode === "week") setCursorDate((d) => addDays(d, -7));
    else if (mode === "month") setCursorDate((d) => addMonths(d, -1));
  }, [mode]);

  const moveNext = useCallback(() => {
    if (mode === "day") setCursorDate((d) => addDays(d, 1));
    else if (mode === "week") setCursorDate((d) => addDays(d, 7));
    else if (mode === "month") setCursorDate((d) => addMonths(d, 1));
  }, [mode]);

  const resetNow = useCallback(() => setCursorDate(new Date()), []);

  // ✅ orby jak w app/index.tsx (z blur na web)
  const orbBlur = Platform.OS === "web" ? ({ filter: "blur(48px)" } as any) : null;

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      {/* 🔥 TŁO: orby/gradienty jak w app/index.tsx */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
        }}
      >
        {/* orb 1 */}
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
        {/* orb 2 */}
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
        {/* orb 3 */}
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
        {/* orb 4 */}
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
        {/* orb 5 */}
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

      {busy ? (
        <View style={[styles.center, { zIndex: 1 }]}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, zIndex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* HEADER CARD */}
          <View
            style={[
              styles.topBarCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                position: "relative",
                overflow: "hidden",
              },
            ]}
          >
            {/* dekoracyjne kółka (jak w kalendarzu/family) */}
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

            <View style={styles.heroTop}>
              <TouchableOpacity
                onPress={() => router.back()}
                hitSlop={12}
                style={[styles.iconBtn, { borderColor: colors.border }]}
                activeOpacity={0.9}
              >
                <Ionicons name="arrow-back" size={20} color={colors.text} />
              </TouchableOpacity>

              <View style={{ flex: 1, alignItems: "center", minWidth: 0 }}>
                <Text style={[styles.heroTitle, { color: colors.text }]} numberOfLines={1}>
                  Ranking
                </Text>
                <Text
                  style={{ color: colors.text, opacity: 0.65, marginTop: 2, fontWeight: "800" }}
                  numberOfLines={1}
                >
                  {periodLabel}
                </Text>
              </View>

              <TouchableOpacity
                onPress={resetNow}
                hitSlop={12}
                style={[styles.iconBtn, { borderColor: colors.border }]}
                activeOpacity={0.9}
              >
                <Ionicons name="time-outline" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* MODE BUTTONS */}
            <View style={styles.modeRow}>
              <ModeBtn label="Dzień" mode="day" current={mode} setMode={setMode} colors={colors} />
              <ModeBtn label="Tydzień" mode="week" current={mode} setMode={setMode} colors={colors} />
              <ModeBtn label="Miesiąc" mode="month" current={mode} setMode={setMode} colors={colors} />
              <ModeBtn label="Całość" mode="all" current={mode} setMode={setMode} colors={colors} />
            </View>

            {/* DATE NAV */}
            {mode !== "all" && (
              <View style={styles.dateNav}>
                <TouchableOpacity
                  onPress={movePrev}
                  hitSlop={10}
                  style={[styles.chevBtn, { borderColor: colors.border }]}
                  activeOpacity={0.9}
                >
                  <Ionicons name="chevron-back" size={18} color={colors.text} />
                </TouchableOpacity>

                <View style={[styles.datePill, { borderColor: colors.border, backgroundColor: colors.bg }]}>
                  <Ionicons name="calendar-outline" size={14} color={colors.text} style={{ opacity: 0.75 }} />
                  <Text style={{ color: colors.text, fontWeight: "900", marginLeft: 8 }} numberOfLines={1}>
                    {periodLabel}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={moveNext}
                  hitSlop={10}
                  style={[styles.chevBtn, { borderColor: colors.border }]}
                  activeOpacity={0.9}
                >
                  <Ionicons name="chevron-forward" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* TOP 3 (jak w native) */}
          <Top3Card colors={colors} top3={top3} myUid={myUid} />

          {/* RANKING LIST */}
          {ranking.length ? (
            ranking.map((u, idx) => (
              <TouchableOpacity
                key={u.id}
                onPress={() => router.push(`/Profile?uid=${u.id}`)}
                activeOpacity={0.85}
              >
                <RankRow user={u} place={idx + 1} isMe={u.id === myUid} colors={colors} exp={u.periodExp} />
              </TouchableOpacity>
            ))
          ) : (
            <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>Brak danych</Text>
              <Text style={{ color: colors.text, opacity: 0.7, marginTop: 4 }}>
                Ukończ misję albo poczekaj aż dane się zsynchronizują.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/* ===========================================
   ModeBtn
=========================================== */

function ModeBtn({ label, mode, current, setMode, colors }: any) {
  const active = mode === current;
  return (
    <TouchableOpacity
      onPress={() => setMode(mode)}
      activeOpacity={0.9}
      style={[
        styles.modeBtn,
        {
          backgroundColor: active ? colors.accent : "transparent",
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={{ color: active ? "#022c22" : colors.text, fontWeight: "900", fontSize: 12 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ===========================================
   TOP 3
=========================================== */

function Top3Card({ colors, top3, myUid }: any) {
  return (
    <View style={[styles.top3Card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.top3HeaderRow}>
        <Text style={{ color: colors.text, fontWeight: "900" }}>TOP 3</Text>
        <Text style={{ color: colors.text, opacity: 0.6, fontWeight: "800", fontSize: 12 }}>najwięcej EXP</Text>
      </View>

      <View style={styles.podiumRow}>
        <PodiumCard colors={colors} user={top3?.[1]} place={2} myUid={myUid} />
        <PodiumCard colors={colors} user={top3?.[0]} place={1} myUid={myUid} big />
        <PodiumCard colors={colors} user={top3?.[2]} place={3} myUid={myUid} />
      </View>
    </View>
  );
}

function PodiumCard({ colors, user, place, myUid, big }: any) {
  const name = user ? user.displayName || user.username || user.email || "Użytkownik" : "—";
  const exp = user ? Number(user.periodExp || 0) : 0;
  const avatar = user?.photoURL || null;
  const isMe = user?.id && myUid && user.id === myUid;

  const medal = place === 1 ? "trophy" : place === 2 ? "medal" : "ribbon";
  const medalColor = place === 1 ? "#facc15" : place === 2 ? "#e5e7eb" : "#d97706";

  return (
    <View
      style={[
        styles.podiumCard,
        big && styles.podiumCardBig,
        {
          borderColor: isMe ? colors.accent + "77" : colors.border,
          backgroundColor: isMe ? colors.accent + "18" : colors.bg,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={[styles.podiumPlace, { backgroundColor: medalColor + "22", borderColor: medalColor + "55" }]}>
          <Ionicons name={medal as any} size={13} color={medalColor} />
          <Text style={{ color: medalColor, fontWeight: "900", marginLeft: 6, fontSize: 12 }}>{place}</Text>
        </View>

        {isMe && (
          <View style={[styles.meTiny, { backgroundColor: colors.accent + "22", borderColor: colors.accent + "55" }]}>
            <Text style={{ color: colors.accent, fontWeight: "900", fontSize: 10 }}>TO TY</Text>
          </View>
        )}
      </View>

      <View style={{ alignItems: "center", marginTop: big ? 4 : 2 }}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={[styles.podiumAvatar, big && styles.podiumAvatarBig]} />
        ) : (
          <View
            style={[
              styles.podiumAvatarGen,
              { borderColor: colors.border, backgroundColor: colors.card },
              big && styles.podiumAvatarBig,
            ]}
          >
            <Text style={{ color: colors.accent, fontWeight: "900", fontSize: big ? 16 : 14 }}>
              {(name?.[0] || "U").toUpperCase()}
            </Text>
          </View>
        )}

        <Text style={{ color: colors.text, fontWeight: "900", marginTop: 4, fontSize: 11 }} numberOfLines={1}>
          {name}
        </Text>

        <View style={[styles.podiumExp, { backgroundColor: colors.accent + "22", borderColor: colors.accent + "55" }]}>
          <Ionicons name="sparkles-outline" size={11} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: "900", marginLeft: 6, fontSize: 10 }} numberOfLines={1}>
            {fmtCompact(exp)} EXP
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ===========================================
   RankRow
=========================================== */

function RankRow({ user, place, isMe, colors, exp }: any) {
  const avatar = user.photoURL || null;
  const name = user.displayName || user.username || user.email || "Użytkownik";

  const placeColor =
    place === 1 ? "#facc15" : place === 2 ? "#e5e7eb" : place === 3 ? "#d97706" : colors.text;

  return (
    <View
      style={[
        styles.row,
        {
          borderColor: isMe ? colors.accent + "77" : colors.border,
          backgroundColor: isMe ? colors.accent + "18" : colors.card,
        },
      ]}
    >
      <View style={styles.left}>
        <View style={[styles.placeBubble, { borderColor: colors.border, backgroundColor: colors.bg }]}>
          <Text style={[styles.place, { color: placeColor }]}>{place}</Text>
        </View>

        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.generatedAvatar, { borderColor: colors.border, backgroundColor: colors.bg }]}>
            <Text style={{ color: colors.accent, fontWeight: "900" }}>{(name?.[0] || "U").toUpperCase()}</Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.nameRow}>
          <Text style={{ color: colors.text, fontWeight: "900", fontSize: 15 }} numberOfLines={1}>
            {name}
          </Text>

          {isMe && (
            <View style={[styles.mePill, { borderColor: colors.accent + "77", backgroundColor: colors.accent + "22" }]}>
              <Ionicons name="sparkles" size={12} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: "900", fontSize: 11, marginLeft: 6 }}>To Ty</Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: "row", marginTop: 8, flexWrap: "wrap" }}>
          <SmallBadge icon="sparkles-outline" label={`${fmtCompact(exp)} EXP`} colors={colors} />
        </View>
      </View>

      <Ionicons
        name={Platform.OS === "ios" ? "chevron-forward" : "chevron-forward-outline"}
        size={18}
        color={colors.text}
        style={{ opacity: 0.55 }}
      />
    </View>
  );
}

/* ===========================================
   SmallBadge
=========================================== */

function SmallBadge({ icon, label, colors }: any) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.accent + "22",
        borderWidth: 1,
        borderColor: colors.accent + "55",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 7,
      }}
    >
      <Ionicons name={icon} size={12} color={colors.accent} />
      <Text style={{ marginLeft: 6, color: colors.accent, fontSize: 12, fontWeight: "900" }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ===========================================
   Styles (mobilki friendly)
=========================================== */

const styles = StyleSheet.create({
  page: { flex: 1 },

  // mobile-first: małe paddingi, a na dużych ekranach i tak robi maxWidth + center
  scroll: {
    paddingHorizontal: 14,
    paddingTop: 12,
    width: "100%",
    maxWidth: 900,
    alignSelf: "center",
  },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  topBarCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 10,
    overflow: "hidden",
    marginBottom: 8,
  },

  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  heroTitle: {
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  modeRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap", // ✅ telefon iOS/Android: ładnie się łamie
  },

  modeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },

  dateNav: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  chevBtn: {
    width: 36,
    height: 36,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  datePill: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 14,
    height: 36,
    paddingHorizontal: 12,
    alignItems: "center",
    flexDirection: "row",
  },

  top3Card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 10,
    marginTop: 6,
    marginBottom: 10,
  },

  top3HeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },

  podiumCard: {
    flex: 1,
    minWidth: 0, // ✅ web/mobile: tekst się nie rozjeżdża
    borderWidth: 1,
    borderRadius: 14,
    padding: 6,
  },

  podiumCardBig: {
    flex: 1.08,
    padding: 7,
    borderRadius: 16,
    transform: [{ translateY: -1 }],
  },

  podiumPlace: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  meTiny: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  podiumAvatar: { width: 32, height: 32, borderRadius: 12 },
  podiumAvatarBig: { width: 38, height: 38, borderRadius: 14 },

  podiumAvatarGen: {
    width: 32,
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  podiumExp: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },

  left: { flexDirection: "row", alignItems: "center", gap: 10 },

  placeBubble: {
    width: 34,
    height: 34,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  place: {
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },

  avatar: { width: 46, height: 46, borderRadius: 16 },

  generatedAvatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  mePill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
  },

  empty: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 8,
  },
});

// app/Ranking.tsx
