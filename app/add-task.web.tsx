// app/add-task.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { RepeatType } from "../src/context/TasksContext";
import { useFamily } from "../src/hooks/useFamily";
import { useMissions } from "../src/hooks/useMissions";
import { createMission } from "../src/services/missions";
import { auth } from "../src/firebase/firebase";

// ✅ ThemeContext (REAL)
import { useThemeColors } from "../src/context/ThemeContext";

/* ----------------------- Helpers ----------------------- */

function startOfMonth(date: Date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDayLong(date: Date) {
  return date.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatInputDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseInputDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const d = new Date(Number(year), Number(month) - 1, Number(day), 12);
  return isNaN(d.getTime()) ? null : d;
}

function toSafeDate(v: any): Date | null {
  if (!v) return null;
  try {
    if (v instanceof Date) return v;
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

/* ----------------------- Color helpers ----------------------- */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (!(h.length === 3 || h.length === 6)) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function withAlpha(color: string, alpha: number) {
  const a = Math.max(0, Math.min(1, alpha));

  const rgbaMatch = color
    .trim()
    .match(
      /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)$/i
    );

  if (rgbaMatch) {
    const r = Number(rgbaMatch[1]);
    const g = Number(rgbaMatch[2]);
    const b = Number(rgbaMatch[3]);
    return `rgba(${r},${g},${b},${a})`;
  }

  if (color.trim().startsWith("#")) {
    const rgb = hexToRgb(color);
    if (!rgb) return color;
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  }

  return color;
}

function relativeLuminance(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const srgb = [rgb.r, rgb.g, rgb.b].map((v) => v / 255);
  const lin = srgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function onColorForHex(hexOrRgba: string) {
  if (!hexOrRgba.trim().startsWith("#")) return "#ffffff";
  const L = relativeLuminance(hexOrRgba);
  return L > 0.6 ? "#0b1020" : "#ffffff";
}

/* ----------------------- Difficulty ----------------------- */

const DIFFICULTY_OPTIONS = [
  { type: "easy", label: "Łatwe", exp: 25 },
  { type: "medium", label: "Średnie", exp: 50 },
  { type: "hard", label: "Trudne", exp: 100 },
];

/* ----------------------- Repeat options ----------------------- */

const REPEAT_OPTIONS: { type: RepeatType; label: string }[] = [
  { type: "none", label: "Brak" },
  { type: "daily", label: "Codziennie" },
  { type: "weekly", label: "Co tydzień" },
  { type: "monthly", label: "Co miesiąc" },
];

/* ----------------------- Types ----------------------- */

type AssigneeChip = {
  id: string; // "self" albo uid
  label: string;
  avatarUrl: string | null;
  level: number;
  userId: string | null; // prawdziwe uid (dla self też)
  isSelf: boolean;
};

type TitleSuggestion = {
  key: string;
  label: string;
  count: number;
  last: Date | null;
};

/* ----------------------- COMPONENT ----------------------- */

export default function AddTaskScreen() {
  const router = useRouter();

  // ✅ bierzemy też family (żeby jawnie przekazać familyId do createMission)
  const { family, members, loading: famLoading } = useFamily();

  const { missions } = useMissions();
  const params = useLocalSearchParams<{ date?: string }>();

  const { colors, isDark } = useThemeColors();

  const C = useMemo(() => {
    const pageBg = colors?.bg ?? "#141b26";
    const cardBg = colors?.card ?? "#1f2937";
    const text = colors?.text ?? "#e6edf3";
    const muted = colors?.textMuted ?? "#a3b0c2";
    const primary = colors?.accent ?? "#1dd4c7";
    const border = colors?.border ?? "rgba(255,255,255,0.12)";

    return {
      pageBg,
      cardBg,

      text,
      muted,
      subtle: withAlpha(text, isDark ? 0.65 : 0.7),
      placeholder: withAlpha(text, isDark ? 0.45 : 0.5),

      border,
      borderStrong: withAlpha(text, isDark ? 0.28 : 0.22),
      inputBorder: withAlpha(text, isDark ? 0.22 : 0.18),

      inputBg: isDark ? withAlpha("#ffffff", 0.03) : withAlpha("#000000", 0.04),

      primary,
      onPrimary: onColorForHex(primary),

      primaryAlpha: withAlpha(primary, 0.12),
      primaryAlpha2: withAlpha(primary, 0.22),

      disabledBg: isDark ? withAlpha("#ffffff", 0.08) : withAlpha("#000000", 0.08),
      disabledText: withAlpha(text, 0.45),
    };
  }, [colors, isDark]);

  const currentUser = auth.currentUser;
  const myUid = currentUser?.uid ?? null;
  const myDisplayName = currentUser?.displayName || "Ty";
  const myPhotoURL = currentUser?.photoURL || null;

  // ✅ familyId (null jeśli brak)
  const familyId = useMemo(() => {
    const fid =
      (family as any)?.id ??
      (family as any)?.familyId ??
      (family as any)?.fid ??
      null;
    return fid ? String(fid) : null;
  }, [family]);

  const initialDate = params.date ? new Date(params.date) : new Date();

  const [title, setTitle] = useState("");
  const [assignedToId, setAssignedToId] = useState<string>("self");

  const [chosenDate, setChosenDate] = useState(initialDate);
  const [inputDate, setInputDate] = useState(formatInputDate(initialDate));
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(initialDate));

  const [repeatType, setRepeatType] = useState<RepeatType>("none");
  const [difficulty, setDifficulty] = useState("easy");

  const [saving, setSaving] = useState(false);

  // ✅ tylko dropdown podpowiedzi (gdy użytkownik pisze)
  const [titleFocused, setTitleFocused] = useState(false);

  const isWeb = Platform.OS === "web";

  /* ---------- LISTA DOMOWNIKÓW ---------- */

  const myMemberEntry = useMemo(() => {
    if (!members || !myUid) return null;
    return (
      members.find((m: any) => {
        const uid = String(m.uid || m.userId || m.id || "");
        return uid === myUid;
      }) || null
    );
  }, [members, myUid]);

  const memberChips: AssigneeChip[] = useMemo(() => {
    const chips: AssigneeChip[] = [];

    const myLevel = (myMemberEntry as any)?.level ?? 1;
    const myAvatar =
      (myMemberEntry as any)?.avatarUrl ||
      (myMemberEntry as any)?.photoURL ||
      myPhotoURL ||
      null;

    chips.push({
      id: "self",
      label: "Ty",
      avatarUrl: myAvatar,
      level: myLevel,
      userId: myUid,
      isSelf: true,
    });

    if (members && members.length > 0) {
      members.forEach((m: any) => {
        const uid = String(m.uid || m.userId || m.id || "");
        if (!uid) return;
        if (myUid && uid === myUid) return;

        const label = m.displayName || m.username || m.name || "Bez nazwy";
        const avatarUrl = m.avatarUrl || m.photoURL || null;
        const level = m.level ?? 1;

        chips.push({
          id: uid,
          label,
          avatarUrl,
          level,
          userId: uid,
          isSelf: false,
        });
      });
    }

    return chips;
  }, [members, myUid, myMemberEntry, myPhotoURL]);

  const selected =
    memberChips.find((m) => m.id === assignedToId) || memberChips[0];

  /* ---------- PODPOWIEDZI NAZW ZADAŃ (z historii) ---------- */

  const allTitleSuggestions: TitleSuggestion[] = useMemo(() => {
    const map = new Map<string, TitleSuggestion>();

    (missions || []).forEach((m: any) => {
      const raw = (m?.title || "").trim();
      if (!raw) return;

      const key = raw.toLowerCase();

      const row = map.get(key) || {
        key,
        label: raw,
        count: 0,
        last: null as Date | null,
      };

      row.count += 1;

      const candidateDates = [
        toSafeDate(m?.completedAt),
        toSafeDate(m?.dueDate),
        toSafeDate(m?.createdAt),
      ].filter(Boolean) as Date[];

      const newest = candidateDates.reduce<Date | null>((acc, d) => {
        if (!acc) return d;
        return d.getTime() > acc.getTime() ? d : acc;
      }, row.last);

      row.last = newest ?? row.last;
      map.set(key, row);
    });

    const out = Array.from(map.values());

    // sort domyślny: najczęściej + najnowsze
    out.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const ad = a.last?.getTime() ?? 0;
      const bd = b.last?.getTime() ?? 0;
      if (bd !== ad) return bd - ad;
      return a.label.localeCompare(b.label, "pl");
    });

    return out;
  }, [missions]);

  const filteredSuggestions = useMemo(() => {
    const q = title.trim().toLowerCase();
    if (!q) return [];

    const res = allTitleSuggestions
      .filter((s) => s.label.toLowerCase().includes(q))
      .slice(0, 8);

    // lekkie “smart sort”: startsWith wyżej
    res.sort((a, b) => {
      const aStarts = a.label.toLowerCase().startsWith(q) ? 1 : 0;
      const bStarts = b.label.toLowerCase().startsWith(q) ? 1 : 0;
      if (bStarts !== aStarts) return bStarts - aStarts;
      if (b.count !== a.count) return b.count - a.count;
      const ad = a.last?.getTime() ?? 0;
      const bd = b.last?.getTime() ?? 0;
      if (bd !== ad) return bd - ad;
      return a.label.localeCompare(b.label, "pl");
    });

    return res;
  }, [allTitleSuggestions, title]);

  const showSuggestions =
    titleFocused && title.trim().length > 0 && filteredSuggestions.length > 0;

  /* ---------- KALENDARZ ---------- */

  const daysGrid = useMemo(() => {
    const days: (Date | null)[] = [];
    const firstDay = new Date(currentMonth);
    const weekday = firstDay.getDay();

    const offset = weekday === 0 ? 6 : weekday - 1;
    for (let i = 0; i < offset; i++) days.push(null);

    const nextMonth = new Date(currentMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(0);
    const lastDay = nextMonth.getDate();

    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(currentMonth);
      date.setDate(d);
      days.push(date);
    }

    return days;
  }, [currentMonth]);

  /* ---------- ZAPIS ---------- */

  const handleSave = async () => {
    if (!title.trim() || saving) return;

    if (!myUid) {
      alert("Musisz być zalogowany, żeby dodać zadanie.");
      return;
    }

    const expValue =
      DIFFICULTY_OPTIONS.find((d) => d.type === difficulty)?.exp ?? 0;

    const assignee = selected;

    const assignedToUserId = assignee.isSelf ? myUid : assignee.userId;
    if (!assignedToUserId) {
      alert("Nie udało się ustalić osoby przypisanej do zadania.");
      return;
    }

    const assignedToName = assignee.isSelf ? myDisplayName : assignee.label;

    const assignedByUserId = myUid;
    const assignedByName = myDisplayName || "Ty";

    // ✅ jawnie ustawiamy createdBy (często to jest warunek w rules/odczytach)
    const createdByUserId = myUid;
    const createdByName = myDisplayName || "Ty";

    try {
      setSaving(true);

      await createMission({
        title: title.trim(),

        // ✅ familyId jawnie (null jeśli brak)
        familyId: familyId ?? null,

        // ✅ creator/assigner/assignee – spójne z Twoimi dokumentami w bazie
        createdByUserId,
        createdByName,
        createdByAvatarUrl: myPhotoURL,

        assignedToUserId,
        assignedToName,

        assignedByUserId,
        assignedByName,

        assignedByAvatarUrl: myPhotoURL,
        assignedToAvatarUrl: assignee.avatarUrl,

        dueDate: chosenDate,
        repeat: { type: repeatType },
        expValue,
        expMode: difficulty,
      });

      router.back();
    } catch (e: any) {
      console.error("createMission error:", e?.code, e?.message, e);
      alert(
        e?.code === "permission-denied"
          ? "Rules blokują zapis (permission-denied)"
          : "Błąd zapisu!"
      );
    } finally {
      setSaving(false);
    }
  };

  /* ---------- LOADING ---------- */

  if (famLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.pageBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  /* ---------- UI ---------- */

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.pageBg }}
      contentContainerStyle={{
        padding: 16,
        maxWidth: 900,
        width: "100%",
        alignSelf: isWeb ? "center" : "stretch",
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View
        style={{
          backgroundColor: C.cardBg,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: C.border,
          padding: 16,
        }}
      >
        {/* HEADER */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
            <Ionicons name="chevron-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: "700" }}>
            Dodaj zadanie
          </Text>
        </View>

        {/* ASSIGNED TO */}
        <Text style={{ color: C.muted, fontSize: 13, marginBottom: 6 }}>
          Przypisane do
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.borderStrong,
            backgroundColor: C.inputBg,
            marginBottom: 12,
            gap: 12,
          }}
        >
          {selected.avatarUrl ? (
            <Image source={{ uri: selected.avatarUrl }} style={{ width: 42, height: 42, borderRadius: 999 }} />
          ) : (
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                backgroundColor: C.primaryAlpha2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: C.primary, fontWeight: "700" }}>
                {selected.label?.[0] ?? "?"}
              </Text>
            </View>
          )}

          <View>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: "700" }}>
              {selected.label}
            </Text>
            <Text style={{ color: C.subtle, fontSize: 12 }}>Poziom {selected.level}</Text>
          </View>
        </View>

        {/* MEMBER CHIPS */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {memberChips.map((m) => {
            const active = m.id === selected.id;
            return (
              <TouchableOpacity
                key={m.id}
                onPress={() => setAssignedToId(m.id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? C.primary : C.borderStrong,
                  backgroundColor: active ? C.primaryAlpha : "transparent",
                }}
              >
                <Text style={{ color: active ? C.primary : C.text, fontSize: 13 }}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* TRUDNOŚĆ */}
        <Text style={{ color: C.muted, marginBottom: 6, fontSize: 13 }}>Trudność zadania</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {DIFFICULTY_OPTIONS.map((opt) => {
            const active = difficulty === opt.type;
            return (
              <TouchableOpacity
                key={opt.type}
                onPress={() => setDifficulty(opt.type)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? C.primary : C.borderStrong,
                  backgroundColor: active ? C.primaryAlpha : "transparent",
                }}
              >
                <Text style={{ color: active ? C.primary : C.text, fontSize: 13 }}>
                  {opt.label} ({opt.exp} EXP)
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* REPEAT */}
        <Text style={{ color: C.muted, marginBottom: 6, fontSize: 13 }}>Cykliczność</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {REPEAT_OPTIONS.map((o) => {
            const active = o.type === repeatType;
            return (
              <TouchableOpacity
                key={o.type}
                onPress={() => setRepeatType(o.type)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? C.primary : C.borderStrong,
                  backgroundColor: active ? C.primaryAlpha : "transparent",
                }}
              >
                <Text style={{ color: active ? C.primary : C.text, fontSize: 13 }}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* TITLE INPUT */}
        <Text style={{ color: C.muted, marginBottom: 6, fontSize: 13 }}>Nazwa zadania</Text>

        <View style={{ position: "relative", marginBottom: 20 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Np. Umyć naczynia"
            placeholderTextColor={C.placeholder}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => {
              setTimeout(() => setTitleFocused(false), 120);
            }}
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: C.inputBorder,
              padding: 10,
              backgroundColor: C.inputBg,
              color: C.text,
            }}
          />

          {/* ✅ Dropdown podpowiedzi – tylko gdy użytkownik pisze */}
          {showSuggestions && (
            <View
              style={{
                marginTop: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: C.borderStrong,
                backgroundColor: C.cardBg,
                overflow: "hidden",
              }}
            >
              {filteredSuggestions.map((s) => {
                const lastLabel = s.last
                  ? s.last.toLocaleDateString("pl-PL", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })
                  : null;

                return (
                  <TouchableOpacity
                    key={s.key}
                    onPress={() => {
                      setTitle(s.label);
                      setTitleFocused(false);
                    }}
                    activeOpacity={0.85}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderTopWidth: 1,
                      borderTopColor: withAlpha(C.borderStrong, 0.7),
                    }}
                  >
                    <Text style={{ color: C.text, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                      {s.label}
                    </Text>
                    <Text style={{ color: C.subtle, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {s.count}×{lastLabel ? ` • ostatnio: ${lastLabel}` : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* DATE INPUT */}
        <Text style={{ color: C.muted, marginBottom: 6, fontSize: 13 }}>Data (RRRR-MM-DD)</Text>

        <TextInput
          value={inputDate}
          onChangeText={(t) => {
            setInputDate(t);
            const valid = parseInputDate(t);
            if (valid) {
              setChosenDate(valid);
              setCurrentMonth(startOfMonth(valid));
            }
          }}
          placeholder="2025-01-01"
          placeholderTextColor={C.placeholder}
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: C.inputBorder,
            padding: 10,
            marginBottom: 14,
            backgroundColor: C.inputBg,
            color: C.text,
          }}
        />

        <Text style={{ color: C.text, marginBottom: 10, fontSize: 15 }}>{formatDayLong(chosenDate)}</Text>

        {/* KALENDARZ */}
        <View
          style={{
            borderWidth: 1,
            borderColor: C.borderStrong,
            padding: 12,
            borderRadius: 12,
            backgroundColor: C.inputBg,
            marginBottom: 24,
          }}
        >
          {/* Month Navigation */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 8,
              alignItems: "center",
            }}
          >
            <TouchableOpacity
              onPress={() =>
                setCurrentMonth((prev) => {
                  const d = new Date(prev);
                  d.setMonth(d.getMonth() - 1);
                  return startOfMonth(d);
                })
              }
              style={{
                padding: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: C.borderStrong,
              }}
            >
              <Ionicons name="chevron-back" size={16} color={C.text} />
            </TouchableOpacity>

            <Text style={{ color: C.text, fontSize: 14, fontWeight: "600" }}>
              {currentMonth.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })}
            </Text>

            <TouchableOpacity
              onPress={() =>
                setCurrentMonth((prev) => {
                  const d = new Date(prev);
                  d.setMonth(d.getMonth() + 1);
                  return startOfMonth(d);
                })
              }
              style={{
                padding: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: C.borderStrong,
              }}
            >
              <Ionicons name="chevron-forward" size={16} color={C.text} />
            </TouchableOpacity>
          </View>

          {/* Week labels */}
          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            {["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].map((d) => (
              <Text
                key={d}
                style={{
                  flex: 1,
                  textAlign: "center",
                  color: C.placeholder,
                  fontSize: 11,
                }}
              >
                {d}
              </Text>
            ))}
          </View>

          {/* Days Grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {daysGrid.map((d, i) => {
              if (!d) return <View key={i} style={{ width: "14.28%", height: 34 }} />;

              const selectedDay = d.toDateString() === chosenDate.toDateString();

              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => {
                    setChosenDate(d);
                    setInputDate(formatInputDate(d));
                  }}
                  style={{
                    width: "14.28%",
                    height: 34,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      backgroundColor: selectedDay ? C.primary : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: selectedDay ? C.onPrimary : C.text,
                        fontSize: 13,
                        fontWeight: selectedDay ? "700" : "400",
                      }}
                    >
                      {d.getDate()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* SAVE BUTTONS */}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: C.border,
            }}
          >
            <Text style={{ color: C.muted, fontSize: 14 }}>Anuluj</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSave}
            disabled={!title.trim() || saving}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: title.trim() && !saving ? C.primary : C.disabledBg,
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Text
              style={{
                color: title.trim() && !saving ? C.onPrimary : C.disabledText,
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              {saving ? "Zapisywanie..." : "Zapisz"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// app/add-task.tsx
