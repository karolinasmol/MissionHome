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
} from "firebase/firestore";

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
  const d = new Date(Number(year), Number(month) - 1, Number(day), 12);
  return isNaN(d.getTime()) ? null : d;
}

function toSafeDate(v: any): Date | null {
  if (!v) return null;
  const d = v?.toDate?.() ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
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

/* ============================================================
   Config
============================================================ */

const DIFFICULTY_OPTIONS = [
  { type: "easy", label: "Łatwe", exp: 25 },
  { type: "medium", label: "Średnie", exp: 50 },
  { type: "hard", label: "Trudne", exp: 100 },
];

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

/* ============================================================
   MAIN SCREEN — PREMIUM MISSIONHOME NATIVE
============================================================ */

export default function EditMissionScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isPhone = width < 500;

  const params = useLocalSearchParams<{ date?: string; missionId?: string }>();
  const missionId = params.missionId ? String(params.missionId) : null;

  const { members, loading: membersLoading } = useFamily();

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
  const [difficulty, setDifficulty] = useState("easy");

  const [saving, setSaving] = useState(false);
  const [loadingMission, setLoadingMission] = useState(false);
  const [loadedMission, setLoadedMission] = useState<any>(null);

  const hydratedOnce = useRef(false);

  // AUTOCOMPLETE
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
        const snap = await getDoc(doc(db, "missions", missionId));
        if (!snap.exists()) {
          alert("Nie znaleziono zadania.");
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

        const dueStart = startOfDay(due);
        setChosenDate(dueStart);
        setInputDate(formatInputDate(dueStart));
        setCurrentMonth(startOfMonth(dueStart));

        const assId = data?.assignedToUserId
          ? String(data.assignedToUserId)
          : null;

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

  /* ============================================================
     AUTOCOMPLETE — paginacja po missions, żeby nie uciąć tytułów
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
        const preferThis = ts >= prev.last; // kanon = najnowsza pisownia
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
      const maxPages = 10; // max 5000 dokumentów na pole
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
        // bierzemy oba przypadki: jesteś wykonawcą + twórcą (żeby objąć też misje dla kogoś)
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

    const out = Array.from(new Set([...starts, ...contains])).slice(0, 8);
    return out;
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
     SAVE MISSION
  ============================================================ */

  const handleSave = async () => {
    if (!title.trim() || saving) return;

    if (!myUid) {
      alert("Musisz być zalogowany.");
      return;
    }

    const expValue =
      DIFFICULTY_OPTIONS.find((d) => d.type === difficulty)?.exp ?? 0;

    const ass = selectedMember;
    const assignedToUserId = ass.isSelf ? myUid : ass.userId;
    if (!assignedToUserId) {
      alert("Brak osoby przypisanej.");
      return;
    }
    const assignedToName = ass.isSelf ? myName : ass.label;

    try {
      setSaving(true);

      if (missionId) {
        await updateDoc(doc(db, "missions", missionId), {
          title: title.trim(),
          assignedToUserId,
          assignedToName,
          assignedToAvatarUrl: ass.avatarUrl ?? null,
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
      alert("Błąd zapisu!");
    } finally {
      setSaving(false);
    }
  };

  /* ============================================================
     LOADING STATES
  ============================================================ */

  if (loadingMission || membersLoading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#020617",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#22d3ee" />
      </SafeAreaView>
    );
  }

  /* ============================================================
     UI — PREMIUM MISSIONHOME LAYOUT
  ============================================================ */

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#020617" }}>
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
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
            <Ionicons name="chevron-back" size={24} color="#e5e7eb" />
          </TouchableOpacity>

          <Text
            style={{
              color: "#e5e7eb",
              fontSize: 22,
              fontWeight: "800",
            }}
          >
            {missionId ? "Edytuj zadanie" : "Nowe zadanie"}
          </Text>
        </View>

        {/* MAIN CARD */}
        <View
          style={{
            backgroundColor: "#0f172a",
            borderWidth: 1,
            borderColor: "rgba(75,85,99,0.4)",
            padding: isPhone ? 14 : 18,
            borderRadius: 18,
          }}
        >
          {/* ASSIGNEE */}
          <Text style={{ color: "#94a3b8", marginBottom: 6, fontSize: 13 }}>
            Przypisane do
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(75,85,99,0.7)",
              backgroundColor: "#020617",
              marginBottom: 12,
              gap: 12,
            }}
          >
            {selectedMember.avatarUrl ? (
              <Image
                source={{ uri: selectedMember.avatarUrl }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                }}
              />
            ) : (
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  backgroundColor: "#22d3ee33",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: "#22d3ee",
                    fontWeight: "700",
                    fontSize: 18,
                  }}
                >
                  {selectedMember.label?.[0] ?? "?"}
                </Text>
              </View>
            )}

            <View>
              <Text
                style={{
                  color: "#e5e7eb",
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                {selectedMember.label}
              </Text>
              <Text style={{ color: "#64748b", fontSize: 12 }}>
                Poziom {selectedMember.level}
              </Text>
            </View>
          </View>

          {/* MEMBER SELECTOR */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 20,
            }}
          >
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
                    borderColor: active ? "#22d3ee" : "rgba(75,85,99,0.7)",
                    backgroundColor: active ? "#22d3ee22" : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: active ? "#22d3ee" : "#e5e7eb",
                      fontSize: 13,
                    }}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* DIFFICULTY */}
          <Text style={{ color: "#94a3b8", marginBottom: 6, fontSize: 13 }}>
            Trudność zadania
          </Text>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 20,
            }}
          >
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
                    borderColor: active ? "#22d3ee" : "rgba(75,85,99,0.7)",
                    backgroundColor: active ? "#22d3ee22" : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: active ? "#22d3ee" : "#e5e7eb",
                      fontSize: 13,
                    }}
                  >
                    {opt.label} ({opt.exp} EXP)
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* REPEAT */}
          <Text style={{ color: "#94a3b8", marginBottom: 6, fontSize: 13 }}>
            Powtarzalność
          </Text>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 20,
            }}
          >
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
                    borderColor: active ? "#22d3ee" : "rgba(75,85,99,0.7)",
                    backgroundColor: active ? "#22d3ee22" : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: active ? "#22d3ee" : "#e5e7eb",
                      fontSize: 13,
                    }}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* TITLE INPUT */}
          <Text style={{ color: "#94a3b8", marginBottom: 6, fontSize: 13 }}>
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
              // dajemy czas na ensure klik w sugestię
              setTimeout(() => setSuggestOpen(false), 120);
            }}
            placeholder="Np. Umyć naczynia"
            placeholderTextColor="#64748b"
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "rgba(75,85,99,0.7)",
              padding: 12,
              marginBottom: showSuggestions ? 8 : 20,
              backgroundColor: "#020617",
              color: "#f1f5f9",
              fontSize: 15,
            }}
          />

          {/* SUGGESTIONS */}
          {showSuggestions && (
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "rgba(75,85,99,0.7)",
                backgroundColor: "#020617",
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
                    borderTopColor: "rgba(75,85,99,0.35)",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Ionicons name="time-outline" size={16} color="#94a3b8" />
                  <Text style={{ color: "#e5e7eb", fontSize: 14 }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* DATE INPUT */}
          <Text style={{ color: "#94a3b8", marginBottom: 6, fontSize: 13 }}>
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
            placeholderTextColor="#64748b"
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "rgba(75,85,99,0.7)",
              padding: 12,
              marginBottom: 10,
              backgroundColor: "#020617",
              color: "#f1f5f9",
              fontSize: 15,
            }}
          />

          <Text
            style={{
              color: "#e5e7eb",
              fontSize: 15,
              marginBottom: 14,
              fontWeight: "600",
            }}
          >
            {formatDayLong(chosenDate)}
          </Text>

          {/* CALENDAR CARD */}
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(75,85,99,0.6)",
              padding: 14,
              borderRadius: 16,
              backgroundColor: "#020617",
              marginBottom: 24,
            }}
          >
            {/* MONTH HEADER */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
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
                  borderColor: "rgba(75,85,99,0.7)",
                }}
              >
                <Ionicons name="chevron-back" size={18} color="#e5e7eb" />
              </TouchableOpacity>

              <Text
                style={{
                  color: "#e5e7eb",
                  fontSize: 15,
                  fontWeight: "700",
                }}
              >
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
                  borderColor: "rgba(75,85,99,0.7)",
                }}
              >
                <Ionicons name="chevron-forward" size={18} color="#e5e7eb" />
              </TouchableOpacity>
            </View>

            {/* WEEK LABELS */}
            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              {["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].map((d) => (
                <Text
                  key={d}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: 11,
                  }}
                >
                  {d}
                </Text>
              ))}
            </View>

            {/* DAYS GRID */}
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {daysGrid.map((d, index) => {
                if (!d)
                  return (
                    <View key={index} style={{ width: "14.28%", height: 40 }} />
                  );

                const selected = d.getTime() === chosenDate.getTime();

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
                      height: 40,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        backgroundColor: selected ? "#22d3ee" : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: selected ? "#022c22" : "#e2e8f0",
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

          {/* BUTTONS */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.5)",
              }}
            >
              <Text style={{ color: "#94a3b8", fontSize: 14 }}>Anuluj</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              disabled={!title.trim() || saving}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor:
                  title.trim() && !saving
                    ? "#22d3ee"
                    : "rgba(148,163,184,0.2)",
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  color:
                    title.trim() && !saving
                      ? "#022c22"
                      : "rgba(148,163,184,0.7)",
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
    </SafeAreaView>
  );
}
