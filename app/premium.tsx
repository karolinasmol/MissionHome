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

/** IMPORTANT: na mobile MUSI być https (np. Firebase Hosting) */
const STRIPE_RETURN_HTTPS = (process.env.EXPO_PUBLIC_STRIPE_RETURN_HTTPS || "").trim();

let RESOLVED_BASE: string | null = null;

function uiAlert(title: string, message: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

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

  // ❗najważniejsze: jak to nie JSON, to NIE udawaj że jest ok
  if (!isJsonContentType(ct) || json == null) {
    const snippet = (text || "").slice(0, 220);
    throw new Error(
      `API zwróciło nie-JSON (content-type: ${ct || "brak"}). ` +
        `To prawie na pewno oznacza zły BASE / rewrite do frontu. ` +
        `Snippet: ${snippet}`
    );
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

  // WEB: tylko jeśli hosting ma rewrite /paymentsApi -> funkcja
  if (Platform.OS === "web") candidates.push("/paymentsApi");

  // emulatory / local
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
      console.log("[premium][api] RESOLVED_BASE =", base, "healthz =", r.json);
      return base;
    }
    errors.push(`- ${base}: ${r.reason}`);
  }

  throw new Error(`Nie mogę połączyć z API płatności (healthz). Sprawdzone:\n${errors.join("\n")}`);
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
async function createPaymentIntent(payload: any): Promise<{
  id: string;
  redirectUrl?: string | null;
  url?: string | null;
  redirect_url?: string | null;
  sessionId?: string | null;
}> {
  return apiPost("/rpc/createPaymentIntent", payload);
}

async function getPaymentStatus(args: { paymentIntentId?: string; sessionId?: string }): Promise<{
  status: string;
  metadata?: any;
  amount?: number;
  currency?: string;
}> {
  return apiPost("/rpc/getPaymentIntentStatus", args);
}

async function finalizePayment(args: { paymentIntentId?: string; sessionId?: string }): Promise<{
  ok: boolean;
  already?: boolean;
  premiumUntil?: string | null;
  status?: string;
}> {
  return apiPost("/rpc/finalizePayment", args);
}

async function getUserPremium(uid: string): Promise<{
  isPremium: boolean;
  premiumUntil: string | null;
}> {
  return apiGet("/rpc/userPremium", { uid });
}

