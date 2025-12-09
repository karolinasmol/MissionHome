// app/calendar.tsx
import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "../src/context/ThemeContext";
import { useMissions } from "../src/hooks/useMissions";

import { db } from "../src/firebase/firebase.web";
import { collection, getDocs, limit, query } from "firebase/firestore";

import { auth } from "../src/firebase/firebase";
import { useFamily } from "../src/hooks/useFamily";

/* ----------------------- Helpers ----------------------- */

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysInMonth(date: Date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.getDate();
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayLong(date: Date) {
  return date.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const WEEK_LABELS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

function normalizeDueDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function toSafeDate(v: any): Date | null {
  if (!v) return null;
  const d = v?.toDate?.() ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// 🔑 klucz daty (RRRR-MM-DD) – spójny z index.tsx
function formatDateKey(date: Date) {
  const d0 = startOfDay(date);
  const y = d0.getFullYear();
  const m = String(d0.getMonth() + 1).padStart(2, "0");
  const d = String(d0.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// czy misja „występuje” w danym dniu (cykliczność + archived + skipDates)
function missionOccursOnDay(m: any, day: Date): boolean {
  const dueRaw = normalizeDueDate(m.dueDate);
  if (!dueRaw) return false;

  if (m.archived) return false;

  const day0 = startOfDay(day);
  const due0 = startOfDay(dueRaw);

  const dateKey = formatDateKey(day0);
  if (Array.isArray(m.skipDates) && m.skipDates.includes(dateKey)) {
    return false;
  }

  const repeat = m.repeat?.type ?? "none";

  if (repeat === "none") return isSameDay(due0, day0);

  // start serii dopiero od dueDate (bez bugów przez godziny)
  if (due0.getTime() > day0.getTime()) return false;

  if (repeat === "daily") return true;
  if (repeat === "weekly") return day0.getDay() === due0.getDay();
  if (repeat === "monthly") return day0.getDate() === due0.getDate();

  return false;
}

// ✅ wykrywanie wykonania per dzień (dla cyklicznych)
function isMissionDoneOnDate(m: any, date: Date) {
  const repeat = m?.repeat?.type ?? "none";
  const dateKey = formatDateKey(date);

  if (repeat !== "none") {
    if (Array.isArray(m.completedDates) && m.completedDates.includes(dateKey)) {
      return true;
    }

    const completedAt = toSafeDate(m.completedAt);
    if (completedAt && isSameDay(completedAt, date)) return true;

    return false;
  }

  return !!m.completed;
}

/* ----------------------- Screen ----------------------- */

export default function CalendarScreen() {
  const { colors } = useThemeColors();
  const { missions, loading } = useMissions();
  const { members } = useFamily();

  const currentUser = auth.currentUser;
  const myUid = currentUser?.uid ?? null;
  const myId = myUid ? String(myUid) : null;

  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(new Date())
  );
  const [selectedDate, setSelectedDate] = useState<Date>(() =>
    startOfDay(new Date())
  );

  const [deletedMissions, setDeletedMissions] = useState<any[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);

  // wczytanie ostatnich usuniętych zadań
  useEffect(() => {
    let cancelled = false;

    const loadDeleted = async () => {
      try {
        setDeletedLoading(true);
        const snap = await getDocs(
          query(collection(db, "deleted_missions"), limit(100))
        );
        if (cancelled) return;

        const arr = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setDeletedMissions(arr);
      } catch {
        if (!cancelled) setDeletedMissions([]);
      } finally {
        if (!cancelled) setDeletedLoading(false);
      }
    };

    loadDeleted();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- Predykaty: moje / delegowane ---------- */

  const isMyTask = (m: any): boolean => {
    if (!myId) return false;

    const assignedTo = m?.assignedToUserId ? String(m.assignedToUserId) : null;
    const assignedBy = m?.assignedByUserId ? String(m.assignedByUserId) : null;
    const createdBy = m?.createdByUserId ? String(m.createdByUserId) : null;

    if (assignedTo && assignedTo === myId) return true;

    if (!assignedTo && (assignedBy === myId || createdBy === myId)) {
      return true;
    }

    return false;
  };

  const isDelegatedTask = (m: any): boolean => {
    if (!myId) return false;

    const assignedTo = m?.assignedToUserId ? String(m.assignedToUserId) : null;
    const assignedBy = m?.assignedByUserId ? String(m.assignedByUserId) : null;
    const createdBy = m?.createdByUserId ? String(m.createdByUserId) : null;

    if (!assignedTo) return false;
    if (assignedTo === myId) return false;

    if (assignedBy === myId || createdBy === myId) return true;

    return false;
  };

  const allMissions: any[] = useMemo(
    () => (Array.isArray(missions) ? missions : []),
    [missions]
  );

  const myTasks = useMemo(
    () => allMissions.filter(isMyTask),
    [allMissions, myId]
  );

  const delegatedTasks = useMemo(
    () => allMissions.filter(isDelegatedTask),
    [allMissions, myId]
  );

  /* ---------- KTO DODAŁ – getCreatorMember ---------- */

  const meFromMembers = useMemo(() => {
    if (!members || !myUid) return null;
    return (
      members.find((x: any) => {
        const uid = String(x.uid || x.userId || x.id || "");
        return uid === myUid;
      }) || null
    );
  }, [members, myUid]);

  const membersById = useMemo(() => {
    const map = new Map<string, any>();
    (members || []).forEach((x: any) => {
      const uid = String(x.uid || x.userId || x.id || "");
      if (uid) map.set(uid, x);
    });
    return map;
  }, [members]);

  const getCreatorMember = (m: any) => {
    const rawId = m?.assignedByUserId || m?.createdByUserId || null;
    const creatorId = rawId ? String(rawId) : null;
    const creatorName = m?.assignedByName || m?.createdByName || null;

    if (!creatorId && !creatorName) return null;

    if (myUid && creatorId && creatorId === String(myUid)) {
      const label =
        creatorName ||
        (meFromMembers as any)?.displayName ||
        (meFromMembers as any)?.username ||
        currentUser?.displayName ||
        "Ty";

      const avatarUrl =
        (meFromMembers as any)?.avatarUrl ||
        (meFromMembers as any)?.photoURL ||
        currentUser?.photoURL ||
        null;

      return { id: "self", label, avatarUrl };
    }

    if (creatorId && members) {
      const found = membersById.get(creatorId);
      if (found) {
        return {
          id: String(found.uid || found.userId || found.id),
          label:
            found.displayName || found.username || creatorName || "Bez nazwy",
          avatarUrl: found.avatarUrl || found.photoURL || null,
        };
      }
    }

    if (creatorName) {
      return { id: creatorId || "unknown", label: creatorName, avatarUrl: null };
    }

    return null;
  };

  /* ✅ WYKONANE PRZEZ (z fallbackami) */
  const getCompletedByLabel = (m: any) => {
    const completedByName = m?.completedByName ? String(m.completedByName) : null;
    const completedByUserId = m?.completedByUserId
      ? String(m.completedByUserId)
      : null;

    if (completedByUserId && myId && completedByUserId === myId) return "Ty";
    if (completedByName) return completedByName;

    if (completedByUserId) {
      const found = membersById.get(completedByUserId);
      if (found) return found.displayName || found.username || "Nieznane";
    }

    const assignedToId = m?.assignedToUserId ? String(m.assignedToUserId) : null;
    if (assignedToId && myId && assignedToId === myId) return "Ty";
    if (m?.assignedToName) return String(m.assignedToName);

    if (assignedToId) {
      const found = membersById.get(assignedToId);
      if (found) return found.displayName || found.username || "Nieznane";
    }

    return "Nieznane";
  };

  /* ---------- KALENDARZ ---------- */

  const daysGrid = useMemo(() => {
    const first = startOfMonth(currentMonth);
    const firstWeekday = first.getDay(); // 0 = Nd, 1 = Pn...
    const offset = firstWeekday === 0 ? 6 : firstWeekday - 1;

    const totalDays = daysInMonth(currentMonth);

    const days: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) days.push(null);

    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(currentMonth);
      date.setDate(d);
      days.push(startOfDay(date));
    }

    return days;
  }, [currentMonth]);

  const today = useMemo(() => startOfDay(new Date()), []);

  const myMissionsForSelectedDay = useMemo(() => {
    if (!myTasks?.length) return [];
    return myTasks.filter((m: any) => missionOccursOnDay(m, selectedDate));
  }, [myTasks, selectedDate]);

  const myPendingMissions = useMemo(
    () =>
      myMissionsForSelectedDay.filter(
        (m: any) => !isMissionDoneOnDate(m, selectedDate)
      ),
    [myMissionsForSelectedDay, selectedDate]
  );

  const myCompletedMissions = useMemo(
    () =>
      myMissionsForSelectedDay.filter((m: any) =>
        isMissionDoneOnDate(m, selectedDate)
      ),
    [myMissionsForSelectedDay, selectedDate]
  );

  const delegatedForSelectedDay = useMemo(() => {
    if (!delegatedTasks?.length) return [];
    return delegatedTasks.filter((m: any) =>
      missionOccursOnDay(m, selectedDate)
    );
  }, [delegatedTasks, selectedDate]);

  const delegatedPending = useMemo(
    () =>
      delegatedForSelectedDay.filter(
        (m: any) => !isMissionDoneOnDate(m, selectedDate)
      ),
    [delegatedForSelectedDay, selectedDate]
  );

  const delegatedCompleted = useMemo(
    () =>
      delegatedForSelectedDay.filter((m: any) =>
        isMissionDoneOnDate(m, selectedDate)
      ),
    [delegatedForSelectedDay, selectedDate]
  );

  const deletedForSelectedDay = useMemo(() => {
    if (!deletedMissions?.length) return [];
    return deletedMissions.filter((m: any) => {
      const involved = isMyTask(m) || isDelegatedTask(m);
      if (!involved) return false;
      return missionOccursOnDay(m, selectedDate);
    });
  }, [deletedMissions, selectedDate, myId]);

  const hasMissionsOnDay = (day: Date) => {
    return (
      myTasks.some((m: any) => missionOccursOnDay(m, day)) ||
      delegatedTasks.some((m: any) => missionOccursOnDay(m, day))
    );
  };

  const hasCompletedOnDay = (day: Date) => {
    const anyMyDone = myTasks.some(
      (m: any) => missionOccursOnDay(m, day) && isMissionDoneOnDate(m, day)
    );
    if (anyMyDone) return true;

    const anyDelDone = delegatedTasks.some(
      (m: any) => missionOccursOnDay(m, day) && isMissionDoneOnDate(m, day)
    );
    return anyDelDone;
  };

  /* ------------------------- UI ------------------------- */

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingVertical: 16, alignItems: "center" }}
    >
      <View style={{ width: "100%", maxWidth: 1344, paddingHorizontal: 24 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 24,
            fontWeight: "800",
            marginBottom: 12,
          }}
        >
          Kalendarz domowy
        </Text>

        {/* Karta kalendarza miesięcznego */}
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
          {/* Header miesiąca */}
          <View style={styles.monthHeader}>
            <TouchableOpacity
              onPress={() =>
                setCurrentMonth((prev) => {
                  const d = new Date(prev);
                  d.setMonth(d.getMonth() - 1);
                  return startOfMonth(d);
                })
              }
              style={styles.monthNavBtn}
            >
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </TouchableOpacity>

            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                {currentMonth.toLocaleDateString("pl-PL", {
                  month: "long",
                  year: "numeric",
                })}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() =>
                setCurrentMonth((prev) => {
                  const d = new Date(prev);
                  d.setMonth(d.getMonth() + 1);
                  return startOfMonth(d);
                })
              }
              style={styles.monthNavBtn}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.text}
              />
            </TouchableOpacity>
          </View>

          {/* Nazwy dni tygodnia */}
          <View style={styles.weekLabelsRow}>
            {WEEK_LABELS.map((label) => (
              <Text
                key={label}
                style={{
                  flex: 1,
                  textAlign: "center",
                  color: colors.textMuted,
                  fontSize: 11,
                  fontWeight: "600",
                }}
              >
                {label}
              </Text>
            ))}
          </View>

          {/* Siatka dni */}
          <View style={styles.daysGrid}>
            {daysGrid.map((day, idx) => {
              if (!day) {
                return <View key={`empty-${idx}`} style={styles.dayCell} />;
              }

              const isToday = isSameDay(day, today);
              const isSelected = isSameDay(day, selectedDate);
              const hasM = hasMissionsOnDay(day);
              const hasDone = hasCompletedOnDay(day);

              let bg = "transparent";
              let border = colors.border;
              let textColor = colors.text;

              if (isSelected) {
                bg = colors.accent;
                border = colors.accent;
                textColor = "#022c22";
              } else if (isToday) {
                bg = colors.accent + "22";
                border = colors.accent;
              }

              return (
                <TouchableOpacity
                  key={day.toISOString()}
                  onPress={() => setSelectedDate(startOfDay(day))}
                  style={styles.dayCell}
                  activeOpacity={0.85}
                >
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      backgroundColor: bg,
                      borderWidth: 1,
                      borderColor: border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: textColor,
                        fontSize: 13,
                        fontWeight: isSelected ? "800" : "500",
                      }}
                    >
                      {day.getDate()}
                    </Text>
                  </View>

                  {hasM && (
                    <View
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 999,
                        backgroundColor: hasDone ? "#22c55e" : colors.accent,
                        marginTop: 3,
                      }}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Moje zadania na dzień */}
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
              marginBottom: 8,
              alignItems: "center",
            }}
          >
            <View>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                Twoje zadania na dzień
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {formatDayLong(selectedDate)}
              </Text>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {myPendingMissions.length} otwarte •{" "}
                {myCompletedMissions.length} wykonane
              </Text>
            )}
          </View>

          {loading ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Ładowanie zadań…
            </Text>
          ) : myMissionsForSelectedDay.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Brak zadań przypisanych do Ciebie w tym dniu.
            </Text>
          ) : (
            <>
              {/* Niezrealizowane */}
              {myPendingMissions.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: "800",
                      marginBottom: 4,
                    }}
                  >
                    Niezrealizowane
                  </Text>

                  {myPendingMissions.map((m: any) => {
                    const creator = getCreatorMember(m);

                    return (
                      <View
                        key={m.id}
                        style={[
                          styles.missionRow,
                          {
                            borderColor: colors.border,
                            backgroundColor: colors.card,
                          },
                        ]}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.border,
                            marginRight: 10,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons
                            name="ellipse-outline"
                            size={16}
                            color={colors.textMuted}
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
                            {m.title}
                          </Text>

                          {creator?.label && (
                            <Text
                              style={{
                                color: colors.textMuted,
                                fontSize: 11,
                                marginTop: 2,
                              }}
                            >
                              Dodane przez: {creator.label}
                            </Text>
                          )}
                        </View>

                        {!!m.expValue && (
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: colors.accent + "88",
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
                              +{m.expValue} EXP
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Zrealizowane */}
              {myCompletedMissions.length > 0 && (
                <View>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: "800",
                      marginBottom: 4,
                    }}
                  >
                    Zrealizowane
                  </Text>

                  {myCompletedMissions.map((m: any) => {
                    const creator = getCreatorMember(m);
                    const doneBy = getCompletedByLabel(m);

                    return (
                      <View
                        key={m.id}
                        style={[
                          styles.missionRow,
                          {
                            borderColor: colors.accent + "66",
                            backgroundColor: colors.card,
                          },
                        ]}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.accent + "AA",
                            marginRight: 10,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: colors.accent + "22",
                          }}
                        >
                          <Ionicons
                            name="checkmark"
                            size={16}
                            color={colors.accent}
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
                            {m.title}
                          </Text>

                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 11,
                              marginTop: 2,
                            }}
                          >
                            Wykonane przez: {doneBy}
                          </Text>

                          {creator?.label && (
                            <Text
                              style={{
                                color: colors.textMuted,
                                fontSize: 11,
                                marginTop: 2,
                              }}
                            >
                              Dodane przez: {creator.label}
                            </Text>
                          )}
                        </View>

                        {!!m.expValue && (
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: colors.accent + "88",
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
                              +{m.expValue} EXP
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>

        {/* Zadania przypisane innym domownikom */}
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
              marginBottom: 8,
              alignItems: "center",
            }}
          >
            <View>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                Zadania przypisane innym domownikom
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {formatDayLong(selectedDate)}
              </Text>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {delegatedPending.length} otwarte •{" "}
                {delegatedCompleted.length} wykonane
              </Text>
            )}
          </View>

          {loading ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Ładowanie zadań…
            </Text>
          ) : delegatedForSelectedDay.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Brak zadań przypisanych przez Ciebie innym w tym dniu.
            </Text>
          ) : (
            <>
              {/* Niezrealizowane */}
              {delegatedPending.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: "800",
                      marginBottom: 4,
                    }}
                  >
                    Niezrealizowane
                  </Text>

                  {delegatedPending.map((m: any) => {
                    const creator = getCreatorMember(m);

                    return (
                      <View
                        key={m.id}
                        style={[
                          styles.missionRow,
                          {
                            borderColor: colors.border,
                            backgroundColor: colors.card,
                          },
                        ]}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.border,
                            marginRight: 10,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons
                            name="ellipse-outline"
                            size={16}
                            color={colors.textMuted}
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
                            {m.title}
                          </Text>

                          {!!m.assignedToName && (
                            <Text
                              style={{
                                color: colors.textMuted,
                                fontSize: 11,
                                marginTop: 2,
                              }}
                            >
                              Przypisane do: {m.assignedToName}
                            </Text>
                          )}

                          {creator?.label && (
                            <Text
                              style={{
                                color: colors.textMuted,
                                fontSize: 11,
                                marginTop: 2,
                              }}
                            >
                              Dodane przez: {creator.label}
                            </Text>
                          )}
                        </View>

                        {!!m.expValue && (
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: colors.accent + "88",
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
                              +{m.expValue} EXP
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Zrealizowane */}
              {delegatedCompleted.length > 0 && (
                <View>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: "800",
                      marginBottom: 4,
                    }}
                  >
                    Zrealizowane
                  </Text>

                  {delegatedCompleted.map((m: any) => {
                    const creator = getCreatorMember(m);
                    const doneBy = getCompletedByLabel(m);

                    return (
                      <View
                        key={m.id}
                        style={[
                          styles.missionRow,
                          {
                            borderColor: colors.accent + "66",
                            backgroundColor: colors.card,
                          },
                        ]}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.accent + "AA",
                            marginRight: 10,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: colors.accent + "22",
                          }}
                        >
                          <Ionicons
                            name="checkmark"
                            size={16}
                            color={colors.accent}
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
                            {m.title}
                          </Text>

                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 11,
                              marginTop: 2,
                            }}
                          >
                            Wykonane przez: {doneBy}
                          </Text>

                          {!!m.assignedToName && (
                            <Text
                              style={{
                                color: colors.textMuted,
                                fontSize: 11,
                                marginTop: 2,
                              }}
                            >
                              Przypisane do: {m.assignedToName}
                            </Text>
                          )}

                          {creator?.label && (
                            <Text
                              style={{
                                color: colors.textMuted,
                                fontSize: 11,
                                marginTop: 2,
                              }}
                            >
                              Dodane przez: {creator.label}
                            </Text>
                          )}
                        </View>

                        {!!m.expValue && (
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: colors.accent + "88",
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
                              +{m.expValue} EXP
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>

        {/* Usunięte zadania */}
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
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 6,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              Usunięte zadania tego dnia
            </Text>

            {deletedLoading && (
              <ActivityIndicator size="small" color={colors.accent} />
            )}
          </View>

          {deletedLoading ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Ładowanie…
            </Text>
          ) : deletedForSelectedDay.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Brak usuniętych zadań tego dnia.
            </Text>
          ) : (
            deletedForSelectedDay.map((m: any) => (
              <View
                key={m.id}
                style={[
                  styles.missionRow,
                  {
                    borderColor: "#ef444466",
                    backgroundColor: colors.card,
                  },
                ]}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "#ef4444AA",
                    marginRight: 10,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
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
                    {m.title}
                  </Text>
                  {!!m.assignedToName && (
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      Przypisane do: {m.assignedToName}
                    </Text>
                  )}
                </View>
              </View>
            ))
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
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  monthNavBtn: {
    padding: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.4)",
  },
  weekLabelsRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  dayCell: {
    width: "14.28%",
    alignItems: "center",
    paddingVertical: 4,
  },
  missionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
});
