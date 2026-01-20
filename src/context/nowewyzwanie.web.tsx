import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal, ScrollView, Text, View, Pressable, Platform } from "react-native";
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
import { useThemeColors } from "./ThemeContext";

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
  hasResolvedToday: boolean;
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

function todayYMDLocal() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
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

async function stampDecisionResolvedToday(uid: string) {
  const day = todayYMDLocal();
  try {
    await setDoc(
      doc(db, `users/${uid}`),
      {
        lastChallengeDecisionDay: day,
        lastChallengeDecisionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.error("[NoweWyzwanie] stampDecisionResolvedToday error", e);
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

  // blokada dopiero po decyzji usera
  const [lastDecisionDay, setLastDecisionDay] = useState<string | null>(null);

  // nie spamujemy w tej samej sesji, ale po refresh ma wrócić
  const presentedOnceRef = useRef(false);

  const hasResolvedToday = useMemo(() => {
    if (!lastDecisionDay) return false;
    return lastDecisionDay === todayYMDLocal();
  }, [lastDecisionDay]);

  /* AUTH */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      setChallenges([]);
      setIsOpen(false);
      setLastDecisionDay(null);
      presentedOnceRef.current = false;
    });
    return unsub;
  }, []);

  /* 0) Generate daily challenges */
  useEffect(() => {
    if (!user?.uid) return;
    if (!user.emailVerified) return;

    const url =
      "https://europe-central2-domowe-443e7.cloudfunctions.net/generateDailyChallenges";

    fetch(`${url}?uid=${user.uid}`).catch((e) =>
      console.error("[DailyChallenges ERROR]", e)
    );
  }, [user?.uid, user?.emailVerified]);

  /* 1) User meta: last decision day */
  useEffect(() => {
    if (!user?.uid || !user.emailVerified) return;

    return onSnapshot(
      doc(db, `users/${user.uid}`),
      (snap) => {
        const d: any = snap.data() || {};
        setLastDecisionDay(d?.lastChallengeDecisionDay ?? null);
      },
      (err) => console.error("[NoweWyzwanie] user meta error:", err)
    );
  }, [user?.uid, user?.emailVerified]);

  /* 2) Listen for PENDING */
  useEffect(() => {
    if (!user?.uid || !user.emailVerified) return;

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

        setChallenges(list);

        if (list.length === 0) {
          setIsOpen(false);
          presentedOnceRef.current = false;
          return;
        }

        // ma wracać zawsze dopóki user nie podejmie decyzji
        if (hasResolvedToday) return;

        // ale w jednej sesji nie otwieramy 500 razy
        if (presentedOnceRef.current) return;

        presentedOnceRef.current = true;

        try {
          await Promise.all(idsToMark.map((id) => markPresented(user.uid, id)));
        } catch (e) {
          console.error("[NoweWyzwanie] autopopup error", e);
        }

        setIsOpen(true);
      },
      (err) => console.error("[NoweWyzwanie] snapshot error:", err)
    );
  }, [user?.uid, user?.emailVerified, hasResolvedToday]);

  /* HANDLERS */
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

      // blokujemy dopiero po decyzji
      await stampDecisionResolvedToday(user.uid);
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

    if (list.length > 0) {
      await Promise.all(idsToMark.map((id) => markPresented(user.uid, id)));
      setIsOpen(true);
    }
  };

  const value = useMemo(
    () => ({
      user,
      isOpen,
      loading,
      hasResolvedToday,
      challenges,
      open,
      close,
      accept,
      decline,
      submitSelection,
      refresh,
    }),
    [user, isOpen, loading, hasResolvedToday, challenges]
  );

  return (
    <NoweWyzwanieContext.Provider value={value}>
      {children}
    </NoweWyzwanieContext.Provider>
  );
}

/* ----------------------------------------------------
   HOOK
---------------------------------------------------- */
export function useNoweWyzwanie() {
  const ctx = useContext(NoweWyzwanieContext);
  if (!ctx) throw new Error("useNoweWyzwanie must be used within NoweWyzwanieProvider");
  return ctx;
}

/* ----------------------------------------------------
   THEME HELPERS FOR MODAL
---------------------------------------------------- */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (!(h.length === 3 || h.length === 6)) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgba(hex: string, a: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${a})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
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

function onColorForHex(hex: string) {
  const L = clamp01(relativeLuminance(hex));
  return L > 0.6 ? "#0b1020" : "#ffffff";
}

/* ----------------------------------------------------
   MODAL
---------------------------------------------------- */

