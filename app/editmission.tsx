// app/editmission.tsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  SafeAreaView,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { RepeatType } from "../src/context/TasksContext";
import { useFamily } from "../src/hooks/useFamily";
import { createMission } from "../src/services/missions";
import { auth, db } from "../src/firebase/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
  limit as fsLimit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  Timestamp,
} from "firebase/firestore";

// ✅ ThemeContext (REAL)
import { useThemeColors } from "../src/context/ThemeContext";

/* ============================================================
   Helpers
============================================================ */

function startOfMonth(date: Date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(date: Date) {
  const d = new Date(date);
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
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, year, month, day] = m;
  // ✅ 12:00 żeby nie wpadać w dziury DST
  const d = new Date(Number(year), Number(month) - 1, Number(day), 12);
  return isNaN(d.getTime()) ? null : d;
}

function toSafeDate(v: any): Date | null {
  if (!v) return null;

  // Firestore Timestamp
  if (typeof v === "object" && typeof v.toDate === "function") {
    const d = v.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }

  // Date
  if (v instanceof Date) return !isNaN(v.getTime()) ? v : null;

  // string
  if (typeof v === "string") {
    const d = new Date(v);
    return !isNaN(d.getTime()) ? d : null;
  }

  return null;
}

function normalizeText(input: string) {
  const s = (input ?? "").trim().toLowerCase();
  try {
    return s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return s.replace(/\s+/g, " ").trim();
  }
}

/* ----------------------- Color helpers (jak WEB) ----------------------- */

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

/* ============================================================
   Config
============================================================ */

const DIFFICULTY_OPTIONS = [
  { type: "easy", label: "Łatwe", exp: 25 },
  { type: "medium", label: "Średnie", exp: 50 },
  { type: "hard", label: "Trudne", exp: 100 },
] as const;

type DifficultyType = (typeof DIFFICULTY_OPTIONS)[number]["type"];

const REPEAT_OPTIONS: { type: RepeatType; label: string }[] = [
  { type: "none", label: "Brak" },
  { type: "daily", label: "Codziennie" },
  { type: "weekly", label: "Co tydzień" },
  { type: "monthly", label: "Co miesiąc" },
];

type AssigneeChip = {
  id: string;
  label: string;
  avatarUrl: string | null;
  level: number;
  userId: string | null;
  isSelf: boolean;
};

function missionDocRef(id: string) {
  // ✅ jak na web (zmień jeśli masz families/{id}/missions/{id})
  return doc(db, "missions", id);
}

/* ============================================================
   MAIN SCREEN — MISSIONHOME NATIVE (WEB-LIKE)
============================================================ */

