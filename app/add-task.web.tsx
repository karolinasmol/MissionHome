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
import { createMission } from "../src/services/missions";
import { auth } from "../src/firebase/firebase";

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

/* ----------------------- COMPONENT ----------------------- */

export default function AddTaskScreen() {
  const router = useRouter();
  const { members, loading: famLoading } = useFamily();
  const params = useLocalSearchParams<{ date?: string }>();

  const currentUser = auth.currentUser;
  const myUid = currentUser?.uid ?? null;
  const myDisplayName = currentUser?.displayName || "Ty";
  const myPhotoURL = currentUser?.photoURL || null;

  /* ---------- HOOKS — wszystkie na samej górze ---------- */

  const initialDate = params.date ? new Date(params.date) : new Date();

  const [title, setTitle] = useState("");
  const [assignedToId, setAssignedToId] = useState<string>("self");

  const [chosenDate, setChosenDate] = useState(initialDate);
  const [inputDate, setInputDate] = useState(formatInputDate(initialDate));
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(initialDate));

  const [repeatType, setRepeatType] = useState<RepeatType>("none");
  const [difficulty, setDifficulty] = useState("easy");

  const [saving, setSaving] = useState(false);

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

    // 1) ZAWSZE self jako "Ty"
    chips.push({
      id: "self",
      label: "Ty",
      avatarUrl: myAvatar,
      level: myLevel,
      userId: myUid,
      isSelf: true,
    });

    // 2) Reszta rodziny (bez mnie)
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

    // assignedToUserId ZAWSZE ma uid
    const assignedToUserId = assignee.isSelf ? myUid : assignee.userId;
    if (!assignedToUserId) {
      alert("Nie udało się ustalić osoby przypisanej do zadania.");
      return;
    }

    const assignedToName = assignee.isSelf ? myDisplayName : assignee.label;

    const assignedByUserId = myUid;
    const assignedByName = myDisplayName || "Ty";

    try {
      setSaving(true);

      await createMission({
        title: title.trim(),
        assignedToUserId,
        assignedToName,

        assignedByUserId,
        assignedByName,

        // ✅ NOWE: zapis avatarów bez zależności od members
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

  if (famLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#020617",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color="#22d3ee" />
      </View>
    );
  }

  /* ---------- UI ---------- */

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: 16,
        maxWidth: 900,
        width: "100%",
        alignSelf: isWeb ? "center" : "stretch",
      }}
    >
      <View
        style={{
          backgroundColor: "rgba(15,23,42,0.95)",
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(148,163,184,0.4)",
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
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginRight: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color="#e5e7eb" />
          </TouchableOpacity>
          <Text style={{ color: "#e5e7eb", fontSize: 18, fontWeight: "700" }}>
            Dodaj zadanie
          </Text>
        </View>

        {/* ASSIGNED TO */}
        <Text style={{ color: "#9ca3af", fontSize: 13, marginBottom: 6 }}>
          Przypisane do
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "rgba(75,85,99,0.9)",
            backgroundColor: "#020617",
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
                backgroundColor: "#22d3ee33",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#22d3ee", fontWeight: "700" }}>
                {selected.label?.[0] ?? "?"}
              </Text>
            </View>
          )}

          <View>
            <Text
              style={{
                color: "#e5e7eb",
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              {selected.label}
            </Text>
            <Text style={{ color: "#64748b", fontSize: 12 }}>
              Poziom {selected.level}
            </Text>
          </View>
        </View>

        {/* MEMBER CHIPS */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 20,
          }}
        >
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
                  borderColor: active ? "#22d3ee" : "rgba(75,85,99,0.9)",
                  backgroundColor: active
                    ? "rgba(34,211,238,0.1)"
                    : "transparent",
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

        {/* TRUDNOŚĆ */}
        <Text style={{ color: "#9ca3af", marginBottom: 6, fontSize: 13 }}>
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
                  borderColor: active ? "#22d3ee" : "rgba(75,85,99,0.9)",
                  backgroundColor: active
                    ? "rgba(34,211,238,0.1)"
                    : "transparent",
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
        <Text style={{ color: "#9ca3af", marginBottom: 6, fontSize: 13 }}>
          Cykliczność
        </Text>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 20,
          }}
        >
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
                  borderColor: active ? "#22d3ee" : "rgba(75,85,99,0.9)",
                  backgroundColor: active
                    ? "rgba(34,211,238,0.1)"
                    : "transparent",
                }}
              >
                <Text
                  style={{
                    color: active ? "#22d3ee" : "#e5e7eb",
                    fontSize: 13,
                  }}
                >
                  {o.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* TITLE INPUT */}
        <Text style={{ color: "#9ca3af", marginBottom: 6, fontSize: 13 }}>
          Nazwa zadania
        </Text>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Np. Umyć naczynia"
          placeholderTextColor="#6b7280"
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "rgba(55,65,81,0.9)",
            padding: 10,
            marginBottom: 20,
            backgroundColor: "#020617",
            color: "#fff",
          }}
        />

        {/* DATE INPUT */}
        <Text style={{ color: "#9ca3af", marginBottom: 6, fontSize: 13 }}>
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
          placeholderTextColor="#6b7280"
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "rgba(55,65,81,0.9)",
            padding: 10,
            marginBottom: 14,
            backgroundColor: "#020617",
            color: "#fff",
          }}
        />

        <Text style={{ color: "#e5e7eb", marginBottom: 10, fontSize: 15 }}>
          {formatDayLong(chosenDate)}
        </Text>

        {/* KALENDARZ */}
        <View
          style={{
            borderWidth: 1,
            borderColor: "rgba(75,85,99,0.9)",
            padding: 12,
            borderRadius: 12,
            backgroundColor: "#020617",
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
                borderColor: "rgba(75,85,99,0.9)",
              }}
            >
              <Ionicons name="chevron-back" size={16} color="#e5e7eb" />
            </TouchableOpacity>

            <Text
              style={{
                color: "#e5e7eb",
                fontSize: 14,
                fontWeight: "600",
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
                borderColor: "rgba(75,85,99,0.9)",
              }}
            >
              <Ionicons name="chevron-forward" size={16} color="#e5e7eb" />
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
                  color: "#6b7280",
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
                      backgroundColor: selectedDay ? "#22d3ee" : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: selectedDay ? "#022c22" : "#e5e7eb",
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
              borderColor: "rgba(148,163,184,0.5)",
            }}
          >
            <Text style={{ color: "#9ca3af", fontSize: 14 }}>Anuluj</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSave}
            disabled={!title.trim() || saving}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: title.trim() && !saving ? "#22d3ee" : "#1e293b",
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Text
              style={{
                color: title.trim() && !saving ? "#022c22" : "#6b7280",
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
