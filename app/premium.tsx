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

  if (!isJsonContentType(ct) || json == null) {
    const snippet = (text || "").slice(0, 220);
    throw new Error(
      `API zwróciło nie-JSON (content-type: ${ct || "brak"}). Snippet: ${snippet}`
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
            "Stripe jeszcze potwierdza płatność."
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
            uiAlert("Premium aktywne ✅", untilLabel || "Płatność przyjęta.");
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
        cleanWebQueryParams([
          "session_id",
          "payment_intent",
          "payment_intent_client_secret",
          "cancelled",
        ]);
      } else {
        try {
          router.replace("/premium");
        } catch {}
      }
    })();
  }, [params?.session_id, params?.payment_intent, params?.cancelled]);

  const openPlan = (planId: PlanId) => {
    if (!authReady) {
      uiAlert("Chwila", "Ładowanie sesji…");
      return;
    }
    if (!auth.currentUser) {
      uiAlert("Zaloguj się", "Musisz być zalogowany.");
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
    "Rodzina MAX: do 6 osób łącznie (Ty + 5).",
    "Możesz zapraszać członków rodziny spośród znajomych.",
    "Wspólne funkcje zadań oraz wiadomości z rodziną.",
    "Odznaka Premium w profilu.",
  ];

  /** NOWE PREMIUM CARD STYLE */
  const cardStyle = useMemo(
    () => ({
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 20,
      padding: 18,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    }),
    [colors.card, colors.border]
  );

  const PayModalContent = (
    <View
      style={{
        ...cardStyle,
        width: "100%",
        maxWidth: 520,
        padding: 20,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="sparkles" size={22} color={PremiumGold} />
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 17, marginLeft: 10 }}>
          Płatność za Premium
        </Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={closePayModal} style={{ padding: 6 }} activeOpacity={0.8}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={{ color: colors.textMuted, fontWeight: "800", fontSize: 12 }}>
          WYBRANY PLAN
        </Text>
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: 20, marginTop: 4 }}>
          {payModal.planId ? PLANS[payModal.planId].title : "—"}
        </Text>
        <Text style={{ color: colors.textMuted, marginTop: 6 }}>
          Do zapłaty:{" "}
          <Text style={{ color: colors.text, fontWeight: "900" }}>
            {payModal.planId ? `${PLANS[payModal.planId].amountPln.toFixed(2)} PLN` : "—"}
          </Text>
        </Text>
      </View>

      {!!err && <Text style={{ color: DangerRed, marginTop: 12, fontWeight: "800" }}>{err}</Text>}

      <TouchableOpacity onPress={doCheckout} disabled={busy} activeOpacity={0.9}>
        <LinearGradient
          colors={["#3B82F6", "#2563EB"]}
          style={{
            marginTop: 20,
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
              Przejdź do płatności (P24 / BLIK / karta)
            </Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={closePayModal}
        style={{ marginTop: 14, paddingVertical: 10, alignItems: "center" }}
        disabled={busy}
      >
        <Text style={{ color: colors.textMuted, fontWeight: "700" }}>Anuluj</Text>
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
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ paddingVertical: 4, paddingRight: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>Premium</Text>

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            onPress={refreshPremiumNow}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 999,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
            activeOpacity={0.9}
          >
            <Ionicons name="refresh" size={18} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: "900" }}>Sprawdź</Text>
          </TouchableOpacity>
        </View>

        {/* STATUS CARD */}
        <View style={{ ...cardStyle }}>
          <LinearGradient
            colors={[colors.card, "rgba(251,191,36,0.12)"]}
            style={{ padding: 10, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <Ionicons
              name={isPremium ? "sparkles" : "sparkles-outline"}
              size={24}
              color={PremiumGold}
            />
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>
              {isPremium ? "Premium aktywne" : "Premium nieaktywne"}
            </Text>

            <View style={{ flex: 1 }} />

            {isPremium ? (
              <View
                style={{
                  backgroundColor: "rgba(251,191,36,0.25)",
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 999,
                }}
              >
                <Text style={{ color: PremiumGold, fontWeight: "900", fontSize: 12 }}>
                  AKTYWNE
                </Text>
              </View>
            ) : null}
          </LinearGradient>

          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 10 }}>
            {isPremium
              ? premiumUntilText
                ? `Aktywne do: ${premiumUntilText}`
                : "Aktywne."
              : "Aktywuj Premium, żeby odblokować dodatki."}
          </Text>

          {!!err && <Text style={{ color: DangerRed, marginTop: 10, fontWeight: "800" }}>{err}</Text>}
        </View>

        {/* PERKS */}
        <View style={{ ...cardStyle }}>
          <LinearGradient
            colors={[colors.card, "rgba(251,191,36,0.12)"]}
            style={{ padding: 10, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <Ionicons name="sparkles" size={22} color={PremiumGold} />
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>
              Co daje Premium?
            </Text>
          </LinearGradient>

          <View style={{ marginTop: 14, gap: 12 }}>
            {perks.map((p, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={SuccessGreen}
                  style={{ marginTop: 1 }}
                />
                <Text style={{ color: colors.text, flex: 1, lineHeight: 20 }}>{p}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* PLANS */}
        <View style={{ ...cardStyle }}>
          <LinearGradient
            colors={[colors.card, "rgba(59,130,246,0.15)"]}
            style={{ padding: 12, borderRadius: 16 }}
          >
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 16 }}>
              Wybierz plan
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
              Płatność przez Stripe Checkout (P24 / BLIK / karta).
            </Text>
          </LinearGradient>

          {!authReady ? (
            <Text style={{ color: colors.textMuted, marginTop: 10, fontWeight: "800" }}>
              Ładowanie sesji…
            </Text>
          ) : null}

          <View style={{ marginTop: 16, gap: 14 }}>
            {(Object.keys(PLANS) as PlanId[]).map((planId) => {
              const plan = PLANS[planId];

              return (
                <View
                  key={planId}
                  style={{
                    borderWidth: 1,
                    borderColor: PremiumGold,
                    borderRadius: 18,
                    padding: 16,
                    backgroundColor: colors.card,
                    shadowColor: PremiumGold,
                    shadowOpacity: 0.2,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: 4,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "900", fontSize: 17 }}>
                        {plan.title}
                      </Text>
                      <Text style={{ color: colors.textMuted, marginTop: 4, fontWeight: "700" }}>
                        {plan.priceLabel}
                      </Text>
                    </View>

                    <TouchableOpacity onPress={() => openPlan(planId)} activeOpacity={0.9}>
                      <LinearGradient
                        colors={["#FBBF24", "#F59E0B"]}
                        style={{
                          paddingHorizontal: 18,
                          paddingVertical: 10,
                          borderRadius: 14,
                          opacity: busy ? 0.7 : 1,
                          ...(Platform.OS === "web"
                            ? ({ cursor: "pointer" } as any)
                            : null),
                        }}
                      >
                        {busy ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
                            Wybierz
                          </Text>
                        )}
                      </LinearGradient>
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
                backdropFilter: "blur(6px)",
              }}
              onPress={closePayModal}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{ width: "100%", alignItems: "center", padding: 16 }}
              >
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
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderRadius: 18,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 20,
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
