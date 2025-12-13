// app/stats.tsx
import React, { useMemo, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Pressable,
  Alert,
  Platform,
  SafeAreaView,
  useWindowDimensions,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "../src/context/ThemeContext";
import { useMissions } from "../src/hooks/useMissions";
import { useFamily } from "../src/hooks/useFamily";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";

/* ----------------------- Helpers ----------------------- */

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Nd
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

function formatDateShort(d: Date) {
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
}

/* ----------------------- Types ----------------------- */

type AggRow = { key: string; label: string; count: number };

type MemberStatsRow = {
  id: string;
  label: string;
  avatarInitial: string;
  weekCount: number;
  monthCount: number;
  weekExp: number;
  monthExp: number;
};

type TileId =
  | "summary"
  | "mission-search"
  | "achievements"
  | "leaderboard"
  | "freq"
  | "difficulty";

type TileConfig = {
  id: TileId;
  wide?: boolean; // full row
  hidden?: boolean;
};

/* ----------------------- Persistence ----------------------- */

const LAYOUT_STORAGE_KEY = "stats_dashboard_tiles_v2";
const LAYOUT_FILE_NAME = "stats_dashboard_tiles_v2.json";

async function loadLayout(): Promise<TileConfig[] | null> {
  try {
    if (Platform.OS === "web") {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed;
    }

    const uri = FileSystem.documentDirectory + LAYOUT_FILE_NAME;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;

    const raw = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveLayout(layout: TileConfig[]) {
  try {
    const raw = JSON.stringify(layout);
    if (Platform.OS === "web") {
      localStorage.setItem(LAYOUT_STORAGE_KEY, raw);
      return;
    }
    const uri = FileSystem.documentDirectory + LAYOUT_FILE_NAME;
    await FileSystem.writeAsStringAsync(uri, raw);
  } catch {
    // silent
  }
}

/* ----------------------- UI Bits ----------------------- */

function Divider({ colors }: { colors: any }) {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        opacity: 0.9,
      }}
    />
  );
}

function Chip({
  colors,
  icon,
  text,
}: {
  colors: any;
  icon?: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: `${colors.textMuted}10`, borderColor: colors.border },
      ]}
    >
      {!!icon && (
        <Ionicons
          name={icon}
          size={14}
          color={colors.textMuted}
          style={{ marginRight: 6 }}
        />
      )}
      <Text
        style={[styles.chipText, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

function PrimaryButton({
  colors,
  icon,
  label,
  onPress,
  style,
}: {
  colors: any;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  style?: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.heroActionPill,
        {
          backgroundColor: colors.accent,
          opacity: pressed ? 0.88 : 1,
          borderColor: "transparent",
        },
        style,
      ]}
      hitSlop={10}
    >
      <Ionicons name={icon} size={16} color="#fff" style={{ marginRight: 8 }} />
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

/**
 * ✅ Card z opcją scrollowania środka.
 * - scroll=true => zawartość w ScrollView, nic nie wyjeżdża poza kafelek.
 * - overflow hidden + minHeight:0 => działa poprawnie na web i mobile.
 */
function Card({
  colors,
  title,
  subtitle,
  right,
  children,
  style,
  scroll,
}: {
  colors: any;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: any;
  scroll?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: "#000",
        },
        style,
      ]}
    >
      {(title || right) && (
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {!!title && (
              <Text
                style={[styles.cardTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {title}
              </Text>
            )}
            {!!subtitle && (
              <Text
                style={[styles.cardSubtitle, { color: colors.textMuted }]}
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            )}
          </View>
          {!!right && <View style={{ marginLeft: 12 }}>{right}</View>}
        </View>
      )}

      {scroll ? (
        <View style={{ flex: 1, minHeight: 0 }}>
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 2 }}
          >
            {children}
          </ScrollView>
        </View>
      ) : (
        <>{children}</>
      )}
    </View>
  );
}

/* ----------------------- Screen ----------------------- */

const TILE_H = 320;

