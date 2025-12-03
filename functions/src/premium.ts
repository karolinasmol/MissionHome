// functions/src/premium.ts
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2/options";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";

/* =============================================================================
   Global options (2nd gen)
============================================================================= */
setGlobalOptions({
  region: "europe-central2",
  maxInstances: 10,
  timeoutSeconds: 60,
  secrets: [
    "STRIPE_SECRET",
    "STRIPE_SECRET_KEY",
    "RESEND_API_KEY",
    "SENDGRID_API_KEY",
    "STRIPE_SUBS_WEBHOOK_SECRET",
  ],
});

/* =============================================================================
   Firebase Admin init
============================================================================= */
try {
  admin.app();
} catch {
  admin.initializeApp();
}
const fdb = admin.firestore();

/* =============================================================================
   Resend (opcjonalnie)
============================================================================= */
let ResendCtor: any = null;
try {
  ResendCtor = require("resend").Resend;
} catch {
  ResendCtor = null;
}

// używamy tylko RESEND_API_KEY
const _RAW_RESEND_KEY = String(process.env.RESEND_API_KEY || "")
  .trim()
  .replace(/^['"]|['"]$/g, "");

const resend = _RAW_RESEND_KEY && ResendCtor ? new ResendCtor(_RAW_RESEND_KEY) : null;

async function sendPremiumEmailResend(
  to: string,
  displayName: string | null,
  planId: string,
  untilDate?: Date | null
) {
  if (!resend) throw new Error("Resend nie jest skonfigurowany (brak RESEND_API_KEY).");

  const planLabel = planId === "yearly" ? "roczna" : "miesięczna";
  const untilLabel = untilDate ? new Date(untilDate).toLocaleDateString("pl-PL") : null;

  const subject = "MissionHome Premium aktywowane ✨";
  const preheader = untilLabel
    ? `Premium aktywne do ${untilLabel}. Dziękujemy!`
    : `Dziękujemy za zakup Premium.`;

  const brand = {
    appName: "MissionHome",
    primary: "#3B82F6",
    text: "#0B1B3A",
    muted: "#6b7280",
    bg: "#F5F7FB",
    card: "#ffffff",
    border: "#e5e7eb",

    // TODO: podmień po konfiguracji domeny
    logoUrl: "https://missionhome.example/static/logo.png",
    homepage: "https://missionhome.example/",
    helpEmail: "support@missionhome.example",
    fromEmail: "no-reply@missionhome.example",
  };

  const safeName = (displayName || "").trim();
  const hello = safeName ? `Cześć ${safeName},` : "Cześć,";

  const text = [
    `${hello}`,
    `Dziękujemy za zakup MissionHome Premium (${planLabel}).`,
    untilLabel ? `Twoje Premium jest aktywne do: ${untilLabel}.` : "",
    "",
    "Miłego korzystania!",
    brand.appName,
    "",
    `Pomoc: ${brand.helpEmail}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!doctype html>
<html lang="pl">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
  <style>
    @media (max-width:600px){
      .container { width:100% !important; border-radius:0 !important; }
      .content { padding:20px !important; }
      .btn { display:block !important; width:100% !important; }
    }
    a { text-decoration:none; }
  </style>
</head>
<body style="margin:0;padding:0;background:${brand.bg};font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${preheader}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${brand.bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" border="0"
               style="width:600px;max-width:600px;background:${brand.card};border:1px solid ${brand.border};border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
          <tr>
            <td style="padding:18px 20px;border-bottom:1px solid ${brand.border};" align="left">
              <a href="${brand.homepage}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:10px;">
                <img src="${brand.logoUrl}" alt="${brand.appName}" width="140" style="display:block;border:0;outline:none;text-decoration:none;height:auto;">
              </a>
            </td>
          </tr>

          <tr>
            <td class="content" style="padding:28px 28px 8px 28px;color:${brand.text};">
              <div style="font-size:16px;line-height:1.5;color:${brand.text};">
                <p style="margin:0 0 12px 0;">${hello}</p>
                <p style="margin:0 0 12px 0;">
                  Dziękujemy za zakup <strong>MissionHome Premium (${planLabel})</strong>.
                  ${untilLabel ? `Twoje Premium jest aktywne do: <strong>${untilLabel}</strong>.` : ""}
                </p>

                <div style="margin:22px 0;">
                  <a class="btn" href="${brand.homepage}" target="_blank" rel="noopener"
                     style="display:inline-block;background:${brand.primary};color:#fff;padding:12px 18px;border-radius:10px;font-weight:700;">
                    Otwórz MissionHome
                  </a>
                </div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                       style="margin:18px 0;border:1px solid ${brand.border};border-radius:10px;">
                  <tr>
                    <td style="padding:14px;">
                      <div style="font-size:14px;color:${brand.muted};line-height:1.6;">
                        <div style="margin-bottom:6px;"><strong>Szczegóły Premium</strong></div>
                        <div>Plan: <strong>${planLabel}</strong></div>
                        ${untilLabel ? `<div>Aktywne do: <strong>${untilLabel}</strong></div>` : ""}
                      </div>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 10px 0;">Miłego korzystania!</p>
                <p style="margin:0 0 16px 0;"><strong>${brand.appName}</strong></p>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 20px;border-top:1px solid ${brand.border};" align="left">
              <div style="font-size:12px;color:${brand.muted};line-height:1.5;">
                Ten e-mail ma charakter transakcyjny (potwierdzenie zakupu).
                W razie pytań: <a href="mailto:${brand.helpEmail}" style="color:${brand.primary};">${brand.helpEmail}</a>.
              </div>
            </td>
          </tr>

        </table>

        <div style="max-width:600px;margin:12px auto 0 auto;font-size:11px;color:${brand.muted};line-height:1.6;text-align:center;">
          © ${new Date().getFullYear()} ${brand.appName}.
        </div>

      </td>
    </tr>
  </table>
</body>
</html>`;

  const from = `${brand.appName} <${brand.fromEmail}>`;

  const resp: any = await resend.emails.send({
    from,
    to: [to],
    subject,
    html,
    text,
    reply_to: brand.helpEmail,
    tags: [{ name: "type", value: "premium-activated" }],
  } as any);

  const err = resp?.error || null;
  if (err) throw new Error(`Resend error: ${err?.message || "unknown"}`);
}

/* =============================================================================
   Stripe
============================================================================= */
let stripe: any = null;

function getStripe() {
  if (stripe) return stripe;
  const raw = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET || "";
  const key = String(raw).trim().replace(/^['"]|['"]$/g, "");
  if (!key.startsWith("sk_")) throw new Error("Stripe not configured (missing STRIPE_SECRET_KEY)");

  const StripeCtor = require("stripe");

  // Zgodnie z dokumentacją Stripe: current API version = 2025-11-17.clover
  stripe = new StripeCtor(key, { apiVersion: "2025-11-17.clover" as any });
  return stripe;
}

/* =============================================================================
   Plans (SERWER: jedyne źródło prawdy)
============================================================================= */
const PLANS: Record<string, { months: number; amountPln: number; title: string }> = {
  monthly: { months: 1, amountPln: 25, title: "MissionHome Premium (1 mies.)" },
  yearly: { months: 12, amountPln: 100, title: "MissionHome Premium (12 mies.)" },
};

/* =============================================================================
 /* =============================================================================
    Helpers
 ============================================================================= */

 // klasyczny helper (UŻYWA url.searchParams => KODUJE znaki specjalne)
 function addQuery(urlStr: string, key: string, value: string) {
   const u = new URL(urlStr);
   u.searchParams.set(key, value);
   return u.toString();
 }

 // specjalnie dla Stripe tokenów typu {CHECKOUT_SESSION_ID}
 // bo Stripe wymaga dosłownie {CHECKOUT_SESSION_ID}, a searchParams zrobi %7B...%7D
 function addQueryRaw(urlStr: string, key: string, rawValue: string) {
   const [base, hash = ""] = String(urlStr).split("#");
   const glue = base.includes("?") ? "&" : "?";
   const out = `${base}${glue}${key}=${rawValue}`;
   return hash ? `${out}#${hash}` : out;
 }

 function safeUrl(u: any): string | null {
   const s = String(u || "").trim();
   if (!s) return null;
   if (/^https?:\/\//i.test(s)) return s; // pozwalamy też http w dev
   return null;
 }

 function readBearerToken(req: any): string | null {
   const h = String(req.headers?.authorization || "");
   const m = h.match(/^Bearer\s+(.+)$/i);
   return m ? m[1].trim() : null;
 }

 async function requireAuthUid(req: any): Promise<string> {
   const token = readBearerToken(req);
   if (!token) throw new Error("Missing Authorization: Bearer <FirebaseIdToken>");
   const decoded = await admin.auth().verifyIdToken(token);
   if (!decoded?.uid) throw new Error("Invalid token (no uid)");
   return decoded.uid;
 }

 function resolveOp(req: any) {
   const url = String(req.path || req.url || "/").replace(/\/+$/, "");
   const m = url.match(/\/rpc\/([^/?#]+)$/);
   if (m && m[1]) return m[1];
   if (req.query && typeof req.query.op === "string") return req.query.op;
   return "";
 }

 function toJsDate(v: any): Date | null {
   try {
     if (!v) return null;
     if (v.toDate) return v.toDate();
     if (v.toMillis) return new Date(v.toMillis());
     if (typeof v._seconds === "number") return new Date(v._seconds * 1000);
     if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
     if (typeof v === "string") {
       const d = new Date(v);
       return isNaN(d.getTime()) ? null : d;
     }
     if (v instanceof Date) return v;
     return null;
   } catch {
     return null;
   }
 }

 /* ===== CORS ===== */
 function corsForPayments(req: any, res: any) {
   const origin = String(req.headers.origin || "");
   const url = String(req.path || req.url || "/");
   const allowAny = process.env.CORS_ANY === "1";
   const isHealth = /\/rpc\/healthz$/.test(url) || req.query?.op === "healthz";

   const ORIGIN_ALLOW = [
     /^https?:\/\/localhost(:\d+)?$/i,
     /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
     /^https?:\/\/\[[0-9a-f:]+\](?::\d+)?$/i,
     /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
     /^https?:\/\/.*\.web\.app$/i,
     /^https?:\/\/.*\.firebaseapp\.com$/i,
   ];

   if (isHealth) {
     res.set("Access-Control-Allow-Origin", "*");
   } else if (allowAny || ORIGIN_ALLOW.some((rx) => rx.test(origin))) {
     res.set("Access-Control-Allow-Origin", origin || "*");
   }

   res.set("Vary", "Origin");
   res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
   res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
   res.set("Access-Control-Max-Age", "86400");
 }


/* =============================================================================
   Premium core helpers
============================================================================= */
async function extendUserPremium(uid: string, months: number) {
  const userRef = fdb.collection("users").doc(uid);
  const snap = await userRef.get();
  const now = new Date();
  let base = now;

  if (snap.exists) {
    const u = snap.data() as any;
    const until = u?.premiumUntil?.toDate ? u.premiumUntil.toDate() : null;
    if (until && until > now) base = until;
  }

  const newUntil = new Date(base);
  newUntil.setMonth(newUntil.getMonth() + months);

  await userRef.set(
    {
      isPremium: true,
      premiumUntil: admin.firestore.Timestamp.fromDate(newUntil),
      premiumUpdatedAt: admin.firestore.Timestamp.now(),
    },
    { merge: true }
  );

  return newUntil;
}

async function recordUserSubscription(args: {
  uid: string;
  planId: string;
  amountPln: number | null;
  currency: string | null;
  until: Date | null;
  paymentIntentId: string;
}) {
  const { uid, planId, amountPln, currency, until, paymentIntentId } = args;
  const docId = `sub_${paymentIntentId}`;
  const subRef = fdb.doc(`users/${uid}/subscriptions/${docId}`);

  await subRef.set(
    {
      subscriptionId: docId,
      planId,
      amountPln: amountPln ?? null,
      currency: currency ?? null,
      premiumUntil: until ? admin.firestore.Timestamp.fromDate(until) : null,
      paymentIntentId,
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/* =============================================================================
   paymentsApi – REST
============================================================================= */
export const paymentsApi = onRequest(
  { region: "europe-central2", timeoutSeconds: 30 },
  async (req, res): Promise<void> => {
    corsForPayments(req, res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    const op = resolveOp(req);
    const url = String(req.path || req.url || "/");
    const method = req.method;

    logger.info("[paymentsApi] hit", {
      method,
      url,
      op,
      origin: req.headers.origin || null,
      host: req.headers.host || null,
    });

    try {
      const stripe = getStripe();

      // healthz
      if ((method === "GET" || method === "HEAD") && (op === "healthz" || /\/rpc\/healthz$/.test(url))) {
        res.status(200).json({
          ok: true,
          time: new Date().toISOString(),
          project: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || null,
          region: "europe-central2",
          mode: "paymentsApi",
        });
        return;
      }

      // auth
      const callerUid = await requireAuthUid(req);

      // createPaymentIntent (czyli: createCheckoutSession)
      if (method === "POST" && (op === "createPaymentIntent" || /\/rpc\/createPaymentIntent$/.test(url))) {
        const { planId, returnUrl, customerEmail, customerName } = req.body || {};
        const pid = String(planId || "").trim();
        const plan = PLANS[pid];
        if (!plan) {
          res.status(400).json({ error: "Invalid planId. Use: monthly | yearly" });
          return;
        }

        const ru = safeUrl(returnUrl);
        if (!ru) {
          res.status(400).json({ error: "returnUrl required (must be http(s)://...)" });
          return;
        }

        const currency = "pln";
        const unit_amount = Math.round(Number(plan.amountPln) * 100);

const successUrl = addQueryRaw(ru, "session_id", "{CHECKOUT_SESSION_ID}");
const cancelUrl  = addQueryRaw(ru, "cancelled", "1");


        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          locale: "pl",
          client_reference_id: callerUid,
          customer_email: customerEmail || undefined,

          success_url: successUrl,
          cancel_url: cancelUrl,

          payment_method_types: ["card", "p24", "blik"],
          currency,

          metadata: {
            type: "premium",
            planId: pid,
            userId: callerUid,
          },

          line_items: [
            {
              quantity: 1,
              price_data: {
                currency,
                product_data: { name: plan.title },
                unit_amount,
              },
            },
          ],

          payment_intent_data: {
            metadata: {
              type: "premium",
              planId: pid,
              userId: callerUid,
              customerName: customerName || "",
            },
          },
        });

        // redirectUrl potrafi być null w niektórych konfiguracjach; robimy fallback retrieve()
        let redirectUrl: string | null = session?.url || null;
        if (!redirectUrl && session?.id) {
          const s2 = await stripe.checkout.sessions.retrieve(String(session.id));
          redirectUrl = s2?.url || null;
        }

        if (!redirectUrl) {
          res.status(500).json({ error: "Stripe returned session without url. Check Stripe API/version and session config." });
          return;
        }

        res.status(200).json({ id: session.id, sessionId: session.id, redirectUrl });
        return;
      }

      // getPaymentIntentStatus
      if (method === "POST" && (op === "getPaymentIntentStatus" || /\/rpc\/getPaymentIntentStatus$/.test(url))) {
        const { paymentIntentId, sessionId } = req.body || {};
        let piId = paymentIntentId as string | undefined;

        if (!piId && sessionId) {
          const ses = await stripe.checkout.sessions.retrieve(String(sessionId));
          const sesUid =
            (ses?.metadata && (ses.metadata as any).userId) ||
            (typeof ses?.client_reference_id === "string" ? ses.client_reference_id : null);

          if (sesUid && String(sesUid) !== callerUid) {
            res.status(403).json({ error: "Forbidden" });
            return;
          }

          piId = typeof ses?.payment_intent === "string" ? (ses.payment_intent as string) : undefined;

          // jeśli to async i jeszcze nie ma PI albo PI nie jest succeeded, dajemy status z sesji
          if (!piId) {
            const ps = String(ses?.payment_status || "");
            // mapujemy na "processing" / "requires_payment_method" dla frontu
            const mapped =
              ps === "paid" ? "succeeded" : ps === "unpaid" ? "processing" : ps || "processing";

            res.status(200).json({ status: mapped, metadata: ses?.metadata || {} });
            return;
          }
        }

        if (!piId) {
          res.status(400).json({ error: "paymentIntentId or sessionId required" });
          return;
        }

        const pi = await stripe.paymentIntents.retrieve(String(piId));
        const meta = pi.metadata || {};
        const piUid = (meta as any).userId || (meta as any).uid || null;
        if (piUid && String(piUid) !== callerUid) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        res.status(200).json({
          status: pi.status,
          metadata: meta,
          amount: typeof pi.amount === "number" ? pi.amount / 100 : undefined,
          currency: pi.currency?.toUpperCase?.(),
        });
        return;
      }

      // userPremium
      if (method === "GET" && (op === "userPremium" || /\/rpc\/userPremium$/.test(url))) {
        const uid = String(req.query?.uid || "");
        if (!uid) {
          res.status(400).json({ error: "uid required" });
          return;
        }
        if (uid !== callerUid) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        const ref = fdb.collection("users").doc(uid);
        const snap = await ref.get();
        const d = snap.exists ? (snap.data() as any) : {};
        let isPremium = !!d?.isPremium;
        let premiumUntilISO: string | null = null;

        const until =
          d?.premiumUntil?.toDate
            ? d.premiumUntil.toDate()
            : d?.premiumUntil?._seconds
              ? new Date(d.premiumUntil._seconds * 1000)
              : typeof d?.premiumUntil === "string"
                ? new Date(d.premiumUntil)
                : null;

        const now = new Date();

        if (until && !isNaN(until.getTime()) && until <= now) {
          try {
            await ref.set(
              {
                isPremium: false,
                premiumUntil: null,
                premiumUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                premiumExpiredAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
            isPremium = false;
          } catch (e: any) {
            logger.warn("[userPremium][autofix fail]", { uidTail: uid.slice(-6), msg: e?.message });
          }
        } else if (until && !isNaN(until.getTime())) {
          premiumUntilISO = until.toISOString();
        }

        res.status(200).json({ isPremium, premiumUntil: premiumUntilISO });
        return;
      }

      // finalizePayment (idempotent)
      if (method === "POST" && (op === "finalizePayment" || /\/rpc\/finalizePayment$/.test(url))) {
        const { paymentIntentId, sessionId } = req.body || {};
        let piId = paymentIntentId as string | undefined;

        if (!piId && sessionId) {
          const ses = await stripe.checkout.sessions.retrieve(String(sessionId));
          const sesUid =
            (ses?.metadata && (ses.metadata as any).userId) ||
            (typeof ses?.client_reference_id === "string" ? ses.client_reference_id : null);
          if (sesUid && String(sesUid) !== callerUid) {
            res.status(403).json({ error: "Forbidden" });
            return;
          }
          piId = typeof ses?.payment_intent === "string" ? (ses.payment_intent as string) : undefined;
        }

        if (!piId) {
          res.status(400).json({ error: "paymentIntentId or sessionId required" });
          return;
        }

        const paymentRef = fdb.collection("payments").doc(String(piId));
        const existed = await paymentRef.get();

        if (existed.exists && existed.data()?.status === "succeeded" && existed.data()?.premiumFulfilled === true) {
          const userId = existed.data()?.userId || null;
          if (userId && userId === callerUid) {
            const u = await fdb.collection("users").doc(userId).get();
            const until = u.exists && (u.data() as any)?.premiumUntil?.toDate ? (u.data() as any).premiumUntil.toDate() : null;
            res.status(200).json({ ok: true, already: true, premiumUntil: until ? until.toISOString() : null });
            return;
          }
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        const pi = await stripe.paymentIntents.retrieve(String(piId));
        const meta = pi.metadata || {};
        const userId: string | null = (meta as any).userId || (meta as any).uid || null;
        const planId: string | null = (meta as any).planId || (meta as any).plan || null;
        const payType: string | null = (meta as any).type || null;

        if (userId && userId !== callerUid) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        if (pi.status !== "succeeded") {
          res.status(200).json({ ok: false, status: pi.status });
          return;
        }

        await paymentRef.set(
          {
            status: "succeeded",
            amountPln: typeof pi.amount === "number" ? +(pi.amount / 100).toFixed(2) : null,
            currency: String(pi.currency || "").toUpperCase(),
            planId,
            type: payType,
            userId,
            finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        if (payType === "premium" && userId && planId && PLANS[planId]) {
          const months = PLANS[planId].months;
          const until = await extendUserPremium(userId, months);

          await paymentRef.set(
            { premiumFulfilled: true, premiumUntil: admin.firestore.Timestamp.fromDate(until) },
            { merge: true }
          );

          await recordUserSubscription({
            uid: userId,
            planId,
            amountPln: typeof pi.amount === "number" ? +(pi.amount / 100).toFixed(2) : null,
            currency: String(pi.currency || "").toUpperCase(),
            until,
            paymentIntentId: String(pi.id),
          });

          res.status(200).json({ ok: true, premiumUntil: until.toISOString() });
          return;
        }

        res.status(200).json({ ok: true, premiumUntil: null });
        return;
      }

      res.status(404).json({ error: "Not found", got: { method, url, op } });
    } catch (e: any) {
      const msg = e?.message || "Internal error";
      if (/Missing Authorization|Invalid token/i.test(msg)) {
        res.status(401).json({ error: msg });
        return;
      }
      logger.error("[paymentsApi][error]", { msg, stack: e?.stack });
      res.status(500).json({ error: msg });
    }
  }
);

/* =============================================================================
   Webhook – fulfillment (Stripe → my) — Premium only
============================================================================= */
async function fulfillPremiumFromPaymentIntent(pi: any) {
  const amountCents = Number(pi?.amount) || 0;
  const amountPln = +(amountCents / 100).toFixed(2);
  const currency = String(pi?.currency || "pln").toUpperCase();
  const meta = pi?.metadata || {};
  const userId: string | null = (meta as any).userId || (meta as any).uid || null;
  const planId: string | null = (meta as any).planId || (meta as any).plan || null;
  const payType: string | null = (meta as any).type || null;

  if (payType !== "premium" || !userId || !planId || !PLANS[planId]) {
    logger.info("[webhook] skip (not premium / missing meta)", { payType, hasUser: !!userId, planId });
    return;
  }

  const paymentRef = fdb.collection("payments").doc(String(pi.id));
  const existed = await paymentRef.get();
  if (existed.exists && existed.data()?.status === "succeeded" && existed.data()?.premiumFulfilled === true) {
    logger.info("[webhook] already fulfilled", { piId: String(pi.id) });
    return;
  }

  await paymentRef.set(
    {
      status: "succeeded",
      amountPln,
      currency,
      planId,
      type: payType,
      userId,
      webhookAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const months = PLANS[planId].months;
  const until = await extendUserPremium(userId, months);

  await paymentRef.set(
    { premiumFulfilled: true, premiumUntil: admin.firestore.Timestamp.fromDate(until) },
    { merge: true }
  );

  await recordUserSubscription({
    uid: userId,
    planId,
    amountPln,
    currency,
    until,
    paymentIntentId: String(pi.id),
  });

  // e-mail (opcjonalny)
  try {
    let to: string | null = null;
    let dn: string | null = null;

    // Firestore users
    try {
      const uDoc = await fdb.collection("users").doc(userId).get();
      if (uDoc.exists) {
        const u = uDoc.data() as any;
        to = u.contactEmail || u.email || null;
        dn = u.displayName || u.name || null;
      }
    } catch {}

    // Firebase Auth
    if (!to) {
      try {
        const au = await admin.auth().getUser(userId);
        to = au?.email || null;
        if (!dn) dn = au?.displayName || null;
      } catch {}
    }

    if (to && process.env.RESEND_API_KEY) {
      await sendPremiumEmailResend(to, dn, planId, until);
      await paymentRef.set(
        { premiumEmailSent: true, premiumEmailSentAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
  } catch (e: any) {
    logger.warn("[webhook][email fail]", { msg: e?.message });
  }
}

async function webhookCore(req: any, res: any): Promise<void> {
  const stripe = getStripe();
  const sig = req.headers["stripe-signature"] as string;

  try {
    const secret = String(process.env.STRIPE_SUBS_WEBHOOK_SECRET || "")
      .trim()
      .replace(/^['"]|['"]$/g, "");

    const event = stripe.webhooks.constructEvent(req.rawBody, sig, secret);
    const type = event?.type;
    const obj = event?.data?.object || {};

    if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
      const session = obj;
      const paymentStatus = String(session?.payment_status || "");
      const piId = typeof session?.payment_intent === "string" ? session.payment_intent : null;

      if (type === "checkout.session.completed" && paymentStatus && paymentStatus !== "paid") {
        res.status(200).send("[ok-not-paid]");
        return;
      }
      if (!piId) {
        res.status(200).send("[ok-no-pi]");
        return;
      }

      const pi = await stripe.paymentIntents.retrieve(String(piId));
      if (pi.status !== "succeeded") {
        res.status(200).send("[ok-pi-not-succeeded]");
        return;
      }

      await fulfillPremiumFromPaymentIntent(pi);
      res.status(200).send("[ok]");
      return;
    }

    if (type === "payment_intent.succeeded") {
      await fulfillPremiumFromPaymentIntent(obj);
      res.status(200).send("[ok]");
      return;
    }

    res.status(200).send("[ok-ignored]");
  } catch (err: any) {
    logger.error("[webhook][error]", { msg: err?.message, stack: err?.stack });
    res.status(400).send("Webhook error");
  }
}

export const handleSubscriptionWebhook = onRequest(
  {
    region: "europe-central2",
    timeoutSeconds: 30,
    secrets: ["STRIPE_SECRET_KEY", "RESEND_API_KEY", "STRIPE_SUBS_WEBHOOK_SECRET"],
  },
  webhookCore
);

/* =============================================================================
   CRON: czyszczenie wygasłych Premium (co 24h)
============================================================================= */
export const expirePremiumDaily = onSchedule(
  { schedule: "every 24 hours", region: "europe-central2", timeZone: "Europe/Warsaw" },
  async () => {
    const now = new Date();
    const usersCol = fdb.collection("users");

    let processed = 0;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    while (true) {
      let q = usersCol
        .where("isPremium", "==", true)
        .orderBy("premiumUntil", "asc")
        .limit(500) as FirebaseFirestore.Query;

      if (lastDoc) q = (q as FirebaseFirestore.Query).startAfter(lastDoc);

      const snap = await q.get();
      if (snap.empty) break;

      const batch = fdb.batch();
      let anyToCommit = false;

      snap.docs.forEach((docSnap) => {
        const d = docSnap.data() as any;
        const until = toJsDate(d?.premiumUntil);
        if (until && until <= now) {
          anyToCommit = true;
          batch.set(
            docSnap.ref,
            {
              isPremium: false,
              premiumUntil: null,
              premiumUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
              premiumExpiredAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          processed++;
        }
      });

      if (anyToCommit) await batch.commit();

      const last = snap.docs[snap.docs.length - 1];
      lastDoc = last || null;

      const lastData = last?.data() as any;
      const lastUntil = toJsDate(lastData?.premiumUntil);
      if (lastUntil && lastUntil > now) break;
    }

    logger.info("[expirePremiumDaily] done", { processed, at: now.toISOString() });
  }
);
