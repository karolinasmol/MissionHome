// app/add-task.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, yy, mm, dd] = m;
  const date = new Date(Number(yy), Number(mm) - 1, Number(dd), 12);
  return isNaN(date.getTime()) ? null : date;
}

/* ----------------------- Difficulty ----------------------- */

const DIFFICULTY = [
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
  id: string;
  label: string;
  avatarUrl: string | null;
  level: number;
  userId: string | null;
  isSelf: boolean;
};

/* ============================================================
   MAIN COMPONENT
============================================================ */

export default function AddTaskScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { members, loading: famLoading } = useFamily();

  const user = auth.currentUser;
  const myUid = user?.uid ?? null;
  const myName = user?.displayName || "Ty";
  const myAvatar = user?.photoURL || null;

  const initialDate = params.date ? new Date(params.date) : new Date();

  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState("easy");
  const [repeatType, setRepeatType] = useState<RepeatType>("none");

  const [chosenDate, setChosenDate] = useState(initialDate);
  const [inputDate, setInputDate] = useState(formatInputDate(initialDate));
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(initialDate));

  const [assignedToId, setAssignedToId] = useState<string>("self");
  const [saving, setSaving] = useState(false);

  /* ------------------ DOMOWNICY ---------------------- */

  const myMember = useMemo(() => {
    if (!members || !myUid) return null;
    return members.find(
      (m: any) => String(m.uid || m.userId || m.id) === myUid
    );
  }, [members, myUid]);

  const memberChips: AssigneeChip[] = useMemo(() => {
    const list: AssigneeChip[] = [];

    // SELF
    list.push({
      id: "self",
      label: "Ty",
      avatarUrl:
        (myMember as any)?.avatarUrl ||
        (myMember as any)?.photoURL ||
        myAvatar,
      level: (myMember as any)?.level ?? 1,
      userId: myUid,
      isSelf: true,
    });

    // OTHERS
    members?.forEach((m: any) => {
      const uid = String(m.uid || m.userId || m.id || "");
      if (!uid || uid === myUid) return;

      list.push({
        id: uid,
        label: m.displayName || m.username || m.name || "Bez nazwy",
        avatarUrl: m.avatarUrl || m.photoURL || null,
        level: m.level ?? 1,
        userId: uid,
        isSelf: false,
      });
    });

    return list;
  }, [members, myUid, myMember, myAvatar]);

  const selected = memberChips.find((m) => m.id === assignedToId)!;

  /* ------------------ KALENDARZ ---------------------- */

  const daysGrid = useMemo(() => {
    const arr: (Date | null)[] = [];

    const first = new Date(currentMonth);
    const wd = first.getDay();
    const offset = wd === 0 ? 6 : wd - 1;
    for (let i = 0; i < offset; i++) arr.push(null);

    const nm = new Date(currentMonth);
    nm.setMonth(nm.getMonth() + 1);
    nm.setDate(0);
    const last = nm.getDate();

    for (let d = 1; d <= last; d++) {
      const date = new Date(currentMonth);
      date.setDate(d);
      arr.push(date);
    }

    return arr;
  }, [currentMonth]);

  /* ------------------ SAVE ---------------------- */

  async function handleSave() {
    if (!title.trim() || saving || !myUid) return;

    const expValue = DIFFICULTY.find((d) => d.type === difficulty)?.exp ?? 0;
    const assignee = selected;

    const assignedToUserId = assignee.isSelf ? myUid : assignee.userId;

    if (!assignedToUserId) {
      alert("Nie udało się przypisać użytkownika.");
      return;
    }

    try {
      setSaving(true);

      await createMission({
        title: title.trim(),
        assignedToUserId,
        assignedToName: assignee.label,

        assignedByUserId: myUid,
        assignedByName: myName,

        assignedByAvatarUrl: myAvatar,
        assignedToAvatarUrl: assignee.avatarUrl,

        dueDate: chosenDate,
        repeat: { type: repeatType },
        expValue,
        expMode: difficulty,
      });

      router.back();
    } catch (e) {
      alert("Błąd zapisu");
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  /* ------------------ LOADING ---------------------- */

  if (famLoading)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#020617",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#22d3ee" />
      </View>
    );

  /* ============================================================
     RENDER
  ============================================================ */

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0f172a" }}
      contentContainerStyle={{ padding: 16 }}
    >
      {/* HEADER */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8 }}>
          <Ionicons name="chevron-back" size={22} color="#e5e7eb" />
        </TouchableOpacity>

        <Text style={{ color: "#e5e7eb", fontSize: 18, fontWeight: "700" }}>
          Dodaj zadanie
        </Text>
      </View>

      {/* ASSIGNEE */}
      <Text style={{ color: "#9ca3af", fontSize: 13, marginBottom: 6 }}>
        Przypisane do
      </Text>

      <View
        style={{
          flexDirection: "row",
          padding: 12,
          borderWidth: 1,
          borderColor: "#475569",
          borderRadius: 12,
          backgroundColor: "#020617",
          marginBottom: 12,
          alignItems: "center",
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
              {selected.label[0]}
            </Text>
          </View>
        )}

        <View>
          <Text style={{ color: "#e5e7eb", fontWeight: "700", fontSize: 15 }}>
            {selected.label}
          </Text>
          <Text style={{ color: "#64748b", fontSize: 12 }}>
            Poziom {selected.level}
          </Text>
        </View>
      </View>

      {/* MEMBER SELECT */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {memberChips.map((m) => {
          const active = m.id === assignedToId;
          return (
            <TouchableOpacity
              key={m.id}
              onPress={() => setAssignedToId(m.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? "#22d3ee" : "#475569",
                backgroundColor: active ? "#22d3ee22" : "transparent",
              }}
            >
              <Text style={{ color: active ? "#22d3ee" : "#e5e7eb" }}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* DIFFICULTY */}
      <Text style={{ color: "#9ca3af", marginBottom: 6, fontSize: 13 }}>
        Trudność
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {DIFFICULTY.map((d) => {
          const active = difficulty === d.type;
          return (
            <TouchableOpacity
              key={d.type}
              onPress={() => setDifficulty(d.type)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? "#22d3ee" : "#475569",
                backgroundColor: active ? "#22d3ee22" : "transparent",
              }}
            >
              <Text style={{ color: active ? "#22d3ee" : "#e5e7eb" }}>
                {d.label} ({d.exp} EXP)
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* REPEAT */}
      <Text style={{ color: "#9ca3af", marginBottom: 6, fontSize: 13 }}>
        Powtarzalność
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {REPEAT_OPTIONS.map((o) => {
          const active = repeatType === o.type;
          return (
            <TouchableOpacity
              key={o.type}
              onPress={() => setRepeatType(o.type)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? "#22d3ee" : "#475569",
                backgroundColor: active ? "#22d3ee22" : "transparent",
              }}
            >
              <Text style={{ color: active ? "#22d3ee" : "#e5e7eb" }}>
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* TITLE INPUT */}
      <Text style={{ color: "#9ca3af", marginBottom: 6, fontSize: 13 }}>Nazwa</Text>

      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Np. Umyć naczynia"
        placeholderTextColor="#6b7280"
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#374151",
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
          const date = parseInputDate(t);
          if (date) {
            setChosenDate(date);
            setCurrentMonth(startOfMonth(date));
          }
        }}
        placeholder="2025-01-01"
        placeholderTextColor="#6b7280"
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#374151",
          padding: 10,
          marginBottom: 10,
          backgroundColor: "#020617",
          color: "#fff",
        }}
      />

      <Text style={{ color: "#e5e7eb", marginBottom: 10, fontSize: 15 }}>
        {formatDayLong(chosenDate)}
      </Text>

      {/* CALENDAR */}
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#475569",
          backgroundColor: "#020617",
          padding: 12,
          marginBottom: 30,
        }}
      >
        {/* Month nav */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 8,
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
              borderColor: "#475569",
            }}
          >
            <Ionicons name="chevron-back" size={16} color="#e5e7eb" />
          </TouchableOpacity>

          <Text style={{ color: "#e5e7eb", fontWeight: "600" }}>
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
              borderColor: "#475569",
            }}
          >
            <Ionicons name="chevron-forward" size={16} color="#e5e7eb" />
          </TouchableOpacity>
        </View>

        {/* Weekdays */}
        <View style={{ flexDirection: "row", marginBottom: 6 }}>
          {["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].map((w) => (
            <Text
              key={w}
              style={{
                flex: 1,
                textAlign: "center",
                color: "#6b7280",
                fontSize: 11,
              }}
            >
              {w}
            </Text>
          ))}
        </View>

        {/* Days grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {daysGrid.map((d, i) => {
            if (!d)
              return <View key={i} style={{ width: "14.28%", height: 34 }} />;

            const isSel = d.toDateString() === chosenDate.toDateString();

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
                    backgroundColor: isSel ? "#22d3ee" : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: isSel ? "#022c22" : "#e5e7eb",
                      fontSize: 13,
                      fontWeight: isSel ? "700" : "400",
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
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#94a3b8",
          }}
        >
          <Text style={{ color: "#94a3b8" }}>Anuluj</Text>
        </TouchableOpacity>

        <TouchableOpacity
          disabled={!title.trim() || saving}
          onPress={handleSave}
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
              fontWeight: "700",
            }}
          >
            {saving ? "Zapisywanie..." : "Zapisz"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
