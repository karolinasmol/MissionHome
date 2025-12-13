// app/editmission.tsx
import React, { useMemo, useState, useEffect, useRef } from "react";
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
import { createMission } from "../src/services/missions";
import { auth } from "../src/firebase/firebase";
import { db } from "../src/firebase/firebase.web";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useThemeColors, THEME_COLORS_MAP, type Theme } from "../src/context/ThemeContext";

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
  const d = v?.toDate?.() ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return hex;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return hex;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function withAlpha(color: string, alpha: number) {
  if (!color) return `rgba(0,0,0,${alpha})`;
  if (color.startsWith("#")) return hexToRgba(color, alpha);
  return color;
}

// --- helpers do isDark (luminancja bg) ---
function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (!(h.length === 3 || h.length === 6)) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
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

function isTheme(v: unknown): v is Theme {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(THEME_COLORS_MAP, v)
  );
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
  userId: string | null;
  isSelf: boolean;
};

/* ----------------------- COMPONENT ----------------------- */

export default function EditMissionScreen() {
  const router = useRouter();
  const { members, loading: famLoading } = useFamily();
  const params = useLocalSearchParams<{ date?: string; missionId?: string }>();

  // ✅ to działa wszędzie, ale u Ciebie potrafi się rozjechać między providerami:
  const { colors: ctxColors } = useThemeColors();

  // ✅ twarde źródło prawdy na WEB (dokładnie jak ThemeProvider zapisuje)
  const LS_THEME_KEY = "missionhome_theme";
  const [lsTheme, setLsTheme] = useState<Theme | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined") return;

    const read = () => {
      const t = window.localStorage.getItem(LS_THEME_KEY);
      if (isTheme(t)) setLsTheme(t);
      else setLsTheme(null);
    };

    read();

    // storage event nie odpala w tej samej karcie -> polling (lekki i pewny)
    const id = window.setInterval(read, 250);

    // w innych kartach zadziała też event
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_THEME_KEY) read();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // ✅ finalne kolory: jeśli web+localStorage ma theme -> używamy go, inaczej bierzemy z contextu
  const colors = useMemo(() => {
    if (lsTheme) return THEME_COLORS_MAP[lsTheme];
    return ctxColors;
  }, [lsTheme, ctxColors]);

  // ✅ isDark liczone zawsze z finalnego bg
  const isDark = useMemo(() => {
    const L = clamp01(relativeLuminance(colors.bg));
    return L < 0.42;
  }, [colors.bg]);

  const C = useMemo(() => {
    // delikatne “panele” robimy z tekstu jako overlay, żeby brały tint z tła/karty
    const surface = isDark ? withAlpha(colors.text, 0.055) : withAlpha(colors.text, 0.08);
    const inputBg = isDark ? withAlpha(colors.text, 0.07) : withAlpha(colors.text, 0.1);

    const accentSoft = withAlpha(colors.accent, 0.14);
    const placeholder = isDark ? withAlpha(colors.text, 0.35) : withAlpha(colors.text, 0.45);

    const onAccent = "#041b11";

    const disabledBg = isDark ? withAlpha(colors.text, 0.04) : withAlpha(colors.text, 0.06);
    const disabledText = isDark ? withAlpha(colors.text, 0.35) : withAlpha(colors.text, 0.45);

    return {
      surface,
      inputBg,
      accentSoft,
      placeholder,
      onAccent,
      disabledBg,
      disabledText,
    };
  }, [colors, isDark]);

  const missionId = params.missionId ? String(params.missionId) : null;

  const currentUser = auth.currentUser;
  const myUid = currentUser?.uid ?? null;
  const myDisplayName = currentUser?.displayName || "Ty";
  const myPhotoURL = currentUser?.photoURL || null;

  const initialDate = params.date ? new Date(params.date) : new Date();

  const [title, setTitle] = useState("");
  const [assignedToId, setAssignedToId] = useState<string>("self");

  const [chosenDate, setChosenDate] = useState(initialDate);
  const [inputDate, setInputDate] = useState(formatInputDate(initialDate));
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(initialDate));

  const [repeatType, setRepeatType] = useState<RepeatType>("none");
  const [difficulty, setDifficulty] = useState("easy");

  const [saving, setSaving] = useState(false);
  const [loadingMission, setLoadingMission] = useState(false);

  const [loadedMission, setLoadedMission] = useState<any>(null);

  const isWeb = Platform.OS === "web";

  // żeby nie nadpisywać formularza w trakcie edycji
  const hydratedOnce = useRef(false);

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

    // fallback chip (gdy assignedTo nie ma w members)
    const assignedToUserId = loadedMission?.assignedToUserId
      ? String(loadedMission.assignedToUserId)
      : null;

    const assignedToName = loadedMission?.assignedToName
      ? String(loadedMission.assignedToName)
      : null;

    const assignedToAvatarUrl = loadedMission?.assignedToAvatarUrl
      ? String(loadedMission.assignedToAvatarUrl)
      : null;

    if (assignedToUserId && (!myUid || assignedToUserId !== myUid)) {
      const exists = chips.some((c) => c.id === assignedToUserId);
      if (!exists) {
        chips.push({
          id: assignedToUserId,
          label: assignedToName || "Nieznany użytkownik",
          avatarUrl: assignedToAvatarUrl || null,
          level: 1,
          userId: assignedToUserId,
          isSelf: false,
        });
      }
    }

    return chips;
  }, [members, myUid, myMemberEntry, myPhotoURL, loadedMission]);

  const selected = memberChips.find((m) => m.id === assignedToId) || memberChips[0];

  /* ---------- LOAD MISSION ---------- */

  useEffect(() => {
    if (!missionId) return;
    if (hydratedOnce.current) return;

    let alive = true;

    (async () => {
      try {
        setLoadingMission(true);

        const snap = await getDoc(doc(db, "missions", missionId));
        if (!snap.exists()) {
          alert("Nie znaleziono zadania do edycji.");
          router.back();
          return;
        }

        const data = { id: snap.id, ...snap.data() } as any;
        if (!alive) return;

        setLoadedMission(data);

        const due = toSafeDate(data?.dueDate) || new Date();
        const rep = (data?.repeat?.type ?? "none") as RepeatType;
        const diff = (data?.expMode ?? "easy") as string;

        setTitle(String(data?.title ?? ""));
        setRepeatType(rep);
        setDifficulty(diff);

        setChosenDate(due);
        setInputDate(formatInputDate(due));
        setCurrentMonth(startOfMonth(due));

        const assId = data?.assignedToUserId ? String(data.assignedToUserId) : null;
        if (assId && myUid && assId === myUid) setAssignedToId("self");
        else if (assId) setAssignedToId(assId);
        else setAssignedToId("self");

        hydratedOnce.current = true;
      } catch (e) {
        console.error(e);
        alert("Błąd ładowania zadania.");
        router.back();
      } finally {
        if (alive) setLoadingMission(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [missionId, router, myUid]);

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
      alert("Musisz być zalogowany, żeby zapisać zadanie.");
      return;
    }

    const expValue = DIFFICULTY_OPTIONS.find((d) => d.type === difficulty)?.exp ?? 0;

    const assignee = selected;

    const assignedToUserId = assignee.isSelf ? myUid : assignee.userId;
    if (!assignedToUserId) {
      alert("Nie udało się ustalić osoby przypisanej do zadania.");
      return;
    }

    const assignedToName = assignee.isSelf ? myDisplayName : assignee.label;

    try {
      setSaving(true);

      if (missionId) {
        await updateDoc(doc(db, "missions", missionId), {
          title: title.trim(),
          assignedToUserId,
          assignedToName,
          assignedToAvatarUrl: assignee.avatarUrl ?? null,
          dueDate: chosenDate,
          repeat: { type: repeatType },
          expValue,
          expMode: difficulty,
          updatedAt: serverTimestamp(),
        });

        router.back();
        return;
      }

      await createMission({
        title: title.trim(),
        assignedToUserId,
        assignedToName,
        assignedByUserId: myUid,
        assignedByName: myDisplayName || "Ty",
        assignedByAvatarUrl: myPhotoURL,
        assignedToAvatarUrl: assignee.avatarUrl,
        dueDate: chosenDate,
        repeat: { type: repeatType },
        expValue,
        expMode: difficulty,
      });

      router.back();
    } catch (e) {
      console.error(e);
      alert("Błąd zapisu!");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- LOADING ---------- */

  if (famLoading || loadingMission) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  /* ---------- UI ---------- */

  const headerTitle = missionId ? "Edytuj zadanie" : "Dodaj zadanie";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: 16,
        maxWidth: 900,
        width: "100%",
        alignSelf: isWeb ? "center" : "stretch",
      }}
    >
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
        }}
      >
        {/* HEADER */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
            {headerTitle}
          </Text>
        </View>

        {/* ASSIGNED TO */}
        <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 6 }}>
          Przypisane do
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: C.surface,
            marginBottom: 12,
            gap: 12,
          }}
        >
          {selected.avatarUrl ? (
            <Image
              source={{ uri: selected.avatarUrl }}
              style={{ width: 42, height: 42, borderRadius: 999 }}
            />
          ) : (
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                backgroundColor: C.accentSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.accent, fontWeight: "700" }}>
                {selected.label?.[0] ?? "?"}
              </Text>
            </View>
          )}

          <View>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>
              {selected.label}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Poziom {selected.level}
            </Text>
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
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? C.accentSoft : "transparent",
                }}
              >
                <Text style={{ color: active ? colors.accent : colors.text, fontSize: 13 }}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* TRUDNOŚĆ */}
        <Text style={{ color: colors.textMuted, marginBottom: 6, fontSize: 13 }}>
          Trudność zadania
        </Text>

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
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? C.accentSoft : "transparent",
                }}
              >
                <Text style={{ color: active ? colors.accent : colors.text, fontSize: 13 }}>
                  {opt.label} ({opt.exp} EXP)
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* REPEAT */}
        <Text style={{ color: colors.textMuted, marginBottom: 6, fontSize: 13 }}>
          Cykliczność
        </Text>

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
                  borderColor: active ? colors.accent : colors.border,
                  backgroundColor: active ? C.accentSoft : "transparent",
                }}
              >
                <Text style={{ color: active ? colors.accent : colors.text, fontSize: 13 }}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* TITLE INPUT */}
        <Text style={{ color: colors.textMuted, marginBottom: 6, fontSize: 13 }}>
          Nazwa zadania
        </Text>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Np. Umyć naczynia"
          placeholderTextColor={C.placeholder}
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 10,
            marginBottom: 20,
            backgroundColor: C.inputBg,
            color: colors.text,
          }}
        />

        {/* DATE INPUT */}
        <Text style={{ color: colors.textMuted, marginBottom: 6, fontSize: 13 }}>
          Data (RRRR-MM-DD)
        </Text>

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
            borderColor: colors.border,
            padding: 10,
            marginBottom: 14,
            backgroundColor: C.inputBg,
            color: colors.text,
          }}
        />

        <Text style={{ color: colors.text, marginBottom: 10, fontSize: 15 }}>
          {formatDayLong(chosenDate)}
        </Text>

        {/* KALENDARZ */}
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            padding: 12,
            borderRadius: 12,
            backgroundColor: C.surface,
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
                borderColor: colors.border,
              }}
            >
              <Ionicons name="chevron-back" size={16} color={colors.text} />
            </TouchableOpacity>

            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
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
                borderColor: colors.border,
              }}
            >
              <Ionicons name="chevron-forward" size={16} color={colors.text} />
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
                  color: colors.textMuted,
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
                      backgroundColor: selectedDay ? colors.accent : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: selectedDay ? C.onAccent : colors.text,
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
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>Anuluj</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSave}
            disabled={!title.trim() || saving}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: title.trim() && !saving ? colors.accent : C.disabledBg,
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Text
              style={{
                color: title.trim() && !saving ? C.onAccent : C.disabledText,
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

// app/editmission.tsx
