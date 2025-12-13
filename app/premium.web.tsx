import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { useThemeColors } from "../src/context/ThemeContext";
import { auth, db } from "../src/firebase/firebase";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";

try {
  WebBrowser.maybeCompleteAuthSession();
} catch {}

/** ====== Plans ====== */
const PLANS = {
  monthly: { title: "Miesięczny", priceLabel: "25 zł / mies.", amountPln: 25 },
  yearly: { title: "Roczny", priceLabel: "100 zł / rok", amountPln: 100 },
};
type PlanId = keyof typeof PLANS;

const PrimaryBlue = "#3B82F6";
const PremiumGold = "#FBBF24";
const SuccessGreen = "#22C55E";
const DangerRed = "#EF4444";

/** ====== API ====== */
const ENV_BASE = (process.env.EXPO_PUBLIC_PAYMENTS_BASE || "").trim();
const ENV_KEY = (process.env.EXPO_PUBLIC_PAYMENTS_API_KEY || "").trim();
const STRIPE_RETURN_HTTPS = (process.env.EXPO_PUBLIC_STRIPE_RETURN_HTTPS || "").trim();

let RESOLVED_BASE: string | null = null;

function buildUrl(base: string, path: string, qs?: Record<string, any>) {
  const u = `${base.replace(/\/+$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
  if (!qs) return u;
  const sp = new URLSearchParams();
  Object.entries(qs).forEach(([k, v]) => {
    if (v == null) return;
    sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `${u}?${s}` : u;
}

function isJsonContentType(ct: string | null | undefined) {
  const s = String(ct || "").toLowerCase();
  return s.includes("application/json") || s.includes("application/problem+json");
}

async function readJsonOrThrow(res: Response) {
  const ct = res.headers.get("content-type");
  const text = await res.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!isJsonContentType(ct) || json == null) {
    const snippet = (text || "").slice(0, 220);
    throw new Error(`API zwróciło nie-JSON (content-type: ${ct || "brak"}). Snippet: ${snippet}`);
  }

  if (!res.ok) {
    throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
  }

  return json;
}

async function probeHealth(base: string) {
  try {
    const url = buildUrl(base, "/rpc/healthz", { t: Date.now() });
    const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
    const json = await readJsonOrThrow(res);
    if (json?.ok !== true) return { ok: false as const, reason: "healthz: ok!=true" };
    return { ok: true as const, json };
  } catch (e: any) {
    return { ok: false as const, reason: e?.message || "probe failed" };
  }
}

async function resolveBaseOnce(): Promise<string> {
  if (RESOLVED_BASE) return RESOLVED_BASE;

  const candidates: string[] = [];
  if (ENV_BASE) candidates.push(ENV_BASE);

  if (Platform.OS === "web") candidates.push("/paymentsApi");

  const proj = (globalThis as any).__FIREBASE_DEFAULT_PROJECT_ID__ || "";
  if (proj) {
    candidates.push(`http://localhost:5001/${proj}/europe-central2/paymentsApi`);
    candidates.push(`http://127.0.0.1:5001/${proj}/europe-central2/paymentsApi`);
  }
  candidates.push("http://localhost:8082/paymentsApi");
  candidates.push("http://127.0.0.1:8082/paymentsApi");

  const errors: string[] = [];

  for (const base of candidates) {
    const r = await probeHealth(base);
    if (r.ok) {
      RESOLVED_BASE = base;
      return base;
    }
    errors.push(`- ${base}: ${r.reason}`);
  }

  throw new Error(`Nie mogę połączyć z API płatności. Próbowano:\n${errors.join("\n")}`);
}

async function authHeaders() {
  const u = auth.currentUser;
  if (!u) return {};
  const token = await u.getIdToken(true);
  return { Authorization: `Bearer ${token}` };
}

async function apiPost<T = any>(path: string, body: any): Promise<T> {
  const base = await resolveBaseOnce();
  const url = buildUrl(base, path);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(ENV_KEY ? { "X-API-Key": ENV_KEY } : {}),
      ...(await authHeaders()),
    },
    body: JSON.stringify(body || {}),
  });

  const json = await readJsonOrThrow(res);
  return (json as T) ?? ({} as T);
}