export default function EditMissionScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isPhone = width < 500;

  const params = useLocalSearchParams<{ date?: string; missionId?: string; id?: string }>();
  const missionId = params.missionId ? String(params.missionId) : params.id ? String(params.id) : null;

  const { members, loading: membersLoading } = useFamily();

  // ✅ Theme tokens z ThemeContext (jak web)
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

  // ✅ Auth state reaktywnie
  const [me, setMe] = useState(() => {
    const u = auth.currentUser;
    return {
      uid: u?.uid ?? null,
      name: u?.displayName || "Ty",
      photo: u?.photoURL || null,
    };
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setMe({
        uid: u?.uid ?? null,
        name: u?.displayName || "Ty",
        photo: u?.photoURL || null,
      });
    });
    return unsub;
  }, []);

  const myUid = me.uid;
  const myName = me.name;
  const myPhoto = me.photo;

  const initialDate = params.date ? new Date(params.date) : new Date();

  const [title, setTitle] = useState("");
  const [assignedToId, setAssignedToId] = useState<string>("self");

  const [chosenDate, setChosenDate] = useState(startOfDay(initialDate));
  const [inputDate, setInputDate] = useState(formatInputDate(initialDate));
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(initialDate));

  const [repeatType, setRepeatType] = useState<RepeatType>("none");
  const [difficulty, setDifficulty] = useState<DifficultyType>("easy");

  const [saving, setSaving] = useState(false);
  const [loadingMission, setLoadingMission] = useState(false);
  const [loadedMission, setLoadedMission] = useState<any>(null);

  const hydratedOnce = useRef(false);

  // AUTOCOMPLETE (zostawiamy, ale wizualnie pasuje do WEB)
  const [knownTitles, setKnownTitles] = useState<string[]>([]);
  const titleInputRef = useRef<TextInput>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);

  /* ============================================================
     MEMBERS — DOMOWNICY
  ============================================================ */

  const myMember = useMemo(() => {
    if (!members || !myUid) return null;
    return (
      members.find((m: any) => {
        const uid = String(m.uid || m.userId || m.id || "");
        return uid === myUid;
      }) || null
    );
  }, [members, myUid]);

  const memberChips: AssigneeChip[] = useMemo(() => {
    const arr: AssigneeChip[] = [];

    const lv = (myMember as any)?.level ?? 1;
    const avatar =
      (myMember as any)?.avatarUrl ||
      (myMember as any)?.photoURL ||
      myPhoto ||
      null;

    arr.push({
      id: "self",
      label: "Ty",
      avatarUrl: avatar,
      level: lv,
      userId: myUid,
      isSelf: true,
    });

    if (members && members.length > 0) {
      members.forEach((m: any) => {
        const uid = String(m.uid || m.userId || m.id || "");
        if (!uid) return;
        if (myUid && uid === myUid) return;

        arr.push({
          id: uid,
          label: m.displayName || m.username || m.name || "Bez nazwy",
          avatarUrl: m.avatarUrl || m.photoURL || null,
          level: m.level ?? 1,
          userId: uid,
          isSelf: false,
        });
      });
    }

    // fallback, gdy assignedTo nie ma w rodzinie (np. stary user)
    const fallbackUserId = loadedMission?.assignedToUserId
      ? String(loadedMission.assignedToUserId)
      : null;

    const fallbackName = loadedMission?.assignedToName
      ? String(loadedMission.assignedToName)
      : null;

    const fallbackAvatar = loadedMission?.assignedToAvatarUrl
      ? String(loadedMission.assignedToAvatarUrl)
      : null;

    if (fallbackUserId && (!myUid || fallbackUserId !== myUid)) {
      const exists = arr.some((x) => x.id === fallbackUserId);
      if (!exists) {
        arr.push({
          id: fallbackUserId,
          label: fallbackName || "Nieznany użytkownik",
          avatarUrl: fallbackAvatar || null,
          level: 1,
          userId: fallbackUserId,
          isSelf: false,
        });
      }
    }

    return arr;
  }, [members, loadedMission, myUid, myMember, myPhoto]);

  const selectedMember =
    memberChips.find((m) => m.id === assignedToId) || memberChips[0];

  /* ============================================================
     LOAD MISSION IF EDITING
  ============================================================ */

  useEffect(() => {
    if (!missionId) return;
    if (hydratedOnce.current) return;

    let alive = true;

    (async () => {
      try {
        setLoadingMission(true);

        const snap = await getDoc(missionDocRef(missionId));
        if (!snap.exists()) {
          Alert.alert("Nie znaleziono", "Nie znaleziono zadania do edycji.");
          router.back();
          return;
        }

        const data = { id: snap.id, ...snap.data() } as any;
        if (!alive) return;

        setLoadedMission(data);

        const due = toSafeDate(data?.dueDate) || new Date();
        const rep = (data?.repeat?.type ?? "none") as RepeatType;
        const diff = (data?.expMode ?? "easy") as DifficultyType;

        setTitle(String(data?.title ?? ""));
        setRepeatType(rep);
        setDifficulty(diff);

        const dueStart = startOfDay(due);
        setChosenDate(dueStart);
        setInputDate(formatInputDate(dueStart));
        setCurrentMonth(startOfMonth(dueStart));

        const assId = data?.assignedToUserId ? String(data.assignedToUserId) : null;

        if (assId && myUid && assId === myUid) setAssignedToId("self");
        else if (assId) setAssignedToId(assId);
        else setAssignedToId("self");

        hydratedOnce.current = true;
      } catch (e) {
        console.error(e);
        Alert.alert("Błąd", "Błąd ładowania zadania.");
        router.back();
      } finally {
        if (alive) setLoadingMission(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [missionId, router, myUid]);

  /* ============================================================
     AUTOCOMPLETE — paginacja po missions
  ============================================================ */

  useEffect(() => {
    if (!myUid) return;

    let alive = true;

    const pickTs = (data: any) => {
      const d =
        toSafeDate(data?.updatedAt) ||
        toSafeDate(data?.completedAt) ||
        toSafeDate(data?.createdAt) ||
        toSafeDate(data?.dueDate) ||
        null;
      return d ? d.getTime() : 0;
    };

    const buildTitlesFromDocs = (docs: any[]) => {
      const map = new Map<string, { title: string; count: number; last: number }>();

      docs.forEach((data) => {
        const tRaw = String(data?.title ?? "").trim();
        if (!tRaw) return;

        const key = normalizeText(tRaw);
        if (!key) return;

        const ts = pickTs(data);
        const prev = map.get(key);

        if (!prev) {
          map.set(key, { title: tRaw, count: 1, last: ts });
          return;
        }

        const nextLast = Math.max(prev.last, ts);
        const preferThis = ts >= prev.last;
        map.set(key, {
          title: preferThis ? tRaw : prev.title,
          count: prev.count + 1,
          last: nextLast,
        });
      });

      return Array.from(map.values())
        .sort((a, b) => {
          if (b.last !== a.last) return b.last - a.last;
          if (b.count !== a.count) return b.count - a.count;
          return a.title.localeCompare(b.title, "pl");
        })
        .map((x) => x.title);
    };

    const fetchPaged = async (field: string) => {
      const col = collection(db, "missions");

      const pageSize = 500;
      const maxPages = 10;
      const maxUniqueTitles = 400;

      let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
      let page = 0;

      const docsData: any[] = [];
      const uniqueSet = new Set<string>();

      while (page < maxPages) {
        const qx = lastDoc
          ? query(col, where(field, "==", myUid), fsLimit(pageSize), startAfter(lastDoc))
          : query(col, where(field, "==", myUid), fsLimit(pageSize));

        const snap = await getDocs(qx);
        if (snap.empty) break;

        snap.docs.forEach((d) => {
          const data = d.data();
          docsData.push(data);

          const t = String(data?.title ?? "").trim();
          if (t) uniqueSet.add(normalizeText(t));
        });

        lastDoc = snap.docs[snap.docs.length - 1];
        page += 1;

        if (uniqueSet.size >= maxUniqueTitles) break;
        if (snap.size < pageSize) break;
      }

      return docsData;
    };

    (async () => {
      try {
        const [toDocs, byDocs] = await Promise.all([
          fetchPaged("assignedToUserId"),
          fetchPaged("assignedByUserId"),
        ]);

        const merged = [...toDocs, ...byDocs];
        if (!alive) return;

        setKnownTitles(buildTitlesFromDocs(merged));
      } catch (e) {
        console.warn("Autocomplete: pobieranie tytułów nie wyszło", e);
        if (!alive) return;
        setKnownTitles([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [myUid]);

  const titleSuggestions = useMemo(() => {
    const q = normalizeText(title);
    if (!q || q.length < 2) return [];

    const starts: string[] = [];
    const contains: string[] = [];

    for (const t of knownTitles) {
      const nt = normalizeText(t);
      if (!nt) continue;
      if (nt === q) continue;

      if (nt.startsWith(q)) starts.push(t);
      else if (nt.includes(q)) contains.push(t);

      if (starts.length >= 8) break;
    }

    return Array.from(new Set([...starts, ...contains])).slice(0, 8);
  }, [title, knownTitles]);

  const showSuggestions =
    suggestOpen && titleSuggestions.length > 0 && normalizeText(title).length >= 2;

  /* ============================================================
     CALENDAR LOGIC
  ============================================================ */

  const daysGrid = useMemo(() => {
    const arr: (Date | null)[] = [];
    const first = startOfMonth(currentMonth);
    const weekday = first.getDay();
    const offset = weekday === 0 ? 6 : weekday - 1;

    for (let i = 0; i < offset; i++) arr.push(null);

    const last = new Date(currentMonth);
    last.setMonth(last.getMonth() + 1);
    last.setDate(0);
    const total = last.getDate();

    for (let d = 1; d <= total; d++) {
      const dt = new Date(currentMonth);
      dt.setDate(d);
      arr.push(startOfDay(dt));
    }
    return arr;
  }, [currentMonth]);

  /* ============================================================
     SAVE
  ============================================================ */

  const handleSave = async () => {
    if (!title.trim() || saving) return;

    if (!myUid) {
      Alert.alert("Brak dostępu", "Musisz być zalogowany, żeby edytować zadanie.");
      return;
    }

    const expValue = DIFFICULTY_OPTIONS.find((d) => d.type === difficulty)?.exp ?? 0;

    const ass = selectedMember;
    const assignedToUserId = ass.isSelf ? myUid : ass.userId;
    if (!assignedToUserId) {
      Alert.alert("Błąd", "Nie udało się ustalić osoby przypisanej do zadania.");
      return;
    }
    const assignedToName = ass.isSelf ? myName : ass.label;

    try {
      setSaving(true);

      // ✅ EDIT (jak WEB)
      if (missionId) {
        await updateDoc(missionDocRef(missionId), {
          title: title.trim(),
          dueDate: Timestamp.fromDate(chosenDate),

          repeat: { type: repeatType },

          expMode: difficulty,
          expValue,

          assignedToUserId,
          assignedToName,
          assignedToAvatarUrl: ass.avatarUrl ?? null,

          // ✅ tak jak web: aktualizujemy też "assignedBy" przy edycji
          assignedByUserId: myUid,
          assignedByName: myName || "Ty",
          assignedByAvatarUrl: myPhoto ?? null,

          updatedAt: serverTimestamp(),
        });

        router.back();
        return;
      }

      // ✅ CREATE (zostawiamy przez serwis)
      await createMission({
        title: title.trim(),
        assignedToUserId,
        assignedToName,
        assignedByUserId: myUid,
        assignedByName: myName,
        assignedByAvatarUrl: myPhoto,
        assignedToAvatarUrl: ass.avatarUrl,
        dueDate: chosenDate,
        repeat: { type: repeatType },
        expValue,
        expMode: difficulty,
      });

      router.back();
    } catch (e) {
      console.error(e);
      Alert.alert("Błąd", "Błąd zapisu!");
    } finally {
      setSaving(false);
    }
  };

  /* ============================================================
     LOADING
  ============================================================ */

  if (loadingMission || membersLoading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: C.pageBg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={{ color: C.muted, marginTop: 10 }}>
          {membersLoading ? "Wczytywanie rodziny..." : "Wczytywanie zadania..."}
        </Text>
      </SafeAreaView>
    );
  }

  /* ============================================================
     UI
  ============================================================ */

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.pageBg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 40,
            width: "100%",
            maxWidth: 900,
            alignSelf: "center",
          }}
        >
          {/* HEADER */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
              <Ionicons name="chevron-back" size={22} color={C.text} />
            </TouchableOpacity>

            <Text style={{ color: C.text, fontSize: 18, fontWeight: "700" }}>
              {missionId ? "Edytuj zadanie" : "Nowe zadanie"}
            </Text>
          </View>

          {/* MAIN CARD */}
          <View
            style={{
              backgroundColor: C.cardBg,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: C.border,
              padding: isPhone ? 14 : 16,
            }}
          >
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
              }}
            >
              {selectedMember.avatarUrl ? (
                <Image
                  source={{ uri: selectedMember.avatarUrl }}
                  style={{ width: 42, height: 42, borderRadius: 999, marginRight: 12 }}
                />
              ) : (
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 999,
                    backgroundColor: C.primaryAlpha2,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Text style={{ color: C.primary, fontWeight: "700" }}>
                    {selectedMember.label?.[0] ?? "?"}
                  </Text>
                </View>
              )}

              <View>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: "700" }}>
                  {selectedMember.label}
                </Text>
                <Text style={{ color: C.subtle, fontSize: 12 }}>
                  Poziom {selectedMember.level}
                </Text>
              </View>
            </View>

            {/* MEMBER CHIPS */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 20 }}>
              {memberChips.map((m) => {
                const active = m.id === selectedMember.id;
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
                      marginRight: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: active ? C.primary : C.text, fontSize: 13 }}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* DIFFICULTY */}
            <Text style={{ color: C.muted, marginBottom: 6, fontSize: 13 }}>
              Trudność zadania
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 20 }}>
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
                      marginRight: 8,
                      marginBottom: 8,
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
            <Text style={{ color: C.muted, marginBottom: 6, fontSize: 13 }}>
              Cykliczność
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 20 }}>
              {REPEAT_OPTIONS.map((r) => {
                const active = repeatType === r.type;
                return (
                  <TouchableOpacity
                    key={r.type}
                    onPress={() => setRepeatType(r.type)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? C.primary : C.borderStrong,
                      backgroundColor: active ? C.primaryAlpha : "transparent",
                      marginRight: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: active ? C.primary : C.text, fontSize: 13 }}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* TITLE INPUT */}
            <Text style={{ color: C.muted, marginBottom: 6, fontSize: 13 }}>
              Nazwa zadania
            </Text>

            <TextInput
              ref={titleInputRef}
              value={title}
              onChangeText={(t) => {
                setTitle(t);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => {
                // dajemy czas na tap w sugestię
                setTimeout(() => setSuggestOpen(false), 120);
              }}
              placeholder="Np. Umyć naczynia"
              placeholderTextColor={C.placeholder}
              style={{
                borderRadius: 10,
                borderWidth: 1,
                borderColor: C.inputBorder,
                padding: 10,
                marginBottom: showSuggestions ? 8 : 20,
                backgroundColor: C.inputBg,
                color: C.text,
              }}
            />

            {/* SUGGESTIONS */}
            {showSuggestions && (
              <View
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: C.borderStrong,
                  backgroundColor: C.inputBg,
                  overflow: "hidden",
                  marginBottom: 20,
                }}
              >
                {titleSuggestions.map((s, idx) => (
                  <TouchableOpacity
                    key={`${s}-${idx}`}
                    onPress={() => {
                      setTitle(s);
                      setSuggestOpen(false);
                      titleInputRef.current?.blur();
                    }}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderTopWidth: idx === 0 ? 0 : 1,
                      borderTopColor: C.border,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons name="time-outline" size={16} color={C.muted} />
                    <Text style={{ color: C.text, fontSize: 14, marginLeft: 10 }}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* DATE INPUT */}
            <Text style={{ color: C.muted, marginBottom: 6, fontSize: 13 }}>
              Data (RRRR-MM-DD)
            </Text>

            <TextInput
              value={inputDate}
              onChangeText={(t) => {
                setInputDate(t);
                const valid = parseInputDate(t);
                if (valid) {
                  const d0 = startOfDay(valid);
                  setChosenDate(d0);
                  setCurrentMonth(startOfMonth(d0));
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

            <Text style={{ color: C.text, marginBottom: 10, fontSize: 15 }}>
              {formatDayLong(chosenDate)}
            </Text>

            {/* CALENDAR */}
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
                  {currentMonth.toLocaleDateString("pl-PL", {
                    month: "long",
                    year: "numeric",
                  })}
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
                {daysGrid.map((d, index) => {
                  if (!d) return <View key={index} style={{ width: "14.28%", height: 34 }} />;

                  const selected = d.toDateString() === chosenDate.toDateString();

                  return (
                    <TouchableOpacity
                      key={index}
                      onPress={() => {
                        const d0 = startOfDay(d);
                        setChosenDate(d0);
                        setInputDate(formatInputDate(d0));
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
                          backgroundColor: selected ? C.primary : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: selected ? C.onPrimary : C.text,
                            fontSize: 13,
                            fontWeight: selected ? "700" : "400",
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

            {/* ACTIONS */}
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: C.border,
                  marginRight: 10,
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
                  {saving ? "Zapisywanie..." : "Zapisz zmiany"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
