import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  orderBy,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "../firebase/firebase";

/* ----------------------------------------------------
   TYPES
---------------------------------------------------- */

type ChallengeStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";

export type NewChallenge = {
  id: string;
  userId: string;
  title: string;
  expValue: number;
  dueAt: Date;
  ruleId?: string | null;
  status: ChallengeStatus;
  uiPresentedAt?: Date | null;
  createdAt?: Date | null;
  _refPath: string;
};

type NoweWyzwanieContextValue = {
  user: User | null;
  isOpen: boolean;
  loading: boolean;
  hasSeenToday: boolean;
  challenges: NewChallenge[];
  open: () => void;
  close: () => void;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  submitSelection: (acceptedIds: string[], declinedIds: string[]) => Promise<void>;
  refresh: () => Promise<void>;
};

const NoweWyzwanieContext = createContext<NoweWyzwanieContextValue | null>(null);

/* ----------------------------------------------------
   CONSTS
---------------------------------------------------- */

const DAILY_SUGGESTIONS_LIMIT = 12;

/* ----------------------------------------------------
   HELPERS
---------------------------------------------------- */

function asDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v?.toDate === "function") {
    try {
      return v.toDate();
    } catch {
      return null;
    }
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatRecurrenceFromRuleId(ruleId?: string | null) {
  return ruleId ? "Cykliczność: cykliczne" : "Cykliczność: jednorazowo";
}

async function markPresented(uid: string, challengeId: string) {
  try {
    await updateDoc(doc(db, `users/${uid}/new_challenges/${challengeId}`), {
      uiPresentedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("[NoweWyzwanie] markPresented error", e);
  }
}

async function stampLastModalAt(uid: string) {
  try {
    await updateDoc(doc(db, `users/${uid}`), {
      lastChallengeModalAt: serverTimestamp(),
    });
  } catch {
    try {
      await setDoc(
        doc(db, `users/${uid}`),
        { lastChallengeModalAt: serverTimestamp() },
        { merge: true }
      );
    } catch (e) {
      console.error("[NoweWyzwanie] stampLastModalAt error", e);
    }
  }
}

/* ----------------------------------------------------
   PROVIDER
---------------------------------------------------- */

export function NoweWyzwanieProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [challenges, setChallenges] = useState<NewChallenge[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [lastModalAt, setLastModalAt] = useState<Date | null>(null);
  const presentedOnceRef = useRef(false);

  const hasSeenToday = useMemo(() => {
    if (!lastModalAt) return false;
    return isSameLocalDay(lastModalAt, new Date());
  }, [lastModalAt]);

  /* AUTH */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      setChallenges([]);
      setIsOpen(false);
      setLastModalAt(null);
      presentedOnceRef.current = false;
    });
    return unsub;
  }, []);

  /* ------------------------------------------------------------
     0) After login → generate challenges (ONLY IF EMAIL VERIFIED)
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!user?.uid) return;

    // BLOCK if email NOT verified
    if (!user.emailVerified) {
      console.log("[DailyChallenges] SKIP — email not verified");
      return;
    }

    const url =
      "https://europe-central2-domowe-443e7.cloudfunctions.net/generateDailyChallenges";

    console.log("[DailyChallenges] CALL:", `${url}?uid=${user.uid}`);

    fetch(`${url}?uid=${user.uid}`)
      .then(async (r) => {
        let json = null;
        try {
          json = await r.json();
        } catch {
          console.warn("[DailyChallenges] JSON parse error");
        }
        console.log("[DailyChallenges] RESPONSE:", json);
      })
      .catch((e) => console.error("[DailyChallenges] ERROR:", e));
  }, [user?.uid, user?.emailVerified]);

  /* ------------------------------------------------------------
     1) Listen user metadata (lastChallengeModalAt)
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!user?.uid) return;
    if (!user.emailVerified) return; // block

    return onSnapshot(
      doc(db, `users/${user.uid}`),
      (snap) => {
        const d: any = snap.data() || {};
        setLastModalAt(asDate(d?.lastChallengeModalAt));
      },
      (err) => console.error("[NoweWyzwanie] user meta error:", err)
    );
  }, [user?.uid, user?.emailVerified]);

  /* ------------------------------------------------------------
     2) Listen PENDING challenges
  ------------------------------------------------------------ */
  useEffect(() => {
    if (!user?.uid) return;
    if (!user.emailVerified) return; // block

    console.log("[NoweWyzwanie] Subscribing for PENDING…");

    const colRef = collection(db, `users/${user.uid}/new_challenges`);

    const q = query(
      colRef,
      where("status", "==", "PENDING"),
      orderBy("createdAt", "asc"),
      limit(DAILY_SUGGESTIONS_LIMIT)
    );

    return onSnapshot(
      q,
      async (snap) => {
        const list: NewChallenge[] = [];
        const idsToMark: string[] = [];

        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;

          list.push({
            id: docSnap.id,
            userId: user.uid,
            title: data.title || "Nowe zadanie",
            expValue: Number(data.expValue || 0),
            dueAt: asDate(data.dueAt) ?? new Date(),
            ruleId: data.ruleId ?? null,
            status: data.status ?? "PENDING",
            uiPresentedAt: asDate(data.uiPresentedAt),
            createdAt: asDate(data.createdAt),
            _refPath: docSnap.ref.path,
          });

          if (!data.uiPresentedAt) idsToMark.push(docSnap.id);
        });

        console.log("[NoweWyzwanie] PENDING:", list);

        setChallenges(list);

        if (list.length === 0) {
          setIsOpen(false);
          presentedOnceRef.current = false;
          return;
        }

        if (hasSeenToday) return;
        if (presentedOnceRef.current) return;

        presentedOnceRef.current = true;

        try {
          await Promise.all([
            stampLastModalAt(user.uid),
            ...idsToMark.map((id) => markPresented(user.uid, id)),
          ]);
        } catch (e) {
          console.error("[NoweWyzwanie] Autopopup error:", e);
        }

        console.log("[NoweWyzwanie] OPEN MODAL 🎉");
        setIsOpen(true);
      },
      (err) => console.error("[NoweWyzwanie] PENDING snapshot error:", err)
    );
  }, [user?.uid, user?.emailVerified, hasSeenToday]);

  /* ------------------------------------------------------------
     HANDLERS
  ------------------------------------------------------------ */

  const open = () => challenges.length > 0 && setIsOpen(true);
  const close = () => setIsOpen(false);

  const submitSelection = async (acceptedIds: string[], declinedIds: string[]) => {
    if (!user?.uid) return;

    try {
      const batch = writeBatch(db);

      acceptedIds.forEach((id) =>
        batch.update(doc(db, `users/${user.uid}/new_challenges/${id}`), {
          status: "ACCEPTED",
          acceptedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );

      declinedIds.forEach((id) =>
        batch.update(doc(db, `users/${user.uid}/new_challenges/${id}`), {
          status: "DECLINED",
          declinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );

      await batch.commit();
    } catch (e) {
      console.error("[NoweWyzwanie] submit error:", e);
    } finally {
      setIsOpen(false);
    }
  };

  const accept = async () =>
    user?.uid && challenges.length > 0 && submitSelection([challenges[0].id], []);

  const decline = async () =>
    user?.uid && challenges.length > 0 && submitSelection([], [challenges[0].id]);

  const refresh = async () => {
    if (!user?.uid) return;

    const colRef = collection(db, `users/${user.uid}/new_challenges`);

    const q = query(
      colRef,
      where("status", "==", "PENDING"),
      orderBy("createdAt", "asc"),
      limit(DAILY_SUGGESTIONS_LIMIT)
    );

    const snap = await getDocs(q);
    const list: NewChallenge[] = [];
    const idsToMark: string[] = [];

    snap.forEach((docSnap) => {
      const d = docSnap.data() as any;
      list.push({
        id: docSnap.id,
        userId: user.uid,
        title: d.title,
        expValue: d.expValue,
        dueAt: asDate(d.dueAt) ?? new Date(),
        ruleId: d.ruleId,
        status: d.status,
        uiPresentedAt: asDate(d.uiPresentedAt),
        createdAt: asDate(d.createdAt),
        _refPath: docSnap.ref.path,
      });

      if (!d.uiPresentedAt) idsToMark.push(docSnap.id);
    });

    setChallenges(list);

    if (!hasSeenToday && list.length > 0) {
      await Promise.all([
        stampLastModalAt(user.uid),
        ...idsToMark.map((id) => markPresented(user.uid, id)),
      ]);
      setIsOpen(true);
    }
  };

  const value = useMemo(
    () => ({
      user,
      isOpen,
      loading,
      hasSeenToday,
      challenges,
      open,
      close,
      accept,
      decline,
      submitSelection,
      refresh,
    }),
    [user, isOpen, loading, hasSeenToday, challenges]
  );

  return <NoweWyzwanieContext.Provider value={value}>{children}</NoweWyzwanieContext.Provider>;
}

/* ------------------------------------------------------------
   HOOK
------------------------------------------------------------ */
export function useNoweWyzwanie() {
  const ctx = useContext(NoweWyzwanieContext);
  if (!ctx) throw new Error("useNoweWyzwanie must be used within NoweWyzwanieProvider");
  return ctx;
}

/* ------------------------------------------------------------
   MODAL
------------------------------------------------------------ */

export const NoweWyzwanieModalRN = () => {
  const { isOpen, close, challenges, submitSelection } = useNoweWyzwanie();
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    challenges.forEach((c) => (next[c.id] = true));
    setSelected(next);
  }, [challenges]);

  if (!challenges.length) return null;

  const toggle = (id: string) =>
    setSelected((p) => ({
      ...p,
      [id]: !p[id],
    }));

  const submit = () => {
    const acc: string[] = [];
    const dec: string[] = [];
    challenges.forEach((c) => (selected[c.id] ? acc.push(c.id) : dec.push(c.id)));
    submitSelection(acc, dec);
  };

  const rejectAll = () => {
    submitSelection([], challenges.map((c) => c.id));
  };

  const niceDate = (d: Date) =>
    new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);

  return (
    <Modal visible={isOpen} transparent animationType="fade">
      <Pressable
        onPress={close}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <Pressable
          style={{
            width: "100%",
            maxWidth: 600,
            maxHeight: "80%",
            borderRadius: 16,
            backgroundColor: "#0f172a",
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.5)",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              padding: 18,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(148,163,184,0.3)",
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: "800", color: "#e2e8f0" }}>
              Dzisiejsze propozycje ✨
            </Text>
            <Text style={{ marginTop: 4, color: "#94a3b8", fontSize: 13 }}>
              Zaznacz, które zadania chcesz dodać.
            </Text>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 10 }}>
            {challenges.map((ch) => {
              const sel = selected[ch.id];
              return (
                <Pressable
                  key={ch.id}
                  onPress={() => toggle(ch.id)}
                  style={{
                    flexDirection: "row",
                    padding: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: sel ? "#22d3ee" : "#64748b",
                    backgroundColor: sel ? "rgba(34,211,238,0.15)" : "#1e293b",
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      borderWidth: 2,
                      borderColor: sel ? "#22d3ee" : "#64748b",
                      marginRight: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 4,
                    }}
                  >
                    {sel && (
                      <View
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 999,
                          backgroundColor: "#22d3ee",
                        }}
                      />
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#e2e8f0", fontSize: 16 }}>{ch.title}</Text>

                    <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>
                      {formatRecurrenceFromRuleId(ch.ruleId)} •{" "}
                      <Text style={{ color: "#e2e8f0" }}>{niceDate(ch.dueAt)}</Text>
                    </Text>

                    <Text style={{ color: "#a78bfa", fontSize: 12, marginTop: 4 }}>
                      Nagroda: +{ch.expValue} EXP
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View
            style={{
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: "rgba(148,163,184,0.3)",
              flexDirection: "row",
              gap: 12,
            }}
          >
            <Pressable
              onPress={rejectAll}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#64748b",
                backgroundColor: "#0f172a",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#e2e8f0", fontWeight: "700" }}>Odrzuć wszystkie</Text>
            </Pressable>

            <Pressable
              onPress={submit}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 999,
                backgroundColor: "#22d3ee",
                borderWidth: 1,
                borderColor: "#0e7490",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#022c22", fontWeight: "900" }}>Zatwierdź wybór</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export const NoweWyzwanieModal = NoweWyzwanieModalRN;

// src/context/nowewyzwanie.tsx