/** ====== Helpers ====== */
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
          uiAlert(
            "Płatność w trakcie ⏳",
            "Stripe jeszcze potwierdza płatność. Premium pojawi się automatycznie po potwierdzeniu (webhook)."
          );
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
            uiAlert("Premium aktywne ✅", untilLabel ? `Aktywne do: ${untilLabel}` : "Płatność przyjęta.");
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
    []
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.session_id, params?.payment_intent, params?.cancelled]);

  const openPlan = (planId: PlanId) => {
    console.log("[premium] click wybierz", { planId, authReady, hasUser: !!auth.currentUser });

    if (!authReady) {
      setErr("Ładowanie sesji… spróbuj za chwilę.");
      uiAlert("Chwila", "Ładowanie sesji… spróbuj za chwilę.");
      return;
    }
    if (!auth.currentUser) {
      setErr("Musisz być zalogowany, aby wykupić Premium.");
      uiAlert("Zaloguj się", "Musisz być zalogowany, aby wykupić Premium.");
      return;
    }

    setErr("");
    setPayModal({ open: true, planId });
  };

  const closePayModal = () => setPayModal({ open: false, planId: null });

  const doCheckout = async () => {
    if (!payModal.planId) return;
    const planId = payModal.planId;

    try {
      setBusy(true);
      setErr("");

      const u = auth.currentUser;
      if (!u) throw new Error("Zaloguj się, aby wykupić Premium.");

      const appReturn = Linking.createURL("/premium");

      const returnUrl =
        Platform.OS === "web" && typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}` // bez query
          : (() => {
              if (!STRIPE_RETURN_HTTPS || !/^https?:\/\//i.test(STRIPE_RETURN_HTTPS)) {
                throw new Error("Brak EXPO_PUBLIC_STRIPE_RETURN_HTTPS (musi być https URL do strony return na hostingu).");
              }
              const glue = STRIPE_RETURN_HTTPS.includes("?") ? "&" : "?";
              return `${STRIPE_RETURN_HTTPS}${glue}appReturn=${encodeURIComponent(appReturn)}`;
            })();

      const payload = {
        planId,
        returnUrl,
        customerEmail: u.email || undefined,
        customerName: u.displayName || "Użytkownik",
      };

      const base = await resolveBaseOnce();
      console.log("[premium] API base =", base);
      console.log("[premium] createPaymentIntent payload", payload);

      const r = await createPaymentIntent(payload);
      console.log("[premium] createPaymentIntent response", r);

      // ✅ obsłuż różne formaty, jeśli trafisz w starszy backend
      const redirectUrl =
        (r as any)?.redirectUrl ||
        (r as any)?.url ||
        (r as any)?.redirect_url ||
        (r as any)?.data?.redirectUrl ||
        (r as any)?.data?.url ||
        null;

      if (!redirectUrl) {
        throw new Error(
          "Brak redirectUrl z backendu. " +
            "Jeśli widzisz w logu response = {}, to na pewno uderzasz w zły BASE (HTML zamiast JSON)."
        );
      }

      closePayModal();

      console.log("[premium] redirect =>", redirectUrl);

      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = redirectUrl;
      } else {
        await WebBrowser.openBrowserAsync(redirectUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
      }
    } catch (e: any) {
      const msg = e?.message || "Błąd inicjalizacji płatności.";
      console.error("[premium] doCheckout error", e);
      setErr(msg);
      uiAlert("Płatność", msg);
    } finally {
      setBusy(false);
    }
  };

  const refreshPremiumNow = async () => {
    if (!uid) return uiAlert("Brak sesji", "Zaloguj się ponownie.");
    try {
      setBusy(true);
      setErr("");
      const r = await getUserPremium(uid);
      const until = r?.premiumUntil ? new Date(r.premiumUntil) : null;
      uiAlert(
        "Status Premium",
        r?.isPremium && until && !Number.isNaN(until.getTime())
          ? `Aktywne do: ${until.toLocaleDateString("pl-PL")}`
          : r?.isPremium
            ? "Premium aktywne."
            : "Premium nieaktywne."
      );
    } catch (e: any) {
      setErr(e?.message || "Nie udało się odświeżyć statusu Premium.");
    } finally {
      setBusy(false);
    }
  };

  /** ====== UI ====== */
  const perks = [
    "Rodzina MAX: do 6 osób łącznie (Ty + 5).",
    "Możesz zapraszać członków rodziny spośród znajomych.",
    "Wspólne funkcje domu / udostępnienia (w roadmapie).",
    "Odznaka Premium w profilu (opcjonalnie).",
  ];

  const cardStyle = useMemo(
    () => ({ backgroundColor: colors.card, borderColor: colors.border }),
    [colors.card, colors.border]
  );

  const PayModalContent = (
    <View style={{ ...cardStyle, borderWidth: 1, borderRadius: 16, padding: 16, width: "100%", maxWidth: 520 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="sparkles" size={20} color={PremiumGold} />
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16, marginLeft: 10 }}>Płatność za Premium</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={closePayModal} style={{ padding: 6 }} activeOpacity={0.8}>
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 12 }}>
        <Text style={{ color: colors.textMuted, fontWeight: "800", fontSize: 12 }}>WYBRANY PLAN</Text>
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 18, marginTop: 4 }}>
          {payModal.planId ? PLANS[payModal.planId].title : "—"}
        </Text>
        <Text style={{ color: colors.textMuted, marginTop: 6 }}>
          Do zapłaty:{" "}
          <Text style={{ color: colors.text, fontWeight: "900" }}>
            {payModal.planId ? `${PLANS[payModal.planId].amountPln.toFixed(2)} PLN` : "—"}
          </Text>
        </Text>
      </View>

      {!!err && <Text style={{ color: DangerRed, marginTop: 10, fontWeight: "800" }}>{err}</Text>}

      <TouchableOpacity
        onPress={doCheckout}
        style={{
          marginTop: 14,
          backgroundColor: PrimaryBlue,
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: "center",
          opacity: busy ? 0.7 : 1,
        }}
        activeOpacity={0.9}
        disabled={busy}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "900" }}>Przejdź do płatności (P24 / BLIK / karta)</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={closePayModal} style={{ marginTop: 10, paddingVertical: 10, alignItems: "center" }} disabled={busy}>
        <Text style={{ color: colors.textMuted, fontWeight: "800" }}>Anuluj</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32,
          width: "100%",
          maxWidth: 900,
          alignSelf: Platform.OS === "web" ? "center" : "stretch",
          gap: 14,
        }}
      >
        {/* HEADER */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ paddingVertical: 4, paddingRight: 8 }}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>Premium</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={refreshPremiumNow}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 999,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
            activeOpacity={0.9}
          >
            <Ionicons name="refresh" size={16} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: "900" }}>Sprawdź</Text>
          </TouchableOpacity>
        </View>

        {/* STATUS CARD */}
        <View style={{ ...cardStyle, borderWidth: 1, borderRadius: 16, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name={isPremium ? "sparkles" : "sparkles-outline"} size={22} color={PremiumGold} />
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 15 }}>
              {isPremium ? "Premium aktywne" : "Premium nieaktywne"}
            </Text>
            <View style={{ flex: 1 }} />
            {isPremium ? (
              <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.textMuted, fontWeight: "900", fontSize: 12 }}>AKTYWNE</Text>
              </View>
            ) : null}
          </View>

          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6 }}>
            {isPremium
              ? premiumUntilText
                ? `Aktywne do: ${premiumUntilText}`
                : "Aktywne (brak daty w profilu)."
              : "Aktywuj Premium, żeby odblokować dodatki."}
          </Text>

          {!!err && <Text style={{ color: DangerRed, marginTop: 10, fontWeight: "800" }}>{err}</Text>}
        </View>

        {/* PERKS */}
        <View style={{ ...cardStyle, borderWidth: 1, borderRadius: 16, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="sparkles" size={20} color={PremiumGold} />
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 15 }}>Co daje Premium?</Text>
          </View>

          <View style={{ marginTop: 10, gap: 10 }}>
            {perks.map((p, idx) => (
              <View key={idx} style={{ flexDirection: "row", gap: 10 }}>
                <Ionicons name="checkmark-circle" size={18} color={SuccessGreen} style={{ marginTop: 1 }} />
                <Text style={{ color: colors.text, flex: 1, lineHeight: 20 }}>{p}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* PLANS */}
        <View style={{ ...cardStyle, borderWidth: 1, borderRadius: 16, padding: 14 }}>
          <Text style={{ color: colors.text, fontWeight: "900", fontSize: 15 }}>Wybierz plan</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
            Płatność przez Stripe Checkout (P24 / BLIK / karta).
          </Text>

          {!authReady ? <Text style={{ color: colors.textMuted, marginTop: 10, fontWeight: "800" }}>Ładowanie sesji…</Text> : null}

          <View style={{ marginTop: 12, gap: 10 }}>
            {(Object.keys(PLANS) as PlanId[]).map((planId) => {
              const plan = PLANS[planId];
              return (
                <View
                  key={planId}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 14,
                    padding: 12,
                    backgroundColor: colors.bg,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>{plan.title}</Text>
                      <Text style={{ color: colors.textMuted, marginTop: 4, fontWeight: "700" }}>{plan.priceLabel}</Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => openPlan(planId)}
                      style={{
                        backgroundColor: PrimaryBlue,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 12,
                        opacity: busy ? 0.7 : 1,
                        ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
                      }}
                      activeOpacity={0.9}
                      disabled={busy}
                    >
                      {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "900" }}>Wybierz</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* PAY MODAL */}
      {Platform.OS === "web" ? (
        payModal.open ? (
          <View style={styles.webOverlayRoot as any} pointerEvents="box-none">
            <Pressable style={styles.webBackdrop} onPress={closePayModal}>
              <Pressable onPress={(e: any) => e?.stopPropagation?.()} style={{ width: "100%", alignItems: "center", padding: 16 }}>
                {PayModalContent}
              </Pressable>
            </Pressable>
          </View>
        ) : null
      ) : (
        <Modal visible={payModal.open} transparent animationType="fade" onRequestClose={closePayModal}>
          <Pressable onPress={closePayModal} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", padding: 16, justifyContent: "center" }}>
            <Pressable onPress={() => {}} style={{ width: "100%", alignItems: "center" }}>
              {PayModalContent}
            </Pressable>
          </Pressable>
        </Modal>
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
            backgroundColor: "rgba(0,0,0,0.15)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1,
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderRadius: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.text, fontWeight: "900" }}>Przetwarzam…</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = {
  webOverlayRoot: {
    position: Platform.OS === "web" ? ("fixed" as any) : ("absolute" as any),
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 9999,
  },
  webBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
};
