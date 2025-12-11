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

/* ----------------------------------------------
   PREMIUM PLANS
---------------------------------------------- */
const PLANS = {
  monthly: { title: "Miesięczny", priceLabel: "25 zł / mies.", amountPln: 25 },
  yearly: { title: "Roczny", priceLabel: "100 zł / rok", amountPln: 100 },
};
type PlanId = keyof typeof PLANS;

const GOLD = "#FBBF24";
const BLUE = "#3B82F6";
const GREEN = "#22C55E";
const RED = "#EF4444";

/* ----------------------------------------------
   API HELPERS
---------------------------------------------- */
const ENV_BASE = (process.env.EXPO_PUBLIC_PAYMENTS_BASE || "").trim();
const ENV_KEY = (process.env.EXPO_PUBLIC_PAYMENTS_API_KEY || "").trim();
const STRIPE_RETURN_HTTPS = (process.env.EXPO_PUBLIC_STRIPE_RETURN_HTTPS || "").trim();
let RESOLVED_BASE: string | null = null;

function buildUrl(base: string, path: string, qs?: Record<string, any>) {
  const u = `${base.replace(/\/+$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
  if (!qs) return u;
  const sp = new URLSearchParams();
  Object.entries(qs).forEach(([k, v]) => v != null && sp.append(k, String(v)));
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
      `API zwróciło nie-JSON (content-type: ${ct || "brak"}). Snippet:\n${snippet}`
    );
  }

  if (!res.ok) throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
  return json;
}

async function probeHealth(base: string) {
  try {
    const url = buildUrl(base, "/rpc/healthz", { t: Date.now() });
    const res = await fetch(url);
    const json = await readJsonOrThrow(res);
    return json?.ok === true ? { ok: true as const } : { ok: false as const };
  } catch (e: any) {
    return { ok: false as const, reason: e?.message };
  }
}

async function resolveBaseOnce() {
  if (RESOLVED_BASE) return RESOLVED_BASE;

  const candidates = [];
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
    errors.push(`❌ ${base}: ${r.reason}`);
  }

  throw new Error(`Brak połączenia z API płatności:\n${errors.join("\n")}`);
}

async function authHeaders() {
  const u = auth.currentUser;
  if (!u) return {};
  const token = await u.getIdToken(true);
  return { Authorization: `Bearer ${token}` };
}

async function apiPost<T>(path: string, body: any): Promise<T> {
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

  return readJsonOrThrow(res);
}

async function apiGet<T>(path: string, qs?: Record<string, any>): Promise<T> {
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

  return readJsonOrThrow(res);
}

/* ----------------------------------------------
   RPC WRAPPERS
---------------------------------------------- */
const createPaymentIntent = (body: any) => apiPost("/rpc/createPaymentIntent", body);
const getPaymentStatus = (args: any) => apiPost("/rpc/getPaymentIntentStatus", args);
const finalizePayment = (args: any) => apiPost("/rpc/finalizePayment", args);
const getUserPremium = (uid: string) => apiGet("/rpc/userPremium", { uid });

/* ----------------------------------------------
   UTILITIES
---------------------------------------------- */
function toDateSafe(v: any): Date | null {
  try {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (v instanceof Timestamp) return v.toDate();
    if (typeof v?.toDate === "function") return v.toDate();
    if (typeof v === "string") {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
}

export default function PremiumScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useThemeColors();

  const [authReady, setAuthReady] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [payModal, setPayModal] = useState<{
    open: boolean;
    planId: PlanId | null;
  }>({ open: false, planId: null });

  const [alertWeb, setAlertWeb] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "",
    message: "",
  });

  const uid = auth.currentUser?.uid || null;

  /* ----------------------------------------------
     AUTH LISTENER
  ---------------------------------------------- */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(() => setAuthReady(true));
    return () => unsub();
  }, []);

  /* ----------------------------------------------
     USER PREMIUM SNAPSHOT
  ---------------------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setIsPremium(false);
        setPremiumUntil(null);
        return;
      }
      const d: any = snap.data();
      setIsPremium(!!d?.isPremium);
      setPremiumUntil(toDateSafe(d?.premiumUntil));
    });

    return () => unsub();
  }, [uid]);

  const premiumUntilText = premiumUntil
    ? premiumUntil.toLocaleDateString("pl-PL")
    : null;

  /* ----------------------------------------------
     NICE ALERT (NATIVE + WEB)
  ---------------------------------------------- */
  const showAlert = (title: string, message: string) => {
    if (Platform.OS === "web") {
      setAlertWeb({ open: true, title, message });
      return;
    }
    Alert.alert(title, message);
  };

  const closeAlertWeb = () => setAlertWeb({ ...alertWeb, open: false });

  /* ----------------------------------------------
     RETURN HANDLING (Stripe redirect)
  ---------------------------------------------- */
  const handleReturn = useCallback(
    async ({
      sessionId,
      paymentIntentId,
      cancelled,
    }: {
      sessionId?: string;
      paymentIntentId?: string;
      cancelled?: boolean;
    }) => {
      if (cancelled) {
        setErr("Płatność anulowana.");
        return;
      }

      if (!sessionId && !paymentIntentId) return;

      try {
        setBusy(true);
        setErr("");

        const stat = await getPaymentStatus({
          sessionId,
          paymentIntentId,
        });

        const status = String(stat?.status || "");

        if (status === "processing") {
          showAlert("W trakcie", "Stripe jeszcze potwierdza płatność ⏳");
          return;
        }

        if (status === "succeeded") {
          const fin = await finalizePayment({ sessionId, paymentIntentId });

          if (fin?.ok) {
            const d = fin?.premiumUntil ? new Date(fin.premiumUntil) : null;
            const label = d ? d.toLocaleDateString("pl-PL") : "";
            showAlert("Premium aktywne 🎉", label || "Płatność ukończona.");
            return;
          }

          setErr("Nie udało się sfinalizować płatności.");
          return;
        }

        if (status === "requires_payment_method") {
          setErr("Błąd płatności.");
          return;
        }

        setErr(`Status płatności: ${status}`);
      } catch (e: any) {
        setErr(e?.message || "Błąd przetwarzania płatności.");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    const cancelled = params?.cancelled === "1";
    const sessionId = params?.session_id ? String(params.session_id) : "";
    const paymentIntentId = params?.payment_intent
      ? String(params.payment_intent)
      : "";

    if (!sessionId && !paymentIntentId && !cancelled) return;

    (async () => {
      await handleReturn({
        sessionId,
        paymentIntentId,
        cancelled,
      });

      try {
        router.replace("/premium");
      } catch {}
    })();
  }, [params, handleReturn]);

  /* ----------------------------------------------
     OPEN PLAN
  ---------------------------------------------- */
  const openPlan = (planId: PlanId) => {
    if (!authReady) return showAlert("Chwila…", "Trwa ładowanie.");
    if (!auth.currentUser) return showAlert("Zaloguj się", "Musisz być zalogowany.");

    Haptics.selectionAsync();
    setPayModal({ open: true, planId });
  };

  const closePayModal = () => setPayModal({ open: false, planId: null });

  /* ----------------------------------------------
     CHECKOUT
  ---------------------------------------------- */
  const doCheckout = async () => {
    if (!payModal.planId) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      setBusy(true);
      setErr("");

      const u = auth.currentUser;
      if (!u) throw new Error("Musisz być zalogowany.");

      const appReturn = Linking.createURL("/premium");

      const returnUrl = (() => {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          return `${window.location.origin}${window.location.pathname}`;
        }

        if (!STRIPE_RETURN_HTTPS) throw new Error("Brak STRIPE_RETURN_HTTPS");
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
        r?.redirectUrl || r?.url || r?.redirect_url || r?.data?.url;

      if (!redirectUrl) throw new Error("Brak redirectUrl");

      closePayModal();

      if (Platform.OS === "web") {
        window.location.href = redirectUrl;
      } else {
        await WebBrowser.openBrowserAsync(redirectUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
      }
    } catch (e: any) {
      const msg = e?.message || "Błąd inicjalizacji płatności.";
      setErr(msg);
      showAlert("Płatność", msg);
    } finally {
      setBusy(false);
    }
  };

  /* ----------------------------------------------
     REFRESH PREMIUM NOW
  ---------------------------------------------- */
  const refreshPremiumNow = async () => {
    if (!uid) return showAlert("Brak sesji", "Zaloguj się ponownie.");

    try {
      setBusy(true);
      const r = await getUserPremium(uid);
      const d = r?.premiumUntil ? new Date(r.premiumUntil) : null;
      showAlert(
        "Status premium",
        r?.isPremium && d
          ? `Aktywne do: ${d.toLocaleDateString("pl-PL")}`
          : "Premium nieaktywne."
      );
    } catch (e: any) {
      setErr(e?.message || "Nie udało się odświeżyć.");
    } finally {
      setBusy(false);
    }
  };

  /* ----------------------------------------------
     LAYOUT UTILS
  ---------------------------------------------- */
  const card = {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
  };

  const perks = [
    "Rodzina MAX: do 6 osób łącznie.",
    "Możesz zapraszać członków rodziny.",
    "Wspólne zadania i wiadomości.",
    "Odznaka Premium w profilu.",
  ];

  /* ----------------------------------------------
     PAY MODAL CONTENT
  ---------------------------------------------- */
  const PayModalContent = (
    <View
      style={{
        ...card,
        width: "100%",
        maxWidth: 520,
        padding: 20,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="sparkles" size={22} color={GOLD} />
        <Text
          style={{
            marginLeft: 10,
            color: colors.text,
            fontWeight: "900",
            fontSize: 18,
          }}
        >
          Płatność za Premium
        </Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={closePayModal}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 16 }}>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 12,
            fontWeight: "800",
          }}
        >
          WYBRANY PLAN
        </Text>
        <Text
          style={{
            color: colors.text,
            fontWeight: "900",
            fontSize: 20,
            marginTop: 6,
          }}
        >
          {payModal.planId ? PLANS[payModal.planId].title : "—"}
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
          Do zapłaty:{" "}
          <Text style={{ color: colors.text, fontWeight: "900" }}>
            {payModal.planId
              ? `${PLANS[payModal.planId].amountPln.toFixed(2)} PLN`
              : "—"}
          </Text>
        </Text>
      </View>

      {err ? (
        <Text style={{ marginTop: 12, color: RED, fontWeight: "800" }}>{err}</Text>
      ) : null}

      <TouchableOpacity onPress={doCheckout} disabled={busy} style={{ marginTop: 20 }}>
        <LinearGradient
          colors={[BLUE, "#2563EB"]}
          style={{
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
        disabled={busy}
        style={{ marginTop: 14, alignItems: "center", paddingVertical: 10 }}
      >
        <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>Anuluj</Text>
      </TouchableOpacity>
    </View>
  );

  /* ----------------------------------------------
     RENDER
  ---------------------------------------------- */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
        bounces={Platform.OS === "ios"}
      >
        {/* HEADER */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 10,
          }}
        >
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              router.back();
            }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons
              name={Platform.OS === "ios" ? "chevron-back" : "arrow-back"}
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>

          <Text
            style={{
              flex: 1,
              textAlign: "center",
              marginRight: 36,
              color: colors.text,
              fontSize: 22,
              fontWeight: "800",
            }}
          >
            Premium
          </Text>
        </View>

        {/* STATUS CARD */}
        <View style={{ ...card }}>
          <LinearGradient
            colors={[colors.card, "rgba(251,191,36,0.12)"]}
            style={{
              padding: 12,
              borderRadius: 14,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons
              name={isPremium ? "sparkles" : "sparkles-outline"}
              size={24}
              color={GOLD}
            />
            <Text
              style={{
                marginLeft: 12,
                color: colors.text,
                fontWeight: "900",
                fontSize: 17,
              }}
            >
              {isPremium ? "Premium aktywne" : "Premium nieaktywne"}
            </Text>

            {isPremium ? (
              <View
                style={{
                  marginLeft: "auto",
                  backgroundColor: "rgba(251,191,36,0.3)",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                }}
              >
                <Text
                  style={{
                    color: GOLD,
                    fontWeight: "900",
                    fontSize: 12,
                  }}
                >
                  AKTYWNE
                </Text>
              </View>
            ) : null}
          </LinearGradient>

          <Text style={{ marginTop: 10, color: colors.textSecondary, fontSize: 14 }}>
            {isPremium
              ? premiumUntilText
                ? `Aktywne do: ${premiumUntilText}`
                : "Aktywne."
              : "Aktywuj Premium, aby odblokować dodatki."}
          </Text>

          {err ? (
            <Text
              style={{
                marginTop: 10,
                color: RED,
                fontWeight: "800",
              }}
            >
              {err}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={refreshPremiumNow}
            style={{
              marginTop: 14,
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 999,
            }}
          >
            <Ionicons name="refresh" size={18} color={colors.text} />
            <Text
              style={{
                marginLeft: 8,
                color: colors.text,
                fontWeight: "800",
              }}
            >
              Sprawdź
            </Text>
          </TouchableOpacity>
        </View>

        {/* BENEFITS */}
        <View style={{ ...card, marginTop: 18 }}>
          <LinearGradient
            colors={[colors.card, "rgba(251,191,36,0.12)"]}
            style={{
              padding: 12,
              borderRadius: 14,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons name="sparkles" size={22} color={GOLD} />
            <Text
              style={{
                marginLeft: 10,
                color: colors.text,
                fontWeight: "900",
                fontSize: 17,
              }}
            >
              Co daje Premium?
            </Text>
          </LinearGradient>

          <View style={{ marginTop: 16 }}>
            {perks.map((p, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  marginBottom: 12,
                }}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={GREEN}
                  style={{ marginTop: 2, marginRight: 10 }}
                />
                <Text style={{ color: colors.text, lineHeight: 20, flex: 1 }}>
                  {p}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* PLANS */}
        <View style={{ ...card, marginTop: 18 }}>
          <LinearGradient
            colors={[colors.card, "rgba(59,130,246,0.15)"]}
            style={{ padding: 12, borderRadius: 14 }}
          >
            <Text
              style={{
                color: colors.text,
                fontWeight: "900",
                fontSize: 17,
              }}
            >
              Wybierz plan
            </Text>
            <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 13 }}>
              Płatność przez Stripe Checkout (P24 / BLIK / karta).
            </Text>
          </LinearGradient>

          <View style={{ marginTop: 16 }}>
            {(Object.keys(PLANS) as PlanId[]).map((planId) => {
              const p = PLANS[planId];

              return (
                <View
                  key={planId}
                  style={{
                    marginBottom: 14,
                    borderWidth: 1,
                    borderColor: GOLD,
                    borderRadius: 18,
                    padding: 16,
                    backgroundColor: colors.card,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: "900",
                          fontSize: 17,
                        }}
                      >
                        {p.title}
                      </Text>
                      <Text
                        style={{
                          marginTop: 4,
                          color: colors.textSecondary,
                          fontWeight: "700",
                        }}
                      >
                        {p.priceLabel}
                      </Text>
                    </View>

                    <TouchableOpacity onPress={() => openPlan(planId)}>
                      <LinearGradient
                        colors={["#FBBF24", "#F59E0B"]}
                        style={{
                          paddingHorizontal: 18,
                          paddingVertical: 10,
                          borderRadius: 14,
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: "900",
                            fontSize: 15,
                          }}
                        >
                          Wybierz
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* MODAL (native + web) */}
      <Modal
        visible={payModal.open}
        transparent
        animationType="fade"
        onRequestClose={closePayModal}
      >
        <Pressable
          onPress={closePayModal}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <Pressable onPress={() => {}} style={{ alignItems: "center" }}>
            {PayModalContent}
          </Pressable>
        </Pressable>
      </Modal>

      {/* WEB ALERT */}
      {alertWeb.open && Platform.OS === "web" && (
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
          }}
        >
          <View
            style={{
              ...card,
              maxWidth: 420,
              width: "100%",
              padding: 20,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="sparkles" size={24} color={GOLD} />
              <Text
                style={{
                  marginLeft: 10,
                  fontSize: 18,
                  fontWeight: "900",
                  color: colors.text,
                }}
              >
                {alertWeb.title}
              </Text>

              <View style={{ flex: 1 }} />

              <Pressable onPress={closeAlertWeb}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={{ marginTop: 12, color: colors.text }}>{alertWeb.message}</Text>

            <Pressable onPress={closeAlertWeb} style={{ marginTop: 20 }}>
              <LinearGradient
                colors={[BLUE, "#2563EB"]}
                style={{
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>OK</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      )}

      {/* BUSY OVERLAY */}
      {busy && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.2)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              paddingHorizontal: 20,
              paddingVertical: 14,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <ActivityIndicator color={colors.accent} />
            <Text
              style={{
                marginLeft: 12,
                color: colors.text,
                fontWeight: "800",
                fontSize: 15,
              }}
            >
              Przetwarzam…
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
