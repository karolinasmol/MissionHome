// app/stats.tsx
import React, { useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "../src/context/ThemeContext";
import { useMissions } from "../src/hooks/useMissions";
import { useFamily } from "../src/hooks/useFamily";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { Platform } from "react-native";

/* ----------------------- Helpers ----------------------- */

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Nd, 1 = Pn
  const diff = (day === 0 ? -6 : 1) - day; // przesuwamy do poniedziałku
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
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

function toJsDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function isWithin(date: Date, start: Date, end: Date) {
  return date >= start && date <= end;
}

function formatDateTimeShort(d: Date | null): string {
  if (!d) return "jeszcze nie wykonano";
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type AggRow = {
  key: string;
  label: string;
  count: number;
};

type MemberStatsRow = {
  id: string;
  label: string;
  avatarInitial: string;
  weekCount: number;
  monthCount: number;
  weekExp: number;
  monthExp: number;
};

/* ----------------------- Screen ----------------------- */

export default function StatsScreen() {
  const { colors } = useThemeColors();
  const { missions, loading } = useMissions();
  const { members } = useFamily();

  const now = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeek(now), [now]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const monthEnd = useMemo(() => endOfMonth(now), [now]);

  const normalizedMissions = useMemo(
    () =>
      missions
        .filter((m: any) => !m.archived)
        .map((m: any) => ({
          ...m,
          completedAtJs: toJsDate(m.completedAt),
          dueDateJs: toJsDate(m.dueDate),
          expValueNum: Number(m.expValue ?? 0),
        })),
    [missions]
  );

  /* ---------- EXPORT DO EXCELA ---------- */

const handleExport = async () => {
  try {
const completed = normalizedMissions
  .filter((m) => m.completed)
  .map((m) => ({
    Tytuł: m.title ?? "Bez nazwy",
    Status: "Wykonane",
    "Data wykonania": m.completedAtJs
      ? m.completedAtJs.toLocaleString("pl-PL")
      : "",
    "Data planowana": m.dueDateJs
      ? m.dueDateJs.toLocaleDateString("pl-PL")
      : "",
    "Utworzone przez": m.createdByName ?? "Nieznane",
    "Zrealizowane przez": m.assignedToName ?? "Nieznane",
    EXP: m.expValueNum ?? 0,
  }));

const uncompleted = normalizedMissions
  .filter((m) => !m.completed)
  .map((m) => ({
    Tytuł: m.title ?? "Bez nazwy",
    Status: "Niewykonane",
    "Data wykonania": "",
    "Data planowana": m.dueDateJs
      ? m.dueDateJs.toLocaleDateString("pl-PL")
      : "",
    "Utworzone przez": m.createdByName ?? "Nieznane",
    "Zrealizowane przez": m.assignedToName ?? "Nieprzypisane",
    EXP: m.expValueNum ?? 0,
  }));


    // --- Workbook ---
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(completed),
      "Wykonane"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(uncompleted),
      "Niewykonane"
    );

    // --- WEB EXPORT ---
    if (Platform.OS === "web") {
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });

      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "misje_export.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();

      return;
    }

    // --- MOBILE EXPORT (Android / iOS) ---
    const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

    const fileUri = FileSystem.documentDirectory + "misje_export.xlsx";
    await FileSystem.writeAsStringAsync(fileUri, wbout, {
      encoding: FileSystem.EncodingType.Base64,
    });

    await Sharing.shareAsync(fileUri);
  } catch (error) {
    console.error("Błąd eksportu misji:", error);
    console.error("Błąd eksportu misji:", error);
    Alert.alert("Błąd eksportu", "Nie udało się wyeksportować pliku.");
  }
};

  // ----- PODSUMOWANIE TYGODNIA / MIESIĄCA -----
  const weekCompleted = useMemo(
    () =>
      normalizedMissions.filter((m) => {
        if (!m.completed || !m.completedAtJs) return false;
        return isWithin(m.completedAtJs, weekStart, weekEnd);
      }),
    [normalizedMissions, weekStart, weekEnd]
  );

  const monthCompleted = useMemo(
    () =>
      normalizedMissions.filter((m) => {
        if (!m.completed || !m.completedAtJs) return false;
        return isWithin(m.completedAtJs, monthStart, monthEnd);
      }),
    [normalizedMissions, monthStart, monthEnd]
  );

  const totalCompleted = useMemo(
    () => normalizedMissions.filter((m) => m.completed).length,
    [normalizedMissions]
  );

  const completionRate = useMemo(() => {
    if (!normalizedMissions.length) return 0;
    return Math.round((totalCompleted / normalizedMissions.length) * 100);
  }, [normalizedMissions.length, totalCompleted]);

  // ----- AGREGACJE PO TYTULE (częstotliwość) -----

  const aggregateByTitle = (list: any[]): AggRow[] => {
    const map = new Map<string, AggRow>();

    list.forEach((m) => {
      const raw = (m.title || "Bez nazwy").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      const row = map.get(key) || { key, label: raw, count: 0 };
      row.count += 1;
      map.set(key, row);
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  };

  const weekAgg = useMemo(
    () => aggregateByTitle(weekCompleted).slice(0, 6),
    [weekCompleted]
  );
  const monthAgg = useMemo(
    () => aggregateByTitle(monthCompleted).slice(0, 6),
    [monthCompleted]
  );

  // ----- STATYSTYKI DOMOWNIKÓW -----

  const membersById = useMemo(() => {
    const map = new Map<string, any>();
    (members || []).forEach((m: any) => {
      if (!m.id) return;
      map.set(String(m.id), m);
    });
    return map;
  }, [members]);

  const memberStats: MemberStatsRow[] = useMemo(() => {
    const map = new Map<string, MemberStatsRow>();

    const pushMission = (m: any) => {
      if (!m.completed || !m.completedAtJs) return;

      const id = m.assignedToUserId ? String(m.assignedToUserId) : "unknown";
      const memberDoc = membersById.get(id);

      const nameFromMember =
        memberDoc?.displayName ||
        memberDoc?.username ||
        memberDoc?.email ||
        null;

      const label =
        nameFromMember ||
        m.assignedToName ||
        m.assignedByName ||
        (id === "unknown" ? "Nieprzypisane" : "Członek rodziny");

      const initial =
        (label?.trim?.()[0] || "?").toString().toUpperCase() ?? "?";

      const current =
        map.get(id) || {
          id,
          label,
          avatarInitial: initial,
          weekCount: 0,
          monthCount: 0,
          weekExp: 0,
          monthExp: 0,
        };

      const completedAt: Date = m.completedAtJs;
      const exp = m.expValueNum || 0;

      if (isWithin(completedAt, weekStart, weekEnd)) {
        current.weekCount += 1;
        current.weekExp += exp;
      }
      if (isWithin(completedAt, monthStart, monthEnd)) {
        current.monthCount += 1;
        current.monthExp += exp;
      }

      map.set(id, current);
    };

    normalizedMissions.forEach(pushMission);

    // 🔥 USUWAMY DUCHY: tylko istniejący user + "unknown"
    const filtered = Array.from(map.values()).filter(
      (row) => row.id === "unknown" || membersById.has(row.id)
    );

    return filtered.sort((a, b) => b.weekCount - a.weekCount);
  }, [normalizedMissions, membersById, weekStart, weekEnd, monthStart, monthEnd]);

  // ----- ROZKŁAD TRUDNOŚCI (miesiąc) -----

  const difficultyStats = useMemo(() => {
    const out = {
      easy: 0,
      medium: 0,
      hard: 0,
    };

    monthCompleted.forEach((m) => {
      const mode = m.expMode as string | undefined;
      if (mode === "easy") out.easy += 1;
      else if (mode === "medium") out.medium += 1;
      else if (mode === "hard") out.hard += 1;
      else {
        // fallback na expValue
        const exp = m.expValueNum || 0;
        if (exp >= 100) out.hard += 1;
        else if (exp >= 50) out.medium += 1;
        else if (exp > 0) out.easy += 1;
      }
    });

    const total = out.easy + out.medium + out.hard || 1;

    return {
      ...out,
      total,
      easyPct: Math.round((out.easy / total) * 100),
      mediumPct: Math.round((out.medium / total) * 100),
      hardPct: Math.round((out.hard / total) * 100),
    };
  }, [monthCompleted]);

  // ----- HISTORIA ZADAŃ (ostatnie najpierw) -----

  const missionsSorted = useMemo(() => {
    const list = [...normalizedMissions];
    list.sort((a, b) => {
      const ad = a.completedAtJs ? a.completedAtJs.getTime() : 0;
      const bd = b.completedAtJs ? b.completedAtJs.getTime() : 0;
      return bd - ad; // ostatnio wykonane na górze
    });
    return list;
  }, [normalizedMissions]);

  // ----- Osiągnięcia / podsumowania PRO -----

  const topMember = useMemo(
    () => (memberStats.length > 0 ? memberStats[0] : null),
    [memberStats]
  );

  const mostFrequentTask = useMemo(
    () => (monthAgg.length > 0 ? monthAgg[0] : weekAgg[0] || null),
    [monthAgg, weekAgg]
  );

  const dominantDifficultyLabel = useMemo(() => {
    if (!difficultyStats.total) return "Brak danych";
    const { easy, medium, hard } = difficultyStats;
    if (easy >= medium && easy >= hard) return "Głównie łatwe zadania";
    if (medium >= easy && medium >= hard) return "Głównie średnie zadania";
    return "Dużo trudnych zadań 💪";
  }, [difficultyStats]);

  // ----- Animacje PRO MAX -----

  const completionAnim = useRef(new Animated.Value(0)).current;
  const easyAnim = useRef(new Animated.Value(0)).current;
  const mediumAnim = useRef(new Animated.Value(0)).current;
  const hardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!loading) {
      Animated.timing(completionAnim, {
        toValue: completionRate,
        duration: 700,
        useNativeDriver: false,
      }).start();

      Animated.timing(easyAnim, {
        toValue: difficultyStats.easyPct,
        duration: 600,
        useNativeDriver: false,
      }).start();
      Animated.timing(mediumAnim, {
        toValue: difficultyStats.mediumPct,
        duration: 600,
        useNativeDriver: false,
      }).start();
      Animated.timing(hardAnim, {
        toValue: difficultyStats.hardPct,
        duration: 600,
        useNativeDriver: false,
      }).start();
    }
  }, [
    loading,
    completionRate,
    difficultyStats.easyPct,
    difficultyStats.mediumPct,
    difficultyStats.hardPct,
    completionAnim,
    easyAnim,
    mediumAnim,
    hardAnim,
  ]);

  const completionWidth = completionAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  const easyWidth = easyAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  const mediumWidth = mediumAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  const hardWidth = hardAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  const totalDifficultyPct =
    difficultyStats.easyPct +
      difficultyStats.mediumPct +
      difficultyStats.hardPct || 1;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingVertical: 16, alignItems: "center" }}
    >
      <View style={{ width: "100%", maxWidth: 1344, paddingHorizontal: 24 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 26,
            fontWeight: "800",
            marginBottom: 8,
          }}
        >
          Statystyki 📊
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          Podsumowanie Twojej misji domowej. PRO MAX edition.
        </Text>

        {/* GUZIK EXPORTU MISJI */}
        <View style={{ marginBottom: 16 }}>
          <TouchableOpacity
            onPress={handleExport}
            style={{
              backgroundColor: colors.accent,
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 12,
              alignSelf: "flex-start",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>
              Export Misji
            </Text>
          </TouchableOpacity>
        </View>

        {/* PODSUMOWANIE GLOBALNE + mini-achievements */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginBottom: 16,
            },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 8,
            }}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Podsumowanie aktywności
            </Text>

            {/* mini badge */}
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: colors.accent + "22",
              }}
            >
              <Text
                style={{
                  color: colors.accent,
                  fontSize: 11,
                  fontWeight: "700",
                }}
              >
                {completionRate >= 80
                  ? "Świetna robota! 🔥"
                  : completionRate >= 50
                  ? "Dobra forma 💪"
                  : "Dopiero się rozkręcamy"}
              </Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <View
                style={{
                  flexDirection: "row",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                {/* Tydzień */}
                <View style={[styles.summaryPill, { borderColor: colors.border }]}>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      marginBottom: 2,
                    }}
                  >
                    Ten tydzień
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color={colors.accent}
                    />
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 18,
                        fontWeight: "800",
                      }}
                    >
                      {weekCompleted.length}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    zadań ukończonych
                  </Text>
                </View>

                {/* Miesiąc */}
                <View style={[styles.summaryPill, { borderColor: colors.border }]}>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      marginBottom: 2,
                    }}
                  >
                    Ten miesiąc
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="stats-chart" size={14} color={colors.accent} />
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 18,
                        fontWeight: "800",
                      }}
                    >
                      {monthCompleted.length}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    zadań ukończonych
                  </Text>
                </View>

                {/* Skuteczność */}
                <View style={[styles.summaryPill, { borderColor: colors.border }]}>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      marginBottom: 2,
                    }}
                  >
                    Skuteczność
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="speedometer-outline" size={14} color={colors.accent} />
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 18,
                        fontWeight: "800",
                      }}
                    >
                      {completionRate}%
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    wszystkich zadań
                  </Text>
                </View>
              </View>

              {/* Animowany global progress bar */}
              <View style={{ marginTop: 4 }}>
                <View
                  style={{
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: "#020617",
                    borderWidth: 1,
                    borderColor: colors.border,
                    overflow: "hidden",
                  }}
                >
                  <Animated.View
                    style={{
                      height: "100%",
                      width: completionWidth,
                      backgroundColor: colors.accent,
                      borderRadius: 999,
                    }}
                  />
                </View>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 10,
                    marginTop: 4,
                  }}
                >
                  Progres wszystkich zadań w czasie istnienia misji.
                </Text>
              </View>
            </>
          )}
        </View>

        {/* OSIĄGNIĘCIA / HIGHLIGHTS */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginBottom: 16,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Osiągnięcia 🎖️
          </Text>

          {loading ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Ładowanie…</Text>
          ) : (
            <View style={{ gap: 8, marginTop: 4 }}>
              <View style={styles.achievementRow}>
                <Ionicons
                  name="medal-outline"
                  size={16}
                  color="#facc15"
                  style={{ marginRight: 8 }}
                />
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                  {topMember
                    ? `Najbardziej aktywny: `
                    : `Brak danych o aktywnych domownikach.`}
                  {topMember && (
                    <Text style={{ fontWeight: "700" }}>{topMember.label}</Text>
                  )}
                </Text>
              </View>

              <View style={styles.achievementRow}>
                <Ionicons
                  name="flash-outline"
                  size={16}
                  color="#22c55e"
                  style={{ marginRight: 8 }}
                />
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                  {mostFrequentTask ? (
                    <>
                      Najczęściej wykonywane zadanie:{" "}
                      <Text style={{ fontWeight: "700" }}>
                        {mostFrequentTask.label}
                      </Text>
                    </>
                  ) : (
                    "Brak jeszcze najczęściej wykonywanego zadania."
                  )}
                </Text>
              </View>

              <View style={styles.achievementRow}>
                <Ionicons
                  name="flame-outline"
                  size={16}
                  color="#ef4444"
                  style={{ marginRight: 8 }}
                />
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                  {dominantDifficultyLabel}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* AKTYWNOŚĆ DOMOWNIKÓW */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginBottom: 16,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Aktywność domowników
          </Text>

          {loading ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Ładowanie…
            </Text>
          ) : memberStats.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Brak wykonanych zadań – brak danych do statystyk domowników.
            </Text>
          ) : (
            memberStats.map((row, index) => (
              <View
                key={row.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 6,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                {/* medale top 3 */}
                {index < 3 ? (
                  <Ionicons
                    name={
                      index === 0
                        ? "trophy"
                        : index === 1
                        ? "trophy-outline"
                        : "ribbon-outline"
                    }
                    size={18}
                    color={
                      index === 0
                        ? "#facc15"
                        : index === 1
                        ? "#a5b4fc"
                        : "#f97316"
                    }
                    style={{ marginRight: 8 }}
                  />
                ) : (
                  <View style={{ width: 18, marginRight: 8 }} />
                )}

                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: "#22d3ee22",
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginRight: 10,
                  }}
                >
                  <Text
                    style={{
                      color: colors.accent,
                      fontSize: 13,
                      fontWeight: "800",
                    }}
                  >
                    {row.avatarInitial}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                    numberOfLines={1}
                  >
                    {row.label}
                  </Text>

                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                    }}
                  >
                    {row.weekCount} zadań w tym tygodniu • {row.monthCount} w tym
                    miesiącu
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                    }}
                  >
                    EXP tydz.:{" "}
                    <Text
                      style={{ color: colors.text, fontWeight: "700" }}
                    >{`+${row.weekExp}`}</Text>
                  </Text>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                    }}
                  >
                    EXP mies.:{" "}
                    <Text
                      style={{ color: colors.text, fontWeight: "700" }}
                    >{`+${row.monthExp}`}</Text>
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* NAJCZĘŚCIEJ WYKONYWANE – TYDZIEŃ & MIESIĄC */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginBottom: 16,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Najczęściej wykonywane zadania
          </Text>

          {/* Tydzień */}
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              marginTop: 4,
              marginBottom: 2,
            }}
          >
            Ten tydzień
          </Text>
          {loading ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Ładowanie…
            </Text>
          ) : weekAgg.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Brak wykonanych zadań w tym tygodniu.
            </Text>
          ) : (
            weekAgg.map((row) => (
              <View
                key={`week-${row.key}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 3,
                }}
              >
                <Ionicons
                  name="trending-up"
                  size={14}
                  color={colors.accent}
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {row.label}
                </Text>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {row.count}×
                </Text>
              </View>
            ))
          )}

          {/* Miesiąc */}
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              marginTop: 8,
              marginBottom: 2,
            }}
          >
            Ten miesiąc
          </Text>
          {loading ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Ładowanie…
            </Text>
          ) : monthAgg.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Brak wykonanych zadań w tym miesiącu.
            </Text>
          ) : (
            monthAgg.map((row) => (
              <View
                key={`month-${row.key}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 3,
                }}
              >
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color={colors.accent}
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {row.label}
                </Text>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {row.count}×
                </Text>
              </View>
            ))
          )}
        </View>

        {/* ROZKŁAD TRUDNOŚCI – PRO MAX */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginBottom: 16,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Rozkład trudności (ten miesiąc)
          </Text>

          {loading ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Ładowanie…
            </Text>
          ) : difficultyStats.total === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Brak wykonanych zadań w tym miesiącu.
            </Text>
          ) : (
            <>
              {/* zbiorczy stacked bar jak mały wykres */}
              <View
                style={{
                  marginTop: 10,
                  marginBottom: 4,
                }}
              >
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    marginBottom: 4,
                  }}
                >
                  Ogólny rozkład trudności
                </Text>
                <View
                  style={{
                    height: 12,
                    borderRadius: 999,
                    backgroundColor: "#020617",
                    borderWidth: 1,
                    borderColor: colors.border,
                    overflow: "hidden",
                    flexDirection: "row",
                  }}
                >
                  <View
                    style={{
                      height: "100%",
                      width: `${difficultyStats.easyPct || 0}%`,
                      backgroundColor: "#22c55e",
                    }}
                  />
                  <View
                    style={{
                      height: "100%",
                      width: `${difficultyStats.mediumPct || 0}%`,
                      backgroundColor: "#eab308",
                    }}
                  />
                  <View
                    style={{
                      height: "100%",
                      width: `${difficultyStats.hardPct || 0}%`,
                      backgroundColor: "#ef4444",
                    }}
                  />
                </View>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 10,
                    marginTop: 4,
                  }}
                >
                  Łącznie {difficultyStats.total} zadań • {totalDifficultyPct}%
                </Text>
              </View>

              {/* szczegółowe paski + animacje */}
              {[
                {
                  key: "easy",
                  label: "Łatwe",
                  count: difficultyStats.easy,
                  pct: difficultyStats.easyPct,
                  icon: "leaf-outline" as const,
                  width: easyWidth,
                  color: "#22c55e",
                },
                {
                  key: "medium",
                  label: "Średnie",
                  count: difficultyStats.medium,
                  pct: difficultyStats.mediumPct,
                  icon: "alert-circle-outline" as const,
                  width: mediumWidth,
                  color: "#eab308",
                },
                {
                  key: "hard",
                  label: "Trudne",
                  count: difficultyStats.hard,
                  pct: difficultyStats.hardPct,
                  icon: "flame-outline" as const,
                  width: hardWidth,
                  color: "#ef4444",
                },
              ].map((row) => (
                <View
                  key={row.key}
                  style={{
                    marginTop: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginBottom: 6,
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Ionicons name={row.icon} size={16} color={row.color} />
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 14,
                          fontWeight: "700",
                        }}
                      >
                        {row.label}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {row.count} zadań • {row.pct}%
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
                    <Animated.View
                      style={{
                        height: "100%",
                        width: row.width,
                        borderRadius: 999,
                        backgroundColor: row.color,
                      }}
                    />
                  </View>
                </View>
              ))}
            </>
          )}
        </View>

        {/* HISTORIA ZADAŃ */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginBottom: 24,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Historia zadań
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : missionsSorted.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Nie dodano jeszcze żadnych zadań.
            </Text>
          ) : (
            missionsSorted.map((m: any) => {
              const lastDone = m.completedAtJs as Date | null;
              const lastBy =
                m.assignedToName ||
                m.assignedByName ||
                "Nieznany członek rodziny";
              const isDone = !!m.completed;

              return (
                <View
                  key={m.id}
                  style={{
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: isDone
                        ? "#22c55e99"
                        : "rgba(148,163,184,0.7)",
                      backgroundColor: isDone ? "#22c55e22" : "transparent",
                      marginTop: 2,
                    }}
                  >
                    <Ionicons
                      name={isDone ? "checkmark" : "ellipse-outline"}
                      size={14}
                      color={isDone ? "#22c55e" : colors.textMuted}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 14,
                        fontWeight: "700",
                      }}
                      numberOfLines={2}
                    >
                      {m.title || "Bez nazwy"}
                    </Text>

                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      Ostatnio wykonane:{" "}
                      <Text style={{ color: colors.text }}>
                        {formatDateTimeShort(lastDone)}
                      </Text>
                    </Text>

                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      Wykonawca:{" "}
                      <Text style={{ color: colors.text }}>{lastBy}</Text>
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 6,
  },
  labelMuted: {
    fontSize: 12,
    fontWeight: "600",
  },
  bigNumber: {
    fontSize: 20,
    fontWeight: "900",
  },
  summaryPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  achievementRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});

// app/stats.tsx
