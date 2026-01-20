// app/premium.tsx
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
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";

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

  // ✅ Bezpieczne fallbacki (bo w ThemeContext często nazwy się różnią)
  const c: any = useMemo(() => {
    return {
      bg: (colors as any)?.bg ?? (colors as any)?.background ?? "#0B1220",
      card: (colors as any)?.card ?? "#0F172A",
      border: (colors as any)?.border ?? "rgba(148,163,184,0.18)",
      text: (colors as any)?.text ?? "#E5E7EB",
      textMuted: (colors as any)?.textMuted ?? (colors as any)?.textSecondary ?? "rgba(226,232,240,0.65)",
      accent: (colors as any)?.accent ?? PrimaryBlue,
    };
  }, [colors]);

  const [authReady, setAuthReady] = useState(false);

  const [isPremium, setIsPremium] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState<Date | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [payModal, setPayModal] = useState<{ open: boolean; planId: PlanId | null }>({
    open: false,
    planId: null,
  });

  // ładny modal alertu zamiast window.alert (na web)
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

  const closeNiceAlert = () => setAlertState((prev) => ({ ...prev, open: false }));

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

    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }

    setPayModal({ open: true, planId });
  };

  const closePayModal = () => setPayModal({ open: false, planId: null });

  const doCheckout = async () => {
    if (!payModal.planId) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

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
        r?.redirectUrl || r?.url || r?.redirect_url || r?.data?.redirectUrl || r?.data?.url || null;

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
    { icon: "people" as const, title: "Rodzina i wspólny dom", desc: "Twórz rodzinę i zapraszaj bliskich do jednego miejsca." },
    { icon: "list" as const, title: "Wspólne zadania", desc: "Dodawajcie sobie nawzajem zadania i dzielcie obowiązki." },
    { icon: "stats-chart" as const, title: "Statystyki dla wszystkich", desc: "Wspólna statystyka postępu — widać kto dowozi." },
    { icon: "trophy" as const, title: "Rywalizacja i motywacja", desc: "Lekka rywalizacja, rankingi i dodatkowy kop do działania." },
    { icon: "chatbubble-ellipses" as const, title: "Wiadomości tekstowe", desc: "Szybka komunikacja w rodzinie bez kombinowania." },
    { icon: "rocket" as const, title: "Natychmiastowa aktywacja", desc: "Po płatności Premium aktywuje się automatycznie." },
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

    const shadowStrong = {
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 6,
    };

    const shadowSoft = {
      shadowColor: "#000",
      shadowOpacity: 0.10,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    };

    const glassCard = {
      borderRadius: r,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.10)",
      backgroundColor: "rgba(255,255,255,0.03)",
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

    const h1 = { color: c.text, fontWeight: "950" as const, fontSize: 22, letterSpacing: -0.2 };
    const h2 = { color: c.text, fontWeight: "950" as const, fontSize: 15, letterSpacing: -0.1 };
    const sub = { color: c.textMuted, fontWeight: "700" as const, fontSize: 12, lineHeight: 17 };

    return { r, shadowStrong, shadowSoft, glassCard, pill, h1, h2, sub };
  }, [c]);

  /** ✅ Mobile: 2 kafelki obok siebie */
  const screenW = Dimensions.get("window").width;
  const plansTwoCols = screenW >= 350; // bardzo wąskie telefony -> 1 kolumna
  const plansGap = 12;

  const SectionHeader = ({ icon, title, hint }: { icon: any; title: string; hint?: string }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <LinearGradient
        colors={["rgba(59,130,246,0.22)", "rgba(251,191,36,0.18)"]}
        style={{
          width: 34,
          height: 34,
          borderRadius: 13,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.14)",
        }}
      >
        <Ionicons name={icon} size={16} color={c.text} />
      </LinearGradient>

      <View style={{ flex: 1 }}>
        <Text style={ui.h2}>{title}</Text>
        {!!hint && <Text style={[ui.sub, { marginTop: 3 }]}>{hint}</Text>}
      </View>
    </View>
  );

  const PlanCard = ({
    planId,
    highlighted,
    badge,
    badgeTone,
    compact,
  }: {
    planId: PlanId;
    highlighted?: boolean;
    badge?: string;
    badgeTone?: "gold" | "blue" | "muted";
    compact?: boolean;
  }) => {
    const plan = PLANS[planId];

    const badgeColors =
      badgeTone === "gold"
        ? { bg: "rgba(251,191,36,0.14)", border: "rgba(251,191,36,0.28)", text: PremiumGold }
        : badgeTone === "blue"
        ? { bg: "rgba(59,130,246,0.14)", border: "rgba(59,130,246,0.28)", text: PrimaryBlue }
        : { bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.22)", text: c.textMuted };

    const glow = highlighted
      ? {
          borderColor: "rgba(251,191,36,0.55)",
          shadowColor: "#000",
          shadowOpacity: 0.22,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 14 },
          elevation: 7,
        }
      : {
          borderColor: "rgba(255,255,255,0.10)",
        };

    return (
      <Pressable
        onPress={() => openPlan(planId)}
        style={{
          borderRadius: ui.r,
          borderWidth: 1,
          ...glow,
          overflow: "hidden",
          backgroundColor: "rgba(255,255,255,0.02)",
        }}
      >
        <LinearGradient
          colors={
            highlighted
              ? ["rgba(251,191,36,0.14)", "rgba(59,130,246,0.10)", "rgba(255,255,255,0.03)"]
              : ["rgba(59,130,246,0.14)", "rgba(255,255,255,0.03)", "rgba(255,255,255,0.02)"]
          }
          style={{ padding: compact ? 12 : 14 }}
        >
          {/* top */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <LinearGradient
              colors={
                highlighted
                  ? ["rgba(251,191,36,0.40)", "rgba(251,191,36,0.14)"]
                  : ["rgba(59,130,246,0.32)", "rgba(59,130,246,0.12)"]
              }
              style={{
                width: compact ? 38 : 46,
                height: compact ? 38 : 46,
                borderRadius: compact ? 15 : 18,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: highlighted ? "rgba(251,191,36,0.30)" : "rgba(59,130,246,0.28)",
              }}
            >
              <Ionicons
                name={highlighted ? "sparkles" : "flash"}
                size={compact ? 16 : 18}
                color={highlighted ? PremiumGold : PrimaryBlue}
              />
            </LinearGradient>

            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: "950", fontSize: compact ? 14 : 15 }}>{plan.title}</Text>
              <Text style={{ color: c.textMuted, fontWeight: "700", marginTop: 2, fontSize: 12 }}>{plan.priceLabel}</Text>
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
                <Text style={{ color: badgeColors.text, fontWeight: "950", fontSize: 12 }}>{badge}</Text>
              </View>
            )}
          </View>

          {/* price + CTA */}
          <View style={{ marginTop: compact ? 10 : 14 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
              <Text style={{ color: c.text, fontWeight: "950", fontSize: compact ? 22 : 28, letterSpacing: -0.4 }}>
                {plan.amountPln.toFixed(0)} zł
              </Text>
              <Text style={{ color: c.textMuted, fontWeight: "800", marginLeft: 8, marginBottom: 4, fontSize: 12 }}>
                {planId === "monthly" ? "/ mies." : "/ rok"}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => openPlan(planId)}
              activeOpacity={0.9}
              disabled={busy}
              style={{ marginTop: compact ? 10 : 12 }}
            >
              <LinearGradient
                colors={highlighted ? ["#FBBF24", "#F59E0B"] : ["#3B82F6", "#2563EB"]}
                style={{
                  paddingVertical: compact ? 10 : 12,
                  borderRadius: compact ? 16 : 18,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 10,
                  opacity: busy ? 0.75 : 1,
                }}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="lock-closed" size={16} color="#fff" />}
                <Text style={{ color: "#fff", fontWeight: "950", fontSize: 14 }}>{busy ? "..." : "Wybieram"}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={{ marginTop: compact ? 8 : 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-checkmark" size={16} color={PrimaryBlue} />
              <Text style={{ color: c.textMuted, lineHeight: 17, fontSize: 12, flex: 1 }}>
                Bezpieczna płatność przez Stripe Checkout (P24 / BLIK / karta).
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    );
  };

  const PayModalContent = (
    <View
      style={{
        width: "100%",
        borderRadius: 28,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: c.card,
        ...ui.shadowStrong,
      }}
    >
      <LinearGradient
        colors={["rgba(59,130,246,0.22)", "rgba(251,191,36,0.14)", "rgba(255,255,255,0.03)"]}
        style={{ padding: 16 }}
      >
        {/* handle */}
        <View style={{ alignItems: "center", marginBottom: 10 }}>
          <View
            style={{
              width: 44,
              height: 5,
              borderRadius: 99,
              backgroundColor: "rgba(255,255,255,0.18)",
            }}
          />
        </View>

        {/* header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <LinearGradient
            colors={["rgba(251,191,36,0.30)", "rgba(59,130,246,0.18)"]}
            style={{
              width: 42,
              height: 42,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
            }}
          >
            <Ionicons name="sparkles" size={18} color={PremiumGold} />
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: "950", fontSize: 16 }}>Finalizacja Premium</Text>
            <Text style={{ color: c.textMuted, fontWeight: "700", marginTop: 3, fontSize: 12 }}>
              Za chwilę przejdziesz do bezpiecznej płatności.
            </Text>
          </View>

          <TouchableOpacity onPress={closePayModal} style={{ padding: 6 }} activeOpacity={0.8}>
            <Ionicons name="close" size={22} color={c.textMuted} />
          </TouchableOpacity>
        </View>

        {/* plan summary */}
        <View
          style={{
            marginTop: 14,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.04)",
            padding: 12,
          }}
        >
          <Text style={{ color: c.textMuted, fontWeight: "950", fontSize: 11, letterSpacing: 0.45 }}>
            WYBRANY PLAN
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
            <Text style={{ color: c.text, fontWeight: "950", fontSize: 16, flex: 1 }}>
              {payModal.planId ? PLANS[payModal.planId].title : "—"}
            </Text>

            <View
              style={{
                backgroundColor: "rgba(59,130,246,0.14)",
                borderColor: "rgba(59,130,246,0.26)",
                borderWidth: 1,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ionicons name="shield-checkmark" size={13} color={PrimaryBlue} />
              <Text style={{ color: PrimaryBlue, fontWeight: "950", fontSize: 12 }}>Stripe</Text>
            </View>
          </View>

          <Text style={{ color: c.textMuted, marginTop: 10, fontSize: 12 }}>
            Do zapłaty:{" "}
            <Text style={{ color: c.text, fontWeight: "950" }}>
              {payModal.planId ? `${PLANS[payModal.planId].amountPln.toFixed(2)} PLN` : "—"}
            </Text>
          </Text>
        </View>

        {!!err && <Text style={{ color: DangerRed, marginTop: 10, fontWeight: "950", fontSize: 12 }}>{err}</Text>}

        {/* CTA */}
        <TouchableOpacity onPress={doCheckout} disabled={busy} activeOpacity={0.9} style={{ marginTop: 14 }}>
          <LinearGradient
            colors={["#3B82F6", "#2563EB"]}
            style={{
              paddingVertical: 14,
              borderRadius: 18,
              alignItems: "center",
              opacity: busy ? 0.75 : 1,
              flexDirection: "row",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="card" size={18} color="#fff" />}
            <Text style={{ color: "#fff", fontWeight: "950", fontSize: 14 }}>
              Przejdź do płatności (P24 / BLIK / karta)
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={closePayModal} style={{ marginTop: 10, paddingVertical: 10, alignItems: "center" }} disabled={busy}>
          <Text style={{ color: c.textMuted, fontWeight: "800", fontSize: 12 }}>Anuluj</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );

  /** ====== HERO COPY ====== */
  const heroTitle = isPremium ? "Premium aktywne" : "Odblokuj Premium";
  const heroSubtitle = isPremium
    ? "Rodzina, wspólne zadania, statystyki, rywalizacja i wiadomości — wszystko odblokowane."
    : "Twórz rodzinę, dzielcie obowiązki, rywalizujcie i rozmawiajcie w jednym miejscu.";

  const heroIconGradient = isPremium ? ["#FBBF24", "#F59E0B"] : ["#3B82F6", "#2563EB"];
  const heroIconName = isPremium ? ("ribbon" as const) : ("sparkles" as const);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {/* PREMIUM BACKGROUND (mobile) */}
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
        <LinearGradient
          colors={["rgba(59,130,246,0.20)", "rgba(251,191,36,0.10)", "rgba(0,0,0,0.00)"]}
          style={{ flex: 1 }}
        />
        <View
          style={{
            position: "absolute",
            left: -140,
            top: -120,
            width: 300,
            height: 300,
            borderRadius: 999,
            backgroundColor: "rgba(59,130,246,0.18)",
          }}
        />
        <View
          style={{
            position: "absolute",
            right: -160,
            top: 40,
            width: 320,
            height: 320,
            borderRadius: 999,
            backgroundColor: "rgba(251,191,36,0.14)",
          }}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 14,
          paddingBottom: 30,
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* TOP BAR (glass mobile) */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 10,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.03)",
            ...ui.shadowSoft,
          }}
        >
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              router.back();
            }}
            style={{ paddingVertical: 6, paddingRight: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </TouchableOpacity>

          <Text style={{ color: c.text, fontSize: 18, fontWeight: "950" }}>Premium</Text>

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            onPress={refreshPremiumNow}
            style={ui.pill("rgba(255,255,255,0.06)", "rgba(255,255,255,0.10)")}
            activeOpacity={0.9}
          >
            <Ionicons name="refresh" size={17} color={c.text} />
            <Text style={{ color: c.text, fontWeight: "950", fontSize: 13 }}>Zweryfikuj status Premium</Text>
          </TouchableOpacity>
        </View>

        {/* HERO (mobile premium) */}
        <View style={{ borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
          <LinearGradient
            colors={["rgba(59,130,246,0.28)", "rgba(251,191,36,0.14)", "rgba(255,255,255,0.03)"]}
            style={{ padding: 16 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" as any }}>
              <LinearGradient
                colors={heroIconGradient}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={heroIconName} size={22} color="#fff" />
              </LinearGradient>

              <View style={{ flex: 1, minWidth: 220 }}>
                <Text style={ui.h1}>{heroTitle}</Text>
                <Text style={[ui.sub, { marginTop: 5 }]}>{heroSubtitle}</Text>
              </View>

              {isPremium && premiumUntilText ? (
                <View style={[ui.pill("rgba(251,191,36,0.14)", "rgba(251,191,36,0.26)"), { marginTop: 4 }]}>
                  <Ionicons name="calendar" size={15} color={PremiumGold} />
                  <Text style={{ color: c.text, fontWeight: "950", fontSize: 13 }}>Do: {premiumUntilText}</Text>
                </View>
              ) : (
                <View style={[ui.pill("rgba(59,130,246,0.14)", "rgba(59,130,246,0.26)"), { marginTop: 4 }]}>
                  <Ionicons name="shield-checkmark" size={15} color={PrimaryBlue} />
                  <Text style={{ color: c.text, fontWeight: "950", fontSize: 13 }}>Płatność Stripe</Text>
                </View>
              )}
            </View>

            {!!err && <Text style={{ color: DangerRed, marginTop: 12, fontWeight: "950", fontSize: 12 }}>{err}</Text>}
          </LinearGradient>
        </View>

        {/* PLANS (pierwsze po HERO) */}
        <View style={{ ...ui.glassCard, ...ui.shadowStrong, padding: 14 }}>
          <SectionHeader
            icon="pricetag"
            title={isPremium ? "Przedłuż Premium" : "Wybierz plan"}
            hint={
              yearlyValue.save > 0
                ? `Roczny opłaca się najbardziej: oszczędzasz ~${yearlyValue.save} zł (${yearlyValue.pct}%).`
                : "Wybierz plan dopasowany do Ciebie."
            }
          />

          {!authReady ? (
            <Text style={{ color: c.textMuted, marginTop: 10, fontWeight: "950", fontSize: 12 }}>Ładowanie sesji…</Text>
          ) : null}

          {/* ✅ MOBILE: plany obok siebie + mniejsze kafelki */}
          <View
            style={{
              marginTop: 12,
              flexDirection: plansTwoCols ? "row" : "column",
              gap: plansGap,
            }}
          >
            <View style={{ flex: 1 }}>
              <PlanCard planId="yearly" highlighted badge="Najlepsza wartość" badgeTone="gold" compact />
            </View>

            <View style={{ flex: 1 }}>
              <PlanCard planId="monthly" badge="Elastycznie" badgeTone="blue" compact />
            </View>
          </View>

          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.10)", paddingTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name="information-circle" size={17} color={c.textMuted} />
              <Text style={{ color: c.textMuted, lineHeight: 17, flex: 1, fontSize: 12 }}>
                Po kliknięciu przejdziesz do Stripe Checkout. Aplikacja nie przechowuje danych karty.
              </Text>
            </View>
          </View>
        </View>

        {/* BENEFITS (mobile cards) */}
        <View style={{ ...ui.glassCard, ...ui.shadowSoft, padding: 14 }}>
          <SectionHeader
            icon="gift"
            title="Co daje Premium"
            hint="Rodzina, zadania, statystyki, rywalizacja i wiadomości — w jednym miejscu."
          />

          <View style={{ marginTop: 12, gap: 10 }}>
            {perks.map((p, i) => (
              <View
                key={i}
                style={{
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.03)",
                  padding: 12,
                  overflow: "hidden",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <LinearGradient
                    colors={["rgba(251,191,36,0.22)", "rgba(251,191,36,0.10)"]}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: "rgba(251,191,36,0.18)",
                      marginTop: 1,
                    }}
                  >
                    <Ionicons name={p.icon} size={18} color={PremiumGold} />
                  </LinearGradient>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: "950", fontSize: 14 }}>{p.title}</Text>
                    <Text style={{ color: c.textMuted, marginTop: 4, lineHeight: 17, fontSize: 12 }}>{p.desc}</Text>
                  </View>

                  <Ionicons name="checkmark-circle" size={18} color={SuccessGreen} style={{ marginTop: 4 }} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* PAY MODAL (bottom sheet) */}
      <Modal visible={payModal.open} transparent animationType="fade" onRequestClose={closePayModal}>
        <Pressable
          onPress={closePayModal}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.60)",
            padding: 12,
            justifyContent: "flex-end",
          }}
        >
          <Pressable onPress={() => {}} style={{ width: "100%", alignItems: "center" }}>
            {PayModalContent}
          </Pressable>
        </Pressable>
      </Modal>

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
            backgroundColor: "rgba(0,0,0,0.18)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: c.card,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 20,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              ...ui.shadowStrong,
            }}
          >
            <ActivityIndicator color={c.accent} />
            <Text style={{ color: c.text, fontWeight: "950", fontSize: 13 }}>Przetwarzam…</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

//app/premium.tsx