export default function StatsScreen() {
  const { colors } = useThemeColors();
  const { missions, loading } = useMissions();
  const { members } = useFamily();
  const { width } = useWindowDimensions();

  const isNarrow = width < 520;

  const is2Col = width >= 860;
  const is3Col = width >= 1220;
  const columns = is3Col ? 3 : is2Col ? 2 : 1;

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

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(completed), "Wykonane");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(uncompleted), "Niewykonane");

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

      const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      const fileUri = FileSystem.documentDirectory + "misje_export.xlsx";
      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await Sharing.shareAsync(fileUri);
    } catch (error) {
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

  // ----- AGREGACJE PO TYTULE -----
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

  const weekAgg = useMemo(() => aggregateByTitle(weekCompleted).slice(0, 5), [weekCompleted]);
  const monthAgg = useMemo(() => aggregateByTitle(monthCompleted).slice(0, 5), [monthCompleted]);

  const maxWeekAgg = useMemo(() => (weekAgg[0]?.count ?? 1), [weekAgg]);
  const maxMonthAgg = useMemo(() => (monthAgg[0]?.count ?? 1), [monthAgg]);

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
        memberDoc?.displayName || memberDoc?.username || memberDoc?.email || null;

      const label =
        nameFromMember ||
        m.assignedToName ||
        m.assignedByName ||
        (id === "unknown" ? "Nieprzypisane" : "Członek rodziny");

      const initial = (label?.trim?.()[0] || "?").toString().toUpperCase() ?? "?";

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

    const filtered = Array.from(map.values()).filter(
      (row) => row.id === "unknown" || membersById.has(row.id)
    );

    return filtered.sort((a, b) => b.weekCount - a.weekCount);
  }, [normalizedMissions, membersById, weekStart, weekEnd, monthStart, monthEnd]);

  // ----- ROZKŁAD TRUDNOŚCI (miesiąc) -----
  const difficultyStats = useMemo(() => {
    const out = { easy: 0, medium: 0, hard: 0 };

    monthCompleted.forEach((m) => {
      const mode = m.expMode as string | undefined;
      if (mode === "easy") out.easy += 1;
      else if (mode === "medium") out.medium += 1;
      else if (mode === "hard") out.hard += 1;
      else {
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

  // ----- HISTORIA -----
  const missionsSorted = useMemo(() => {
    const list = [...normalizedMissions];
    list.sort((a, b) => {
      const ad = a.completedAtJs ? a.completedAtJs.getTime() : 0;
      const bd = b.completedAtJs ? b.completedAtJs.getTime() : 0;
      return bd - ad;
    });
    return list;
  }, [normalizedMissions]);

  // ----- highlights -----
  const topMember = useMemo(() => (memberStats.length > 0 ? memberStats[0] : null), [memberStats]);
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

  // ----- Animacje -----
  const completionAnim = useRef(new Animated.Value(0)).current;
  const easyAnim = useRef(new Animated.Value(0)).current;
  const mediumAnim = useRef(new Animated.Value(0)).current;
  const hardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!loading) {
      Animated.timing(completionAnim, {
        toValue: completionRate,
        duration: 650,
        useNativeDriver: false,
      }).start();
      Animated.timing(easyAnim, {
        toValue: difficultyStats.easyPct,
        duration: 550,
        useNativeDriver: false,
      }).start();
      Animated.timing(mediumAnim, {
        toValue: difficultyStats.mediumPct,
        duration: 550,
        useNativeDriver: false,
      }).start();
      Animated.timing(hardAnim, {
        toValue: difficultyStats.hardPct,
        duration: 550,
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

  const badgeText =
    completionRate >= 80
      ? "Świetna robota! 🔥"
      : completionRate >= 50
      ? "Dobra forma 💪"
      : "Dopiero się rozkręcamy";

  const trackColor = `${colors.textMuted}18`;

  const difficultyColors = {
    easy: "#22c55e",
    medium: "#eab308",
    hard: "#ef4444",
  };

  /* -------------------- Customizable tiles (stable) -------------------- */

  const DEFAULT_TILES: TileConfig[] = useMemo(
    () => [
      { id: "summary" },
      { id: "achievements" },
      { id: "leaderboard" },
      { id: "mission-search", wide: true },
      { id: "freq" },
      { id: "difficulty" },
    ],
    []
  );

  const [editOpen, setEditOpen] = useState(false);
  const [tiles, setTiles] = useState<TileConfig[]>(DEFAULT_TILES);

  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await loadLayout();
      if (!alive) return;

      if (saved?.length) {
        const byId = new Map<TileId, TileConfig>();
        saved.forEach((t: any) => {
          if (!t?.id) return;
          byId.set(t.id, {
            id: t.id,
            wide: !!t.wide,
            hidden: !!t.hidden,
          });
        });

        const merged: TileConfig[] = DEFAULT_TILES.map((t) => byId.get(t.id) || t);
        saved.forEach((t: any) => {
          if (t?.id && !merged.find((m) => m.id === t.id)) {
            merged.push({ id: t.id, wide: !!t.wide, hidden: !!t.hidden });
          }
        });

        setTiles(merged);
      }
    })();
    return () => {
      alive = false;
    };
  }, [DEFAULT_TILES]);

  useEffect(() => {
    const t = setTimeout(() => {
      saveLayout(tiles);
    }, 250);
    return () => clearTimeout(t);
  }, [tiles]);

  const resetTiles = () => setTiles(DEFAULT_TILES);

  const moveTile = (id: TileId, dir: -1 | 1) => {
    setTiles((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  };

  const toggleHide = (id: TileId) => {
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, hidden: !t.hidden } : t)));
  };

  const toggleWide = (id: TileId) => {
    setTiles((prev) => prev.map((t) => (t.id === id ? { ...t, wide: !t.wide } : t)));
  };

  const visibleTiles = useMemo(() => tiles.filter((t) => !t.hidden), [tiles]);

  const itemBasis = useMemo(() => {
    if (columns === 1) return "100%";
    if (columns === 2) return "50%";
    return "33.333%";
  }, [columns]);

  /* -------------------- Mission search tile (with modal) -------------------- */

  const [missionQuery, setMissionQuery] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const allTitleStats = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        completed: number;
        lastDone: Date | null;
        by: Map<string, { id: string; name: string; count: number }>;
        events: Array<{ id: string; date: Date | null; userName: string; exp: number }>;
      }
    >();

    const resolveName = (m: any) => {
      const id = m.assignedToUserId ? String(m.assignedToUserId) : "unknown";
      const memberDoc = membersById.get(id);
      const nameFromMember =
        memberDoc?.displayName || memberDoc?.username || memberDoc?.email || null;

      const name =
        nameFromMember ||
        m.assignedToName ||
        m.assignedByName ||
        (id === "unknown" ? "Nieprzypisane" : "Członek rodziny");

      return { id, name };
    };

    normalizedMissions.forEach((m: any) => {
      const raw = (m.title || "Bez nazwy").trim();
      if (!raw) return;

      const key = raw.toLowerCase();
      const row =
        map.get(key) || {
          key,
          label: raw,
          completed: 0,
          lastDone: null as Date | null,
          by: new Map(),
          events: [] as Array<{ id: string; date: Date | null; userName: string; exp: number }>,
        };

      if (m.completed && m.completedAtJs) {
        row.completed += 1;
        const who = resolveName(m);
        const p = row.by.get(who.id) || { id: who.id, name: who.name, count: 0 };
        p.count += 1;
        row.by.set(who.id, p);

        const date: Date | null = m.completedAtJs ?? null;
        if (date && (!row.lastDone || date.getTime() > row.lastDone.getTime())) row.lastDone = date;

        row.events.push({
          id: String(m.id ?? `${key}-${row.events.length}`),
          date,
          userName: who.name,
          exp: Number(m.expValueNum ?? 0),
        });
      }

      map.set(key, row);
    });

    const out = Array.from(map.values()).map((r) => {
      const byPeople = Array.from(r.by.values()).sort((a, b) => b.count - a.count);
      const events = [...r.events].sort(
        (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)
      );
      return { ...r, byPeople, events };
    });

    out.sort((a, b) =>
      b.completed !== a.completed ? b.completed - a.completed : a.label.localeCompare(b.label, "pl")
    );
    return out;
  }, [normalizedMissions, membersById]);

  const filteredStats = useMemo(() => {
    const q = missionQuery.trim().toLowerCase();
    if (!q) return allTitleStats;
    return allTitleStats.filter((t) => t.label.toLowerCase().includes(q));
  }, [allTitleStats, missionQuery]);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return allTitleStats.find((t) => t.key === selectedKey) || null;
  }, [allTitleStats, selectedKey]);

  /* -------------------- Render tiles -------------------- */

  const renderTile = (tile: TileConfig) => {
    const right = (
      <Pressable
        onPress={() => setEditOpen(true)}
        hitSlop={10}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="options-outline" size={18} color={colors.textMuted} />
      </Pressable>
    );

    if (tile.id === "summary") {
      const rows = [
        {
          key: "week",
          label: "Ten tydzień",
          hint: "ukończone zadania",
          value: loading ? "—" : weekCompleted.length,
          icon: "calendar-outline" as const,
          tint: colors.accent,
        },
        {
          key: "month",
          label: "Ten miesiąc",
          hint: "ukończone zadania",
          value: loading ? "—" : monthCompleted.length,
          icon: "stats-chart-outline" as const,
          tint: colors.accent,
        },
        {
          key: "total",
          label: "Wykonane łącznie",
          hint: "od początku",
          value: loading ? "—" : totalCompleted,
          icon: "checkmark-done-outline" as const,
          tint: "#22c55e",
        },
      ];

      return (
        <Card
          colors={colors}
          title="Podsumowanie"
          subtitle="Najważniejsze liczniki."
          right={right}
          style={{ flex: 1 }}
        >
          <View style={{ marginTop: 8 }}>
            {rows.map((r, idx) => (
              <View key={r.key}>
                {idx !== 0 && (
                  <View style={{ marginVertical: 10 }}>
                    <Divider colors={colors} />
                  </View>
                )}

                <View style={styles.kpiTripleRow}>
                  <View
                    style={[
                      styles.kpiIconWrapSmall,
                      { backgroundColor: `${r.tint}16`, borderColor: `${r.tint}30` },
                    ]}
                  >
                    <Ionicons name={r.icon} size={16} color={r.tint} />
                  </View>

                  <View style={styles.kpiTripleTexts}>
                    <Text style={[styles.kpiTripleLabel, { color: colors.text }]} numberOfLines={1}>
                      {r.label}
                    </Text>
                    <Text style={[styles.kpiTripleHint, { color: colors.textMuted }]} numberOfLines={1}>
                      {r.hint}
                    </Text>
                  </View>

                  <Text style={[styles.kpiTripleValue, { color: colors.text }]} numberOfLines={1}>
                    {r.value}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      );
    }

    if (tile.id === "mission-search") {
      const top = filteredStats.slice(0, 8);
      return (
        <Card
          colors={colors}
          title="Wyszukaj misję"
          subtitle="Wybierz misję → zobacz ile razy, kto i kiedy."
          right={right}
          style={{ height: TILE_H }}
          scroll
        >
          <View style={{ marginTop: 8 }}>
            <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: `${colors.textMuted}10` }]}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                value={missionQuery}
                onChangeText={setMissionQuery}
                placeholder="np. Odkurzanie, Zmywanie…"
                placeholderTextColor={colors.textMuted}
                style={[styles.searchInput, { color: colors.text }]}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {!!missionQuery && (
                <Pressable onPress={() => setMissionQuery("")} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>

            {loading ? (
              <Text style={[styles.bodyMuted, { color: colors.textMuted, marginTop: 10 }]}>Ładowanie…</Text>
            ) : top.length === 0 ? (
              <Text style={[styles.bodyMuted, { color: colors.textMuted, marginTop: 10 }]}>Brak pasujących misji.</Text>
            ) : (
              <View style={{ marginTop: 10 }}>
                {top.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => {
                      setSelectedKey(t.key);
                      setDetailsOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.searchRow,
                      {
                        borderColor: colors.border,
                        backgroundColor: `${colors.textMuted}08`,
                        opacity: pressed ? 0.9 : 1,
                        marginBottom: 8,
                      },
                    ]}
                  >
                    <View style={[styles.searchDot, { borderColor: colors.border }]}>
                      <Ionicons
                        name={t.completed > 0 ? "checkmark" : "ellipse-outline"}
                        size={14}
                        color={t.completed > 0 ? colors.accent : colors.textMuted}
                      />
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.searchTitle, { color: colors.text }]} numberOfLines={1}>
                        {t.label}
                      </Text>
                      <Text style={[styles.searchMeta, { color: colors.textMuted }]} numberOfLines={1}>
                        {t.completed > 0 ? `${t.completed}× • ${formatDateTimeShort(t.lastDone)}` : "jeszcze nie wykonano"}
                      </Text>
                    </View>

                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                ))}

                <Pressable
                  onPress={() => setDetailsOpen(true)}
                  style={({ pressed }) => [
                    styles.linkBtn,
                    { borderColor: colors.border, backgroundColor: `${colors.textMuted}08`, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Ionicons name="list-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <Text style={[styles.linkBtnText, { color: colors.textMuted }]}>
                    Pokaż listę ({filteredStats.length})
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </Card>
      );
    }

    if (tile.id === "achievements") {
      return (
        <Card
          colors={colors}
          title="Osiągnięcia"
          subtitle="Szybkie insighty."
          right={right}
          style={{ flex: 1 }}
        >
          {loading ? (
            <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Ładowanie…</Text>
          ) : (
            <View style={{ marginTop: 10, gap: 10 }}>
              <View style={styles.achRow}>
                <View
                  style={[
                    styles.achIcon,
                    {
                      backgroundColor: "rgba(250,204,21,0.14)",
                      borderColor: "rgba(250,204,21,0.35)",
                    },
                  ]}
                >
                  <Ionicons name="medal-outline" size={16} color="#facc15" />
                </View>
                <Text style={[styles.achText, { color: colors.text }]}>
                  {topMember ? (
                    <>
                      Najbardziej aktywny: <Text style={{ fontWeight: "900" }}>{topMember.label}</Text>
                    </>
                  ) : (
                    "Brak danych o aktywnych domownikach."
                  )}
                </Text>
              </View>

              <View style={styles.achRow}>
                <View
                  style={[
                    styles.achIcon,
                    {
                      backgroundColor: "rgba(34,197,94,0.14)",
                      borderColor: "rgba(34,197,94,0.35)",
                    },
                  ]}
                >
                  <Ionicons name="flash-outline" size={16} color="#22c55e" />
                </View>
                <Text style={[styles.achText, { color: colors.text }]}>
                  {mostFrequentTask ? (
                    <>
                      Najczęściej: <Text style={{ fontWeight: "900" }}>{mostFrequentTask.label}</Text>
                    </>
                  ) : (
                    "Brak jeszcze najczęściej wykonywanego zadania."
                  )}
                </Text>
              </View>

              <View style={styles.achRow}>
                <View
                  style={[
                    styles.achIcon,
                    {
                      backgroundColor: "rgba(239,68,68,0.14)",
                      borderColor: "rgba(239,68,68,0.35)",
                    },
                  ]}
                >
                  <Ionicons name="flame-outline" size={16} color="#ef4444" />
                </View>
                <Text style={[styles.achText, { color: colors.text }]}>{dominantDifficultyLabel}</Text>
              </View>
            </View>
          )}
        </Card>
      );
    }

    if (tile.id === "leaderboard") {
      const list = memberStats.slice(0, 10);
      return (
        <Card
          colors={colors}
          title="Leaderboard"
          subtitle="Top (ten tydzień)."
          right={right}
          style={{ flex: 1 }}
        >
          {loading ? (
            <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Ładowanie…</Text>
          ) : list.length === 0 ? (
            <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Brak danych.</Text>
          ) : (
            <View style={{ marginTop: 10 }}>
              {list.map((row, idx) => {
                const tint =
                  idx === 0 ? "#facc15" : idx === 1 ? "#a5b4fc" : idx === 2 ? "#f97316" : colors.accent;
                const pct = Math.min(
                  100,
                  Math.round((row.weekCount / (list[0]?.weekCount || 1)) * 100)
                );
                return (
                  <View key={row.id} style={{ marginBottom: 10 }}>
                    <View style={styles.memberTop}>
                      <View style={[styles.avatar, { borderColor: colors.border, backgroundColor: `${tint}14` }]}>
                        <Text style={[styles.avatarText, { color: tint }]}>{row.avatarInitial}</Text>
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                          {idx + 1}. {row.label}
                        </Text>
                        <Text style={[styles.memberMeta, { color: colors.textMuted }]} numberOfLines={1}>
                          {row.weekCount} tydz. • {row.monthCount} mies.
                        </Text>
                      </View>

                      <Ionicons
                        name={
                          idx === 0
                            ? "trophy"
                            : idx === 1
                            ? "trophy-outline"
                            : idx === 2
                            ? "ribbon-outline"
                            : "chevron-forward"
                        }
                        size={18}
                        color={idx < 3 ? tint : colors.textMuted}
                      />
                    </View>

                    <View style={[styles.miniTrack, { backgroundColor: trackColor, borderColor: colors.border }]}>
                      <View style={{ height: "100%", width: `${pct}%`, backgroundColor: tint, borderRadius: 999 }} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>
      );
    }

    if (tile.id === "freq") {
      return (
        <Card
          colors={colors}
          title="Najczęstsze zadania"
          subtitle="Top tydzień i miesiąc."
          right={right}
          style={{ height: TILE_H }}
          scroll
        >
          {loading ? (
            <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Ładowanie…</Text>
          ) : (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Tydzień</Text>
              {weekAgg.length === 0 ? (
                <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Brak danych.</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {weekAgg.map((r, idx) => {
                    const pct = Math.round((r.count / maxWeekAgg) * 100);
                    return (
                      <View key={`w-${r.key}`} style={{ marginBottom: 10 }}>
                        <View style={styles.freqTop}>
                          <Text style={[styles.freqLabel, { color: colors.text }]} numberOfLines={1}>
                            {idx + 1}. {r.label}
                          </Text>
                          <Text style={[styles.freqCount, { color: colors.textMuted }]}>{r.count}×</Text>
                        </View>
                        <View style={[styles.miniTrack, { backgroundColor: trackColor, borderColor: colors.border }]}>
                          <View style={{ height: "100%", width: `${pct}%`, backgroundColor: colors.accent, borderRadius: 999 }} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={{ marginVertical: 8 }}>
                <Divider colors={colors} />
              </View>

              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Miesiąc</Text>
              {monthAgg.length === 0 ? (
                <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Brak danych.</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {monthAgg.map((r, idx) => {
                    const pct = Math.round((r.count / maxMonthAgg) * 100);
                    return (
                      <View key={`m-${r.key}`} style={{ marginBottom: 10 }}>
                        <View style={styles.freqTop}>
                          <Text style={[styles.freqLabel, { color: colors.text }]} numberOfLines={1}>
                            {idx + 1}. {r.label}
                          </Text>
                          <Text style={[styles.freqCount, { color: colors.textMuted }]}>{r.count}×</Text>
                        </View>
                        <View style={[styles.miniTrack, { backgroundColor: trackColor, borderColor: colors.border }]}>
                          <View style={{ height: "100%", width: `${pct}%`, backgroundColor: colors.accent, borderRadius: 999 }} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </Card>
      );
    }

    // difficulty
    return (
      <Card
        colors={colors}
        title="Trudność"
        subtitle="Ten miesiąc."
        right={right}
        style={{ height: TILE_H }}
        scroll
      >
        {loading ? (
          <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Ładowanie…</Text>
        ) : difficultyStats.total === 0 ? (
          <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>Brak danych.</Text>
        ) : (
          <View style={{ marginTop: 10 }}>
            {[
              {
                key: "easy",
                label: "Łatwe",
                icon: "leaf-outline" as const,
                count: difficultyStats.easy,
                pct: difficultyStats.easyPct,
                width: easyWidth,
                color: difficultyColors.easy,
              },
              {
                key: "medium",
                label: "Średnie",
                icon: "alert-circle-outline" as const,
                count: difficultyStats.medium,
                pct: difficultyStats.mediumPct,
                width: mediumWidth,
                color: difficultyColors.medium,
              },
              {
                key: "hard",
                label: "Trudne",
                icon: "flame-outline" as const,
                count: difficultyStats.hard,
                pct: difficultyStats.hardPct,
                width: hardWidth,
                color: difficultyColors.hard,
              },
            ].map((row) => (
              <View key={row.key} style={{ marginBottom: 12 }}>
                <View style={styles.diffTop}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Ionicons name={row.icon} size={16} color={row.color} style={{ marginRight: 8 }} />
                    <Text style={[styles.diffLabel, { color: colors.text }]}>{row.label}</Text>
                  </View>
                  <Text style={[styles.diffMeta, { color: colors.textMuted }]}>
                    {row.count} • {row.pct}%
                  </Text>
                </View>

                <View style={[styles.diffTrack, { backgroundColor: trackColor, borderColor: colors.border }]}>
                  <Animated.View style={[styles.diffFill, { width: row.width, backgroundColor: row.color }]} />
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 14, alignItems: "center" }}
      >
        <View style={{ width: "100%", maxWidth: 1344, paddingHorizontal: 16 }}>
          {/* HERO (fixed) */}
          <View style={[styles.hero, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={[styles.heroTop, isNarrow && styles.heroTopNarrow]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.heroTitle, { color: colors.text }]} numberOfLines={1}>
                  Statystyki
                </Text>
                <Text style={[styles.heroSubtitle, { color: colors.textMuted }]} numberOfLines={2}>
                  Nowoczesny dashboard dla Twojej misji domowej.
                </Text>

                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
                  <View style={{ marginRight: 8, marginBottom: 8 }}>
                    <Chip
                      colors={colors}
                      icon="calendar-outline"
                      text={`Tydzień: ${formatDateShort(weekStart)}–${formatDateShort(addDays(weekEnd, -1))}`}
                    />
                  </View>
                  <View style={{ marginRight: 8, marginBottom: 8 }}>
                    <Chip
                      colors={colors}
                      icon="stats-chart-outline"
                      text={`Miesiąc: ${formatDateShort(monthStart)}–${formatDateShort(monthEnd)}`}
                    />
                  </View>
                  <View style={{ marginRight: 8, marginBottom: 8 }}>
                    <Chip colors={colors} icon="sparkles-outline" text={badgeText} />
                  </View>
                </View>
              </View>

              <View style={[styles.heroActionsCol, isNarrow && styles.heroActionsColNarrow]}>
                <PrimaryButton
                  colors={colors}
                  icon="download-outline"
                  label="Export"
                  onPress={handleExport}
                  style={isNarrow ? styles.heroActionPillNarrow : undefined}
                />

                <Pressable
                  onPress={() => setEditOpen(true)}
                  style={({ pressed }) => [
                    styles.heroActionPill,
                    isNarrow && styles.heroActionPillNarrow,
                    {
                      borderColor: colors.border,
                      backgroundColor: `${colors.textMuted}08`,
                      opacity: pressed ? 0.85 : 1,
                      marginTop: isNarrow ? 0 : 10,
                    },
                  ]}
                >
                  <Ionicons name="options-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.textMuted, fontWeight: "900", fontSize: 13, letterSpacing: -0.1 }}>
                    Dostosuj kafelki
                  </Text>
                </Pressable>

                <View
                  style={[
                    styles.heroActionPill,
                    isNarrow ? styles.heroActionPillNarrowFull : null,
                    {
                      marginTop: isNarrow ? 0 : 10,
                      backgroundColor: `${colors.accent}14`,
                      borderColor: `${colors.accent}33`,
                      justifyContent: "center",
                    },
                  ]}
                >
                  <Text style={[styles.heroBadgeText, { color: colors.accent }]}>
                    Skuteczność: {completionRate}%
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ marginTop: 14 }}>
              <View style={styles.heroProgressRow}>
                <Text style={[styles.microLabel, { color: colors.textMuted }]}>Progres wszystkich zadań</Text>
                <Text style={[styles.microValue, { color: colors.text }]}>
                  {totalCompleted}/{normalizedMissions.length}
                </Text>
              </View>

              <View style={[styles.progressTrack, { backgroundColor: trackColor, borderColor: colors.border }]}>
                <Animated.View style={[styles.progressFill, { width: completionWidth, backgroundColor: colors.accent }]} />
              </View>

              <Text style={[styles.microHint, { color: colors.textMuted }]}>
                To jest globalny wynik (nie tylko bieżący tydzień/miesiąc).
              </Text>
            </View>
          </View>

          {/* Custom tiles (editable) */}
          <View
            style={{
              marginTop: 12,
              flexDirection: "row",
              flexWrap: "wrap",
              marginHorizontal: -6,
              alignItems: "stretch",
            }}
          >
            {visibleTiles.map((t) => (
              <View
                key={t.id}
                style={{
                  paddingHorizontal: 6,
                  marginBottom: 12,
                  flexBasis: t.wide ? "100%" : itemBasis,
                  flexGrow: t.wide ? 0 : 1,
                  alignSelf: "stretch",
                }}
              >
                {renderTile(t)}
              </View>
            ))}
          </View>

          {/* Historia (fixed) */}
          <View style={{ marginTop: 0 }}>
            <Card
              colors={colors}
              title="Historia zadań"
              subtitle="Ostatnio wykonane na górze."
              style={{ marginBottom: 24 }}
            >
              {loading ? (
                <ActivityIndicator color={colors.accent} />
              ) : missionsSorted.length === 0 ? (
                <Text style={[styles.bodyMuted, { color: colors.textMuted }]}>
                  Nie dodano jeszcze żadnych zadań.
                </Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {missionsSorted.map((m: any, idx: number) => {
                    const lastDone = m.completedAtJs as Date | null;
                    const lastBy =
                      m.assignedToName || m.assignedByName || "Nieznany członek rodziny";
                    const isDone = !!m.completed;

                    return (
                      <View key={m.id}>
                        {idx !== 0 && (
                          <View style={{ marginVertical: 10 }}>
                            <Divider colors={colors} />
                          </View>
                        )}

                        <View style={styles.historyRow}>
                          <View
                            style={[
                              styles.statusDot,
                              {
                                borderColor: isDone
                                  ? "rgba(34,197,94,0.55)"
                                  : "rgba(148,163,184,0.55)",
                                backgroundColor: isDone ? "rgba(34,197,94,0.14)" : "transparent",
                              },
                            ]}
                          >
                            <Ionicons
                              name={isDone ? "checkmark" : "ellipse-outline"}
                              size={14}
                              color={isDone ? "#22c55e" : colors.textMuted}
                            />
                          </View>

                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.historyTitle, { color: colors.text }]} numberOfLines={2}>
                              {m.title || "Bez nazwy"}
                            </Text>

                            <Text style={[styles.historyMeta, { color: colors.textMuted }]}>
                              Ostatnio wykonane:{" "}
                              <Text style={{ color: colors.text }}>{formatDateTimeShort(lastDone)}</Text>
                            </Text>

                            <Text style={[styles.historyMeta, { color: colors.textMuted }]}>
                              Wykonawca: <Text style={{ color: colors.text }}>{lastBy}</Text>
                            </Text>
                          </View>

                          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>
          </View>
        </View>
      </ScrollView>

      {/* Edit modal */}
      <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Dostosuj kafelki</Text>
              <Pressable onPress={() => setEditOpen(false)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ padding: 14 }} showsVerticalScrollIndicator={false}>
              {tiles.map((t) => (
                <View
                  key={t.id}
                  style={[styles.editRow, { borderColor: colors.border, backgroundColor: `${colors.textMuted}08` }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text, fontWeight: "900" }} numberOfLines={1}>
                      {t.id === "summary"
                        ? "Podsumowanie"
                        : t.id === "mission-search"
                        ? "Wyszukaj misję"
                        : t.id === "achievements"
                        ? "Osiągnięcia"
                        : t.id === "leaderboard"
                        ? "Leaderboard"
                        : t.id === "freq"
                        ? "Najczęstsze zadania"
                        : "Trudność"}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {t.hidden ? "Ukryty" : t.wide ? "Szeroki (pełny rząd)" : "Normalny"}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Pressable onPress={() => moveTile(t.id, -1)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}>
                      <Ionicons name="chevron-up" size={18} color={colors.textMuted} />
                    </Pressable>
                    <Pressable onPress={() => moveTile(t.id, 1)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}>
                      <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                    </Pressable>

                    <Pressable onPress={() => toggleWide(t.id)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}>
                      <Ionicons name={t.wide ? "contract-outline" : "expand-outline"} size={18} color={colors.textMuted} />
                    </Pressable>

                    <Pressable onPress={() => toggleHide(t.id)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}>
                      <Ionicons name={t.hidden ? "eye-outline" : "eye-off-outline"} size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                </View>
              ))}

              <Pressable
                onPress={resetTiles}
                style={({ pressed }) => [
                  styles.resetBtn,
                  { borderColor: colors.border, backgroundColor: `${colors.textMuted}08`, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons name="refresh-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                <Text style={{ color: colors.textMuted, fontWeight: "900" }}>Reset układu</Text>
              </Pressable>
            </ScrollView>

            <View style={{ padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <Pressable
                onPress={() => setEditOpen(false)}
                style={({ pressed }) => [
                  styles.modalCloseBtn,
                  { borderColor: colors.border, backgroundColor: `${colors.textMuted}08`, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: "900" }}>Zamknij</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Mission details modal */}
      <Modal visible={detailsOpen} animationType="slide" transparent onRequestClose={() => setDetailsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Misje — szczegóły</Text>
              <Pressable onPress={() => setDetailsOpen(false)} hitSlop={10} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={{ padding: 14 }}>
              <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: `${colors.textMuted}10` }]}>
                <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  value={missionQuery}
                  onChangeText={setMissionQuery}
                  placeholder="Szukaj misji…"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.searchInput, { color: colors.text }]}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>

              <View style={{ height: 12 }} />

              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                {filteredStats.slice(0, 30).map((t) => {
                  const isActive = selectedKey === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => setSelectedKey(t.key)}
                      style={({ pressed }) => [
                        styles.searchRow,
                        {
                          borderColor: colors.border,
                          backgroundColor: isActive ? `${colors.accent}14` : `${colors.textMuted}08`,
                          opacity: pressed ? 0.9 : 1,
                          marginBottom: 8,
                        },
                      ]}
                    >
                      <View style={[styles.searchDot, { borderColor: colors.border }]}>
                        <Ionicons
                          name={t.completed > 0 ? "checkmark" : "ellipse-outline"}
                          size={14}
                          color={t.completed > 0 ? colors.accent : colors.textMuted}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.searchTitle, { color: colors.text }]} numberOfLines={1}>
                          {t.label}
                        </Text>
                        <Text style={[styles.searchMeta, { color: colors.textMuted }]} numberOfLines={1}>
                          {t.completed > 0 ? `${t.completed}× • ${formatDateTimeShort(t.lastDone)}` : "jeszcze nie wykonano"}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={{ marginTop: 12 }}>
                <Divider colors={colors} />
              </View>

              {!selected ? (
                <Text style={[styles.bodyMuted, { color: colors.textMuted, marginTop: 12 }]}>
                  Wybierz misję z listy, żeby zobaczyć: ile razy, kto i kiedy.
                </Text>
              ) : (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }} numberOfLines={2}>
                    {selected.label}
                  </Text>
                  <Text style={{ color: colors.textMuted, marginTop: 6, fontWeight: "800" }}>
                    Wykonano: <Text style={{ color: colors.text }}>{selected.completed}×</Text> • Ostatnio:{" "}
                    <Text style={{ color: colors.text }}>{formatDateTimeShort(selected.lastDone)}</Text>
                  </Text>

                  <View style={{ marginTop: 10 }}>
                    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Historia (ostatnie 12)</Text>
                    <View style={{ marginTop: 8 }}>
                      {selected.events.slice(0, 12).map((e: any) => (
                        <View
                          key={e.id}
                          style={[
                            styles.eventRow,
                            { borderColor: colors.border, backgroundColor: `${colors.textMuted}08` },
                          ]}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: colors.text, fontWeight: "900" }} numberOfLines={1}>
                              {e.userName}
                            </Text>
                            <Text style={{ color: colors.textMuted, marginTop: 2, fontSize: 11 }} numberOfLines={1}>
                              {formatDateTimeShort(e.date)}
                            </Text>
                          </View>
                          <Text style={{ color: colors.textMuted, fontWeight: "900" }}>+{e.exp}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              )}
            </View>

            <View style={{ padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
              <Pressable
                onPress={() => setDetailsOpen(false)}
                style={({ pressed }) => [
                  styles.modalCloseBtn,
                  { borderColor: colors.border, backgroundColor: `${colors.textMuted}08`, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: "900" }}>Zamknij</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ----------------------- Styles ----------------------- */

const styles = StyleSheet.create({
  hero: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    ...(Platform.OS === "ios"
      ? { shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } }
      : { elevation: 2 }),
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  heroTopNarrow: {
    flexDirection: "column",
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },

  heroBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },
  microLabel: {
    fontSize: 11,
    fontWeight: "800",
  },
  microValue: {
    fontSize: 12,
    fontWeight: "900",
  },
  microHint: {
    fontSize: 10,
    marginTop: 6,
    opacity: 0.9,
  },
  heroProgressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },

  // ✅ 3 przyciski skalują się na mobile (nie zasłaniają treści)
  heroActionsCol: {
    alignItems: "stretch",
    width: 190,
  },
  heroActionsColNarrow: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  heroActionPill: {
    height: 42,
    borderRadius: 999,
    paddingHorizontal: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  heroActionPillNarrow: {
    flexBasis: "48%",
    flexGrow: 1,
  },
  heroActionPillNarrowFull: {
    flexBasis: "100%",
    flexGrow: 1,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
  },

  primaryBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: -0.1,
  },

  card: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 22,
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? { shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }
      : { elevation: 2 }),
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },

  bodyMuted: {
    fontSize: 13,
    marginTop: 6,
  },

  // Summary tile rows
  kpiTripleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  kpiIconWrapSmall: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  kpiTripleTexts: {
    flex: 1,
    minWidth: 0,
  },
  kpiTripleLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  kpiTripleHint: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    opacity: 0.9,
  },
  kpiTripleValue: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.2,
    marginLeft: 10,
  },

  achRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  achIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  achText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "900",
  },
  memberTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  memberName: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  memberMeta: {
    fontSize: 11,
    marginTop: 2,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "900",
    marginTop: 2,
  },

  freqTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  freqLabel: {
    fontSize: 13,
    fontWeight: "800",
    flex: 1,
  },
  freqCount: {
    fontSize: 12,
    fontWeight: "900",
  },

  miniTrack: {
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 8,
  },

  diffTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  diffLabel: {
    fontSize: 13,
    fontWeight: "900",
  },
  diffMeta: {
    fontSize: 12,
    fontWeight: "800",
  },
  diffTrack: {
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  diffFill: {
    height: "100%",
    borderRadius: 999,
  },

  historyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  statusDot: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginTop: 2,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  historyMeta: {
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },

  // Search tile
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    padding: 0,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchDot: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  searchTitle: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.1,
  },
  searchMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  linkBtn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  linkBtnText: {
    fontSize: 12,
    fontWeight: "900",
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    maxHeight: "92%",
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "900",
    flex: 1,
    marginRight: 10,
  },
  modalCloseBtn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
  },

  editRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  resetBtn: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },

  eventRow: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
});

// app/stats.tsx