async function apiGet<T = any>(path: string, qs?: Record<string, any>): Promise<T> {
  const base = await resolveBaseOnce();
  const url = buildUrl(base, path, qs);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(ENV_KEY ? { "X-API-Key": ENV_KEY } : {}),
      ...(await authHeaders()),
    },
  });

  const json = await readJsonOrThrow(res);
  return (json as T) ?? ({} as T);
}

/** RPC */
async function createPaymentIntent(payload: any) {
  return apiPost("/rpc/createPaymentIntent", payload);
}
async function getPaymentStatus(args: { paymentIntentId?: string; sessionId?: string }) {
  return apiPost("/rpc/getPaymentIntentStatus", args);
}
async function finalizePayment(args: { paymentIntentId?: string; sessionId?: string }) {
  return apiPost("/rpc/finalizePayment", args);
}
async function getUserPremium(uid: string) {
  return apiGet("/rpc/userPremium", { uid });
}

/** Helpers */
function toDateSafe(v: any): Date | null {
  try {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (v instanceof Timestamp) return v.toDate();
    if (typeof v?.toDate === "function") return v.toDate();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    if (typeof v === "string") {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
}

function cleanWebQueryParams(keys: string[]) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    keys.forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, "", url.toString());
  } catch {}
}

export default function PremiumScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    session_id?: string;
    payment_intent?: string;
    cancelled?: string;
  }>();

  const { colors } = useThemeColors();

  const [authReady, setAuthReady] = useState(false);

  const [isPremium, setIsPremium] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState<Date | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [payModal, setPayModal] = useState<{ open: boolean; planId: PlanId | null }>({
    open: false,
    planId: null,
  });

  // ładny modal alertu zamiast window.alert
  const [alertState, setAlertState] = useState<{
    open: boolean;
    title: string;
    message: string;
  }>({ open: false, title: "", message: "" });

  const showNiceAlert = useCallback((title: string, message: string) => {
    if (Platform.OS === "web") {
      setAlertState({ open: true, title, message });
      return;
    }
    Alert.alert(title, message);
  }, []);

  const closeNiceAlert = () => {
    setAlertState((prev) => ({ ...prev, open: false }));
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(() => setAuthReady(true));
    return () => unsub();
  }, []);

  const uid = auth.currentUser?.uid || null;

  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setIsPremium(false);
          setPremiumUntil(null);
          return;
        }
        const d: any = snap.data();
        setIsPremium(!!d?.isPremium);
        setPremiumUntil(toDateSafe(d?.premiumUntil));
      },
      () => {}
    );
    return () => unsub();
  }, [uid]);

  const premiumUntilText = premiumUntil ? premiumUntil.toLocaleDateString("pl-PL") : null;

  const handleReturn = useCallback(
    async (args: { sessionId?: string; paymentIntentId?: string; cancelled?: boolean }) => {
      if (args.cancelled) {
        setErr("Płatność została anulowana.");
        return;
      }
      if (!args.sessionId && !args.paymentIntentId) return;

      try {
        setBusy(true);
        setErr("");

        const stat = await getPaymentStatus({
          sessionId: args.sessionId || undefined,
          paymentIntentId: args.paymentIntentId || undefined,
        });

        const status = String(stat?.status || "");

        if (status === "processing") {
          showNiceAlert("Płatność w trakcie ⏳", "Stripe jeszcze potwierdza płatność.");
          return;
        }

        if (status === "succeeded") {
          const fin = await finalizePayment({
            sessionId: args.sessionId || undefined,
            paymentIntentId: args.paymentIntentId || undefined,
          });

          if (fin?.ok) {
            let untilLabel: string | null = null;
            if (fin?.premiumUntil) {
              const d = new Date(fin.premiumUntil);
              if (!Number.isNaN(d.getTime())) untilLabel = d.toLocaleDateString("pl-PL");
            }
            showNiceAlert("Premium aktywne ✅", untilLabel || "Płatność przyjęta.");
            return;
          }

          setErr(fin?.status ? `Status płatności: ${fin.status}` : "Nie udało się sfinalizować płatności.");
          return;
        }

        if (status === "requires_payment_method" || status === "requires_action") {
          setErr("Płatność nie została ukończona.");
          return;
        }

        setErr(`Status płatności: ${status}`);
      } catch (e: any) {
        setErr(e?.message || "Błąd weryfikacji płatności.");
      } finally {
        setBusy(false);
      }
    },
    [showNiceAlert]
  );

  useEffect(() => {
    const cancelled = params?.cancelled === "1";
    const sessionId = params?.session_id ? String(params.session_id) : "";
    const paymentIntentId = params?.payment_intent ? String(params.payment_intent) : "";

    if (!sessionId && !paymentIntentId && !cancelled) return;

    (async () => {
      await handleReturn({
        sessionId: sessionId || undefined,
        paymentIntentId: paymentIntentId || undefined,
        cancelled,
      });

      if (Platform.OS === "web") {
        cleanWebQueryParams(["session_id", "payment_intent", "payment_intent_client_secret", "cancelled"]);
      } else {
        try {
          router.replace("/premium");
        } catch {}
      }
    })();
  }, [params?.session_id, params?.payment_intent, params?.cancelled, handleReturn, router]);

  const openPlan = (planId: PlanId) => {
    if (!authReady) {
      showNiceAlert("Chwila", "Ładowanie sesji…");
      return;
    }
    if (!auth.currentUser) {
      showNiceAlert("Zaloguj się", "Musisz być zalogowany.");
      return;
    }
    setErr("");
    setPayModal({ open: true, planId });
  };

  const closePayModal = () => setPayModal({ open: false, planId: null });

  const doCheckout = async () => {
    if (!payModal.planId) return;

    try {
      setBusy(true);
      setErr("");

      const u = auth.currentUser;
      if (!u) throw new Error("Zaloguj się, aby wykupić Premium.");

      const appReturn = Linking.createURL("/premium");

      const returnUrl =
        Platform.OS === "web" && typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}`
          : (() => {
              if (!STRIPE_RETURN_HTTPS || !/^https?:\/\//i.test(STRIPE_RETURN_HTTPS)) {
                throw new Error("Brak EXPO_PUBLIC_STRIPE_RETURN_HTTPS.");
              }
              const glue = STRIPE_RETURN_HTTPS.includes("?") ? "&" : "?";
              return `${STRIPE_RETURN_HTTPS}${glue}appReturn=${encodeURIComponent(appReturn)}`;
            })();

      const payload = {
        planId: payModal.planId,
        returnUrl,
        customerEmail: u.email || undefined,
        customerName: u.displayName || "Użytkownik",
      };

      const r = await createPaymentIntent(payload);

      const redirectUrl =
        r?.redirectUrl ||
        r?.url ||
        r?.redirect_url ||
        r?.data?.redirectUrl ||
        r?.data?.url ||
        null;

      if (!redirectUrl) {
        throw new Error("Brak redirectUrl z backendu.");
      }

      closePayModal();

      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = redirectUrl;
      } else {
        await WebBrowser.openBrowserAsync(redirectUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
      }
    } catch (e: any) {
      const msg = e?.message || "Błąd inicjalizacji płatności.";
      setErr(msg);
      showNiceAlert("Płatność", msg);
    } finally {
      setBusy(false);
    }
  };

  const refreshPremiumNow = async () => {
    if (!uid) return showNiceAlert("Brak sesji", "Zaloguj się ponownie.");
    try {
      setBusy(true);
      setErr("");
      const r = await getUserPremium(uid);
      const until = r?.premiumUntil ? new Date(r.premiumUntil) : null;
      showNiceAlert(
        "Status Premium",
        r?.isPremium && until ? `Aktywne do: ${until.toLocaleDateString("pl-PL")}` : "Premium nieaktywne."
      );
    } catch (e: any) {
      setErr(e?.message || "Nie udało się odświeżyć statusu Premium.");
    } finally {
      setBusy(false);
    }
  };

  /** ====== UI ====== */
  const perks = [
    { icon: "people" as const, title: "Rodzina MAX", desc: "Do 6 osób łącznie (Ty + 5)." },
    { icon: "person-add" as const, title: "Zapraszaj znajomych", desc: "Dodawaj członków rodziny spośród znajomych." },
    { icon: "chatbubble-ellipses" as const, title: "Wiadomości i zadania", desc: "Wspólne funkcje zadań i wiadomości z rodziną." },
    { icon: "ribbon" as const, title: "Odznaka Premium", desc: "Wyróżnienie w profilu." },
  ];

  const yearlyValue = useMemo(() => {
    const yearly = PLANS.yearly.amountPln;
    const monthlyYear = PLANS.monthly.amountPln * 12;
    const save = Math.max(0, monthlyYear - yearly);
    const pct = monthlyYear > 0 ? Math.round((save / monthlyYear) * 100) : 0;
    return { monthlyYear, save, pct };
  }, []);

  const ui = useMemo(() => {
    const r = 24;

    const card = {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: r,
    };

    const shadow = {
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    };

    const pill = (bg: string, border: string) => ({
      backgroundColor: bg,
      borderColor: border,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
    });

    const h1 = { color: colors.text, fontWeight: "900" as const, fontSize: 22 };
    const h2 = { color: colors.text, fontWeight: "900" as const, fontSize: 16 };
    const sub = { color: colors.textMuted, fontWeight: "700" as const, fontSize: 13, lineHeight: 18 };

    return { r, card, shadow, pill, h1, h2, sub };
  }, [colors]);

  const SectionHeader = ({ icon, title, hint }: { icon: any; title: string; hint?: string }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <Ionicons name={icon} size={18} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ui.h2}>{title}</Text>
        {!!hint && <Text style={[ui.sub, { marginTop: 2 }]}>{hint}</Text>}
      </View>
    </View>
  );

  const PlanCard = ({
    planId,
    highlighted,
    badge,
    badgeTone,
  }: {
    planId: PlanId;
    highlighted?: boolean;
    badge?: string;
    badgeTone?: "gold" | "blue" | "muted";
  }) => {
    const plan = PLANS[planId];

    const badgeColors =
      badgeTone === "gold"
        ? { bg: "rgba(251,191,36,0.18)", border: "rgba(251,191,36,0.35)", text: PremiumGold }
        : badgeTone === "blue"
        ? { bg: "rgba(59,130,246,0.16)", border: "rgba(59,130,246,0.30)", text: PrimaryBlue }
        : { bg: "rgba(148,163,184,0.14)", border: "rgba(148,163,184,0.25)", text: colors.textMuted };

    return (
      <Pressable
        onPress={() => openPlan(planId)}
        style={{
          ...ui.card,
          ...ui.shadow,
          padding: 16,
          borderColor: highlighted ? "rgba(251,191,36,0.65)" : colors.border,
          backgroundColor: colors.card,
        }}
      >
        {/* top row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: highlighted ? "rgba(251,191,36,0.16)" : "rgba(59,130,246,0.12)",
              borderWidth: 1,
              borderColor: highlighted ? "rgba(251,191,36,0.35)" : "rgba(59,130,246,0.25)",
            }}
          >
            <Ionicons name={highlighted ? "sparkles" : "flash"} size={18} color={highlighted ? PremiumGold : PrimaryBlue} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>{plan.title}</Text>
            <Text style={{ color: colors.textMuted, fontWeight: "700", marginTop: 3 }}>{plan.priceLabel}</Text>
          </View>

          {!!badge && (
            <View
              style={{
                backgroundColor: badgeColors.bg,
                borderColor: badgeColors.border,
                borderWidth: 1,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: badgeColors.text, fontWeight: "900", fontSize: 12 }}>{badge}</Text>
            </View>
          )}
        </View>

        {/* price row */}
        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "flex-end" }}>
          <Text style={{ color: colors.text, fontWeight: "950", fontSize: 22 }}>
            {plan.amountPln.toFixed(0)} zł
          </Text>
          <Text style={{ color: colors.textMuted, fontWeight: "800", marginLeft: 6, marginBottom: 2 }}>
            {planId === "monthly" ? "/ mies." : "/ rok"}
          </Text>
          <View style={{ flex: 1 }} />
          <LinearGradient
            colors={highlighted ? ["#FBBF24", "#F59E0B"] : ["#3B82F6", "#2563EB"]}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
              opacity: busy ? 0.75 : 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="lock-closed" size={16} color="#fff" />}
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>
              {busy ? "..." : "Wybieram"}
            </Text>
          </LinearGradient>
        </View>

        {/* microcopy */}
        <Text style={{ color: colors.textMuted, marginTop: 10, lineHeight: 18 }}>
          Bezpieczna płatność przez Stripe Checkout (P24 / BLIK / karta).
        </Text>
      </Pressable>
    );
  };

  const niceOverlayStyle: any =
    Platform.OS === "web"
      ? ({
          backdropFilter: "blur(10px)",
        } as any)
      : null;

  const PayModalContent = (
    <View
      style={{
        ...ui.card,
        ...ui.shadow,
        width: "100%",
        maxWidth: 540,
        padding: 18,
      }}
    >
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <LinearGradient
          colors={["rgba(251,191,36,0.25)", "rgba(59,130,246,0.15)"]}
          style={{
            width: 42,
            height: 42,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(251,191,36,0.35)",
          }}
        >
          <Ionicons name="sparkles" size={18} color={PremiumGold} />
        </LinearGradient>

        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "950", fontSize: 16 }}>Finalizacja Premium</Text>
          <Text style={{ color: colors.textMuted, fontWeight: "700", marginTop: 2 }}>
            Za chwilę przejdziesz do bezpiecznej płatności.
          </Text>
        </View>

        <TouchableOpacity onPress={closePayModal} style={{ padding: 6 }} activeOpacity={0.8}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* plan summary */}
      <View
        style={{
          marginTop: 16,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
          padding: 14,
        }}
      >
        <Text style={{ color: colors.textMuted, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 }}>
          WYBRANY PLAN
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
          <Text style={{ color: colors.text, fontWeight: "950", fontSize: 18, flex: 1 }}>
            {payModal.planId ? PLANS[payModal.planId].title : "—"}
          </Text>
          <View
            style={{
              backgroundColor: "rgba(59,130,246,0.12)",
              borderColor: "rgba(59,130,246,0.22)",
              borderWidth: 1,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Ionicons name="shield-checkmark" size={14} color={PrimaryBlue} />
            <Text style={{ color: PrimaryBlue, fontWeight: "900", fontSize: 12 }}>Stripe</Text>
          </View>
        </View>

        <Text style={{ color: colors.textMuted, marginTop: 8 }}>
          Do zapłaty:{" "}
          <Text style={{ color: colors.text, fontWeight: "950" }}>
            {payModal.planId ? `${PLANS[payModal.planId].amountPln.toFixed(2)} PLN` : "—"}
          </Text>
        </Text>
      </View>

      {!!err && <Text style={{ color: DangerRed, marginTop: 12, fontWeight: "900" }}>{err}</Text>}

      {/* CTA */}
      <TouchableOpacity onPress={doCheckout} disabled={busy} activeOpacity={0.9} style={{ marginTop: 16 }}>
        <LinearGradient
          colors={["#3B82F6", "#2563EB"]}
          style={{
            paddingVertical: 14,
            borderRadius: 16,
            alignItems: "center",
            opacity: busy ? 0.7 : 1,
            flexDirection: "row",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="card" size={18} color="#fff" />}
          <Text style={{ color: "#fff", fontWeight: "950", fontSize: 15 }}>
            Przejdź do płatności (P24 / BLIK / karta)
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={closePayModal}
        style={{ marginTop: 12, paddingVertical: 10, alignItems: "center" }}
        disabled={busy}
      >
        <Text style={{ color: colors.textMuted, fontWeight: "800" }}>Anuluj</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 36,
          width: "100%",
          maxWidth: 920,
          alignSelf: Platform.OS === "web" ? "center" : "stretch",
          gap: 14,
        }}
      >
        {/* TOP BAR */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 6, paddingRight: 8 }}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "950" }}>Premium</Text>

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            onPress={refreshPremiumNow}
            style={ui.pill("rgba(148,163,184,0.10)", "rgba(148,163,184,0.22)")}
            activeOpacity={0.9}
          >
            <Ionicons name="refresh" size={18} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: "950" }}>Sprawdź</Text>
          </TouchableOpacity>
        </View>

        {/* HERO */}
        <View style={{ ...ui.card, ...ui.shadow, overflow: "hidden" }}>
          <LinearGradient
            colors={["rgba(59,130,246,0.22)", "rgba(251,191,36,0.14)", colors.card]}
            style={{ padding: 16 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <LinearGradient
                colors={["#3B82F6", "#2563EB"]}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="sparkles" size={22} color="#fff" />
              </LinearGradient>

              <View style={{ flex: 1 }}>
                <Text style={ui.h1}>Odblokuj tryb Premium</Text>
                <Text style={[ui.sub, { marginTop: 4 }]}>
                  Więcej możliwości dla Ciebie i Twojej rodziny — bez kombinowania.
                </Text>
              </View>
            </View>

            {/* status row */}
            <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" as any }}>
              <View
                style={{
                  backgroundColor: isPremium ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.14)",
                  borderColor: isPremium ? "rgba(34,197,94,0.28)" : "rgba(239,68,68,0.22)",
                  borderWidth: 1,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons
                  name={isPremium ? "checkmark-circle" : "close-circle"}
                  size={16}
                  color={isPremium ? SuccessGreen : DangerRed}
                />
                <Text style={{ color: colors.text, fontWeight: "950" }}>
                  {isPremium ? "Premium aktywne" : "Premium nieaktywne"}
                </Text>
              </View>

              {isPremium && premiumUntilText ? (
                <View style={ui.pill("rgba(251,191,36,0.14)", "rgba(251,191,36,0.26)")}>
                  <Ionicons name="calendar" size={16} color={PremiumGold} />
                  <Text style={{ color: colors.text, fontWeight: "950" }}>Do: {premiumUntilText}</Text>
                </View>
              ) : (
                <View style={ui.pill("rgba(59,130,246,0.12)", "rgba(59,130,246,0.22)")}>
                  <Ionicons name="shield-checkmark" size={16} color={PrimaryBlue} />
                  <Text style={{ color: colors.text, fontWeight: "950" }}>Płatność Stripe</Text>
                </View>
              )}
            </View>

            {!!err && <Text style={{ color: DangerRed, marginTop: 10, fontWeight: "900" }}>{err}</Text>}
          </LinearGradient>
        </View>

        {/* BENEFITS */}
        <View style={{ ...ui.card, ...ui.shadow, padding: 16 }}>
          <SectionHeader icon="gift" title="Co dostajesz w Premium" hint="Najważniejsze benefity w jednym miejscu." />

          <View style={{ marginTop: 14, gap: 12 }}>
            {perks.map((p, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: 12,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bg,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(251,191,36,0.14)",
                    borderWidth: 1,
                    borderColor: "rgba(251,191,36,0.24)",
                    marginTop: 1,
                  }}
                >
                  <Ionicons name={p.icon} size={18} color={PremiumGold} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "950", fontSize: 15 }}>{p.title}</Text>
                  <Text style={{ color: colors.textMuted, marginTop: 4, lineHeight: 18 }}>{p.desc}</Text>
                </View>

                <Ionicons name="checkmark-circle" size={18} color={SuccessGreen} style={{ marginTop: 4 }} />
              </View>
            ))}
          </View>

          <View
            style={{
              marginTop: 14,
              flexDirection: "row",
              flexWrap: "wrap" as any,
              gap: 10,
            }}
          >
            <View style={ui.pill("rgba(148,163,184,0.10)", "rgba(148,163,184,0.22)")}>
              <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
              <Text style={{ color: colors.text, fontWeight: "900" }}>Dane płatności poza apką</Text>
            </View>
            <View style={ui.pill("rgba(59,130,246,0.12)", "rgba(59,130,246,0.22)")}>
              <Ionicons name="flash" size={16} color={PrimaryBlue} />
              <Text style={{ color: colors.text, fontWeight: "900" }}>Aktywacja po potwierdzeniu</Text>
            </View>
          </View>
        </View>

        {/* PLANS */}
        <View style={{ ...ui.card, ...ui.shadow, padding: 16 }}>
          <SectionHeader
            icon="pricetag"
            title="Wybierz plan"
            hint={
              yearlyValue.save > 0
                ? `Roczny opłaca się najbardziej: oszczędzasz ~${yearlyValue.save} zł (${yearlyValue.pct}%).`
                : "Wybierz plan dopasowany do Ciebie."
            }
          />

          {!authReady ? (
            <Text style={{ color: colors.textMuted, marginTop: 10, fontWeight: "900" }}>Ładowanie sesji…</Text>
          ) : null}

          <View style={{ marginTop: 14, gap: 14 }}>
            <PlanCard planId="yearly" highlighted badge="Najlepsza wartość" badgeTone="gold" />
            <PlanCard planId="monthly" badge="Elastycznie" badgeTone="blue" />
          </View>

          <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="information-circle" size={18} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, lineHeight: 18, flex: 1 }}>
                Po kliknięciu przejdziesz do Stripe Checkout. Aplikacja nie przechowuje danych karty.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* PAY MODAL */}
      {Platform.OS === "web" ? (
        payModal.open ? (
          <View
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              zIndex: 9999,
            }}
            pointerEvents="box-none"
          >
            <Pressable
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.55)",
                justifyContent: "center",
                alignItems: "center",
                padding: 16,
                ...(niceOverlayStyle || {}),
              }}
              onPress={closePayModal}
            >
              <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%", alignItems: "center" }}>
                {PayModalContent}
              </Pressable>
            </Pressable>
          </View>
        ) : null
      ) : (
        <Modal visible={payModal.open} transparent animationType="fade" onRequestClose={closePayModal}>
          <Pressable
            onPress={closePayModal}
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.55)",
              padding: 16,
              justifyContent: "center",
            }}
          >
            <Pressable onPress={() => {}} style={{ width: "100%", alignItems: "center" }}>
              {PayModalContent}
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* NICE ALERT MODAL (web) */}
      {alertState.open && Platform.OS === "web" && (
        <View
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            zIndex: 10000,
            ...(niceOverlayStyle || {}),
          }}
        >
          <View style={{ ...ui.card, ...ui.shadow, maxWidth: 440, width: "100%", padding: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <LinearGradient
                colors={["rgba(251,191,36,0.22)", "rgba(59,130,246,0.14)"]}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(251,191,36,0.30)",
                }}
              >
                <Ionicons name="sparkles" size={18} color={PremiumGold} />
              </LinearGradient>

              <Text style={{ fontSize: 18, fontWeight: "950", color: colors.text, flex: 1 }}>
                {alertState.title}
              </Text>

              <Pressable onPress={closeNiceAlert} hitSlop={8} style={{ padding: 6 }}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={{ marginTop: 12, color: colors.text, lineHeight: 20 }}>{alertState.message}</Text>

            <Pressable onPress={closeNiceAlert} style={{ marginTop: 16 }}>
              <LinearGradient
                colors={["#3B82F6", "#2563EB"]}
                style={{
                  paddingVertical: 12,
                  borderRadius: 16,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "950", fontSize: 15 }}>OK</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      )}

      {/* Busy overlay */}
      {busy && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.14)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              ...ui.card,
              ...ui.shadow,
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderRadius: 20,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.text, fontWeight: "950" }}>Przetwarzam…</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

//src/app/premium.tsx
