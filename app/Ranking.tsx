import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useThemeColors } from "../src/context/ThemeContext";
import { db } from "../src/firebase/firebase.web";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
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
  const diff = (day === 0 ? -6 : 1) - day;
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

/* ===========================================
   Ranking Screen
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
    if (mode === "day") return cursorDate.toLocaleDateString();
    if (mode === "week") {
      const s = range.start!;
      const e = range.end!;
      return `${s.toLocaleDateString()} – ${e.toLocaleDateString()}`;
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

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      {busy ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* HEADER */}
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>

            <Text style={[styles.title, { color: colors.text }]}>Ranking</Text>

            <View style={{ width: 22 }} />
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
              <TouchableOpacity onPress={() => setCursorDate(new Date(cursorDate.getTime() - 86400000))}>
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </TouchableOpacity>

              <Text style={{ color: colors.text, fontWeight: "900" }}>{periodLabel}</Text>

              <TouchableOpacity onPress={() => setCursorDate(new Date(cursorDate.getTime() + 86400000))}>
                <Ionicons name="chevron-forward" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          )}

          {/* RANKING LIST */}
          {ranking.map((u, idx) => (
            <TouchableOpacity
              key={u.id}
              onPress={() => router.push(`/Profile?uid=${u.id}`)}
              activeOpacity={0.85}
            >
              <RankRow
                user={u}
                place={idx + 1}
                isMe={u.id === myUid}
                colors={colors}
                exp={u.periodExp}
              />
            </TouchableOpacity>
          ))}
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
      style={[
        styles.modeBtn,
        {
          backgroundColor: active ? colors.accent : "transparent",
          borderColor: colors.border,
        },
      ]}
    >
      <Text
        style={{
          color: active ? "#022c22" : colors.text,
          fontWeight: "900",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ===========================================
   RankRow
=========================================== */

function RankRow({ user, place, isMe, colors, exp }: any) {
  const avatar = user.photoURL || null;
  const name =
    user.displayName ||
    user.username ||
    user.email ||
    "Użytkownik";

  return (
    <View
      style={[
        styles.row,
        {
          borderColor: colors.border,
          backgroundColor: isMe ? colors.accent + "22" : colors.card,
        },
      ]}
    >
      <Text
        style={[
          styles.place,
          {
            color:
              place === 1 ? "#facc15" :
              place === 2 ? "#e5e7eb" :
              place === 3 ? "#d97706" :
              colors.text,
          },
        ]}
      >
        {place}
      </Text>

      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.generatedAvatar}>
          <Text style={{ color: colors.accent, fontWeight: "900" }}>
            {(name?.[0] || "U").toUpperCase()}
          </Text>
        </View>
      )}

      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 15 }}>
          {name}
        </Text>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          <SmallBadge icon="sparkles-outline" label={`${exp} EXP`} colors={colors} />
        </View>
      </View>

      {isMe && (
        <Text style={{ color: colors.accent, fontWeight: "900", fontSize: 12 }}>
          To Ty!
        </Text>
      )}
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
        paddingHorizontal: 8,
        paddingVertical: 4,
      }}
    >
      <Ionicons name={icon} size={12} color={colors.accent} />
      <Text
        style={{
          marginLeft: 4,
          color: colors.accent,
          fontSize: 11,
          fontWeight: "900",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/* ===========================================
   Styles
=========================================== */

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { padding: 16, width: "100%", maxWidth: 900, alignSelf: "center" },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    alignItems: "center",
  },

  title: { fontSize: 22, fontWeight: "900" },

  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },

  modeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },

  dateNav: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    marginBottom: 16,
  },

  row: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
    alignItems: "center",
  },

  place: {
    width: 30,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },

  avatar: { width: 48, height: 48, borderRadius: 12 },

  generatedAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#fff1",
    alignItems: "center",
    justifyContent: "center",
  },
});