export const NoweWyzwanieModalRN = () => {
  const { isOpen, challenges, submitSelection } = useNoweWyzwanie();
  const { colors, isDark } = useThemeColors();

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmDecline, setConfirmDecline] = useState(false);

  const webNoOutline =
    Platform.OS === "web"
      ? ({ outlineStyle: "none", outlineWidth: 0 } as any)
      : {};

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

  const niceDate = (d: Date) =>
    new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);

  const overlayBg = isDark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.35)";
  const cardBg = colors.card;
  const border = colors.border; // ✅ może być rgba(...)
  const text = colors.text;
  const muted = colors.textMuted;
  const accent = colors.accent;

  const listTileBase = isDark ? rgba("#ffffff", 0.04) : rgba("#000000", 0.04);

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View
        style={{
          flex: 1,
          backgroundColor: overlayBg,
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          ...webNoOutline,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 600,
            maxHeight: "80%",
            borderRadius: 18,
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor: border,
            overflow: "hidden",
            ...webNoOutline,
          }}
        >
          {/* HEADER */}
          <View
            style={{
              padding: 18,
              borderBottomWidth: 1,
              borderBottomColor: border, // ✅ fix
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: "800", color: text }}>
              Dzisiejsze propozycje ✨
            </Text>
            <Text style={{ marginTop: 4, color: muted, fontSize: 13 }}>
              Zaznacz, które spośród 12 zadań chcesz dzisiaj dodać.
            </Text>
          </View>

          {/* LISTA */}
          <ScrollView
            style={{ flex: 1, ...webNoOutline }}
            contentContainerStyle={{ padding: 18, gap: 10 }}
          >
            {challenges.map((ch) => {
              const sel = selected[ch.id];

              const tileBg = sel ? rgba(accent, isDark ? 0.14 : 0.18) : listTileBase;
              const tileBorder = sel ? accent : border; // ✅ fix

              return (
                <Pressable
                  key={ch.id}
                  onPress={() => toggle(ch.id)}
                  style={{
                    flexDirection: "row",
                    padding: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: tileBorder,
                    backgroundColor: tileBg,
                    ...webNoOutline,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      borderWidth: 2,
                      borderColor: sel ? accent : border, // ✅ fix
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
                          backgroundColor: accent,
                        }}
                      />
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: text, fontSize: 16, fontWeight: "700" }}>
                      {ch.title}
                    </Text>

                    <Text style={{ color: muted, fontSize: 12, marginTop: 2 }}>
                      {formatRecurrenceFromRuleId(ch.ruleId)} •{" "}
                      <Text style={{ color: text }}>{niceDate(ch.dueAt)}</Text>
                    </Text>

                    <Text
                      style={{
                        color: accent,
                        fontSize: 12,
                        marginTop: 6,
                        fontWeight: "700",
                      }}
                    >
                      Nagroda: +{ch.expValue} EXP
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* BUTTONY */}
          <View
            style={{
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: border, // ✅ fix
              flexDirection: "row",
              gap: 12,
              ...webNoOutline,
            }}
          >
            <Pressable
              onPress={() => setConfirmDecline(true)}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: border, // ✅ fix
                backgroundColor: rgba(colors.bg, isDark ? 0.25 : 0.4),
                alignItems: "center",
                ...webNoOutline,
              }}
            >
              <Text style={{ color: text, fontWeight: "800" }}>
                Odrzuć wszystkie
              </Text>
            </Pressable>

            <Pressable
              onPress={submit}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 999,
                backgroundColor: accent,
                borderWidth: 1,
                borderColor: rgba(accent, 0.7),
                alignItems: "center",
                ...webNoOutline,
              }}
            >
              <Text style={{ color: onColorForHex(accent), fontWeight: "900" }}>
                Zatwierdź wybór
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* MODAL POTWIERDZENIA */}
      <Modal
        visible={confirmDecline}
        transparent
        animationType="fade"
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <View
          style={{
            flex: 1,
            backgroundColor: isDark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.45)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
            ...webNoOutline,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 380,
              backgroundColor: cardBg,
              padding: 22,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: border,
              ...webNoOutline,
            }}
          >
            <Text style={{ color: text, fontSize: 18, fontWeight: "900" }}>
              Odrzucić wyzwanie?
            </Text>

            <Text style={{ color: muted, marginTop: 10 }}>
              Kolejna szansa pojawi się dopiero jutro.
              Na pewno chcesz odrzucić?
            </Text>

            <View
              style={{
                flexDirection: "row",
                gap: 12,
                marginTop: 22,
                ...webNoOutline,
              }}
            >
              <Pressable
                onPress={() => setConfirmDecline(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: border,
                  alignItems: "center",
                  backgroundColor: rgba(colors.bg, isDark ? 0.25 : 0.4),
                  ...webNoOutline,
                }}
              >
                <Text style={{ color: text, fontWeight: "800" }}>
                  Anuluj
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setConfirmDecline(false);
                  submitSelection([], challenges.map((c) => c.id));
                }}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 999,
                  backgroundColor: "#ef4444",
                  borderWidth: 1,
                  borderColor: "rgba(239,68,68,0.7)",
                  alignItems: "center",
                  ...webNoOutline,
                }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>
                  Odrzuć
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

export const NoweWyzwanieModal = NoweWyzwanieModalRN;
