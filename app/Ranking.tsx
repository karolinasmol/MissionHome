import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useThemeColors } from "../src/context/ThemeContext";
import { db, auth } from "../src/firebase/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";

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
   Ranking Screen – MEGA Mobile UI
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
    if (mode === "month") {
      return cursorDate.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
    }
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
  const myIndex = useMemo(() => ranking.findIndex((u) => u.id === myUid), [ranking, myUid]);
  const myUser = myIndex >= 0 ? ranking[myIndex] : null;

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

  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <TouchableOpacity onPress={() => router.push(`/Profile?uid=${item.id}`)} activeOpacity={0.88}>
        <RankRow user={item} place={index + 1} isMe={item.id === myUid} colors={colors} exp={item.periodExp} />
      </TouchableOpacity>
    ),
    [router, myUid, colors]
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <View style={[styles.page, { backgroundColor: colors.bg }]}>
        {busy ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <>
            <FlatList
              data={ranking}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              stickyHeaderIndices={[0]}
              ListHeaderComponent={
                <HeaderMega
                  colors={colors}
                  router={router}
                  mode={mode}
                  setMode={setMode}
                  periodLabel={periodLabel}
                  showDateNav={mode !== "all"}
                  onPrev={movePrev}
                  onNext={moveNext}
                  onNow={resetNow}
                  top3={top3}
                  myUid={myUid}
                />
              }
              ListFooterComponent={<View style={{ height: myUser ? 88 : 16 }} />}
              ListEmptyComponent={
                <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>Brak danych</Text>
                  <Text style={{ color: colors.text, opacity: 0.7, marginTop: 4 }}>
                    Ukończ misję albo poczekaj aż dane się zsynchronizują.
                  </Text>
                </View>
              }
            />

            {/* Floating "You" card */}
            {!!myUser && (
              <Pressable
                onPress={() => router.push(`/Profile?uid=${myUser.id}`)}
                style={({ pressed }) => [
                  styles.floatWrap,
                  { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] },
                ]}
              >
                <View
                  style={[
                    styles.floatCard,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      shadowColor: "#000",
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    <View style={[styles.floatBadge, { backgroundColor: colors.accent + "22", borderColor: colors.accent + "55" }]}>
                      <Ionicons name="person" size={12} color={colors.accent} />
                      <Text style={{ color: colors.accent, fontWeight: "900", fontSize: 12, marginLeft: 6 }}>Ty</Text>
                    </View>

                    <Text style={{ color: colors.text, fontWeight: "900" }} numberOfLines={1}>
                      {myIndex + 1}. {myUser.displayName || myUser.username || myUser.email || "Użytkownik"}
                    </Text>
                  </View>

                  <View style={[styles.floatExp, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                    <Ionicons name="sparkles" size={12} color={"#022c22"} />
                    <Text style={{ color: "#022c22", fontWeight: "900", marginLeft: 6 }}>
                      {fmtCompact(myUser.periodExp)} EXP
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

/* ===========================================
   Header Mega (sticky) + Podium
=========================================== */

function HeaderMega({
  colors,
  router,
  mode,
  setMode,
  periodLabel,
  showDateNav,
  onPrev,
  onNext,
  onNow,
  top3,
  myUid,
}: any) {
  return (
    <View style={[styles.headerSticky, { backgroundColor: colors.bg }]}>
      {/* HERO */}
      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.heroTop}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={[styles.iconBtn, { borderColor: colors.border }]}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[styles.heroTitle, { color: colors.text }]}>Ranking</Text>
            <Text style={{ color: colors.text, opacity: 0.65, marginTop: 2, fontWeight: "800" }} numberOfLines={1}>
              {periodLabel}
            </Text>
          </View>

          <TouchableOpacity onPress={onNow} hitSlop={12} style={[styles.iconBtn, { borderColor: colors.border }]}>
            <Ionicons name="time-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* SEGMENTED */}
        <SegmentedMega colors={colors} mode={mode} setMode={setMode} />

        {/* DATE NAV */}
        {showDateNav && (
          <View style={styles.dateNav}>
            <TouchableOpacity onPress={onPrev} hitSlop={10} style={[styles.chevBtn, { borderColor: colors.border }]}>
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </TouchableOpacity>

            <View style={[styles.datePill, { borderColor: colors.border, backgroundColor: colors.bg }]}>
              <Ionicons name="calendar-outline" size={14} color={colors.text} style={{ opacity: 0.75 }} />
              <Text style={{ color: colors.text, fontWeight: "900", marginLeft: 8 }} numberOfLines={1}>
                {periodLabel}
              </Text>
            </View>

            <TouchableOpacity onPress={onNext} hitSlop={10} style={[styles.chevBtn, { borderColor: colors.border }]}>
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        )}

        {/* PODIUM */}
        <View style={[styles.podiumWrap, { borderColor: colors.border, backgroundColor: colors.bg }]}>
          <Text style={{ color: colors.text, fontWeight: "900", marginBottom: 10 }}>TOP 3</Text>

          <View style={styles.podiumRow}>
            <PodiumCard colors={colors} user={top3?.[1]} place={2} myUid={myUid} />
            <PodiumCard colors={colors} user={top3?.[0]} place={1} myUid={myUid} big />
            <PodiumCard colors={colors} user={top3?.[2]} place={3} myUid={myUid} />
          </View>
        </View>
      </View>

      {/* Separator space under sticky hero */}
      <View style={{ height: 10 }} />
    </View>
  );
}

function SegmentedMega({ colors, mode, setMode }: any) {
  const items = useMemo(
    () => [
      { key: "day", label: "Dzień", icon: "sunny-outline" },
      { key: "week", label: "Tydzień", icon: "calendar-outline" },
      { key: "month", label: "Miesiąc", icon: "calendar-number-outline" },
      { key: "all", label: "Całość", icon: "infinite-outline" },
    ],
    []
  );

  const [w, setW] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  const idx = useMemo(() => items.findIndex((x) => x.key === mode), [items, mode]);

  useEffect(() => {
    Animated.spring(anim, {
      toValue: idx,
      useNativeDriver: true,
      speed: 18,
      bounciness: 8,
    }).start();
  }, [idx, anim]);

  const segW = w ? (w - 8) / 4 : 0; // 4 przyciski + padding

  const translateX = anim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: [0, segW, segW * 2, segW * 3],
  });

  return (
    <View
      style={[styles.segmentShell, { borderColor: colors.border, backgroundColor: colors.bg }]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {/* sliding highlight */}
      {!!segW && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segmentHighlight,
            {
              width: segW,
              backgroundColor: colors.accent,
              transform: [{ translateX }],
            },
          ]}
        />
      )}

      {items.map((it) => {
        const active = it.key === mode;
        return (
          <Pressable
            key={it.key}
            onPress={() => setMode(it.key)}
            style={({ pressed }) => [
              styles.segmentBtn,
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Ionicons name={it.icon as any} size={14} color={active ? "#022c22" : colors.text} style={{ opacity: active ? 1 : 0.75 }} />
            <Text style={{ color: active ? "#022c22" : colors.text, fontWeight: "900", fontSize: 12, marginLeft: 6 }}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PodiumCard({ colors, user, place, myUid, big }: any) {
  const name = user ? user.displayName || user.username || user.email || "Użytkownik" : "—";
  const exp = user ? Number(user.periodExp || 0) : 0;
  const avatar = user?.photoURL || null;
  const isMe = user?.id && myUid && user.id === myUid;

  const medal =
    place === 1 ? "trophy" : place === 2 ? "medal" : "ribbon";

  const medalColor =
    place === 1 ? "#facc15" : place === 2 ? "#e5e7eb" : "#d97706";

  return (
    <View
      style={[
        styles.podiumCard,
        big && styles.podiumCardBig,
        {
          borderColor: isMe ? colors.accent + "77" : colors.border,
          backgroundColor: isMe ? colors.accent + "18" : colors.card,
        },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={[styles.podiumPlace, { backgroundColor: medalColor + "22", borderColor: medalColor + "55" }]}>
          <Ionicons name={medal as any} size={14} color={medalColor} />
          <Text style={{ color: medalColor, fontWeight: "900", marginLeft: 6 }}>{place}</Text>
        </View>

        {isMe && (
          <View style={[styles.meTiny, { backgroundColor: colors.accent + "22", borderColor: colors.accent + "55" }]}>
            <Text style={{ color: colors.accent, fontWeight: "900", fontSize: 10 }}>TO TY</Text>
          </View>
        )}
      </View>

      <View style={{ alignItems: "center", marginTop: 10 }}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={[styles.podiumAvatar, big && styles.podiumAvatarBig]} />
        ) : (
          <View style={[styles.podiumAvatarGen, { borderColor: colors.border, backgroundColor: colors.bg }, big && styles.podiumAvatarBig]}>
            <Text style={{ color: colors.accent, fontWeight: "900", fontSize: big ? 18 : 16 }}>
              {(name?.[0] || "U").toUpperCase()}
            </Text>
          </View>
        )}

        <Text style={{ color: colors.text, fontWeight: "900", marginTop: 8 }} numberOfLines={1}>
          {name}
        </Text>

        <View style={[styles.podiumExp, { backgroundColor: colors.accent + "22", borderColor: colors.accent + "55" }]}>
          <Ionicons name="sparkles-outline" size={12} color={colors.accent} />
          <Text style={{ color: colors.accent, fontWeight: "900", marginLeft: 6 }}>{fmtCompact(exp)} EXP</Text>
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
            <Text style={{ color: colors.accent, fontWeight: "900" }}>
              {(name?.[0] || "U").toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1 }}>
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

        <View style={{ flexDirection: "row", marginTop: 8 }}>
          <View
            style={[
              styles.expChip,
              { backgroundColor: colors.accent + "22", borderColor: colors.accent + "55" },
            ]}
          >
            <Ionicons name="sparkles-outline" size={12} color={colors.accent} />
            <Text style={{ marginLeft: 6, color: colors.accent, fontSize: 12, fontWeight: "900" }}>
              {fmtCompact(exp)} EXP
            </Text>
          </View>
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
   Styles
=========================================== */

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: { flex: 1 },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  listContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
  },

  headerSticky: {
    paddingTop: 2,
  },

  hero: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    overflow: "hidden",
  },

  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  heroTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  segmentShell: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 4,
    flexDirection: "row",
    position: "relative",
    overflow: "hidden",
  },

  segmentHighlight: {
    position: "absolute",
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 12,
    opacity: 0.95,
  },

  segmentBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    zIndex: 2,
  },

  dateNav: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  chevBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  datePill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    height: 40,
    paddingHorizontal: 12,
    alignItems: "center",
    flexDirection: "row",
  },

  podiumWrap: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },

  podiumRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
  },

  podiumCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
  },

  podiumCardBig: {
    flex: 1.12,
    padding: 12,
    borderRadius: 18,
    transform: [{ translateY: -6 }],
  },

  podiumPlace: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  meTiny: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  podiumAvatar: { width: 44, height: 44, borderRadius: 16 },
  podiumAvatarBig: { width: 54, height: 54, borderRadius: 18 },

  podiumAvatarGen: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  podiumExp: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
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

  expChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },

  empty: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 8,
  },

  floatWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
  },

  floatCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    shadowOpacity: Platform.OS === "ios" ? 0.16 : 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  floatBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
  },

  floatExp: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
});
