// functions/src/missionhome_notifications.ts
import * as admin from "firebase-admin";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const REGION = "europe-central2";

/** ====== Typy ====== */
type NotifType =
  | "FRIEND_INVITE"
  | "FRIEND_INVITE_ACCEPTED"
  | "FRIEND_INVITE_DECLINED"
  | "FAMILY_INVITE"
  | "FAMILY_INVITE_ACCEPTED"
  | "FAMILY_INVITE_DECLINED"
  | "EXP_GAIN"
  | "LEVEL_UP";

async function writeNotification(
  userId: string,
  notifId: string,
  data: Record<string, any> & {
    type: NotifType;
    title: string;
    body?: string | null;
  }
) {
  if (!userId) return;
  const ref = db.doc(`users/${userId}/notifications/${notifId}`);
  try {
    await ref.create({
      ...data,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e: any) {
    // code === 6 => ALREADY_EXISTS
    if (e?.code !== 6) console.error("[writeNotification]", e?.message || e);
  }
}

/** Upsert (SET+merge) — przydaje się do re-sendów i aktualizacji istniejącej notyfikacji */
async function upsertNotification(
  userId: string,
  notifId: string,
  data: Record<string, any> & {
    type: NotifType;
    title: string;
    body?: string | null;
  }
) {
  if (!userId) return;
  const ref = db.doc(`users/${userId}/notifications/${notifId}`);
  await ref.set(
    {
      ...data,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** ====== 1) FAMILY INVITE — po utworzeniu zaproszenia ====== */
export const onFamilyInviteCreated = onDocumentCreated(
  {
    document: "family_invites/{inviteId}",
    region: REGION,
  },
  async (event) => {
    try {
      const inviteId = String(event.params.inviteId || "");
      const data = event.data?.data() as any;
      if (!inviteId || !data) return;

      const toUserId = String(data.toUserId || "");
      const fromUserId = String(data.fromUserId || "");
      const familyId = String(data.familyId || "");
      const status = String(data.status || "pending");

      if (!toUserId || status !== "pending") return;

      const fromDisplayName =
        (data.fromDisplayName as string) ||
        (data.fromName as string) ||
        (data.fromEmail as string) ||
        "Użytkownik";

      await upsertNotification(toUserId, `family_invite_${inviteId}`, {
        type: "FAMILY_INVITE",
        title: "Zaproszenie do rodziny",
        body: `${fromDisplayName} zaprasza Cię do rodziny.`,
        inviteId,
        familyId: familyId || null,
        fromUserId: fromUserId || null,
        fromDisplayName: data.fromDisplayName || null,
        fromEmail: data.fromEmail || null,
        status: "pending",
      });
    } catch (e) {
      console.error("[onFamilyInviteCreated]", e);
    }
  }
);

/** ====== 2) FAMILY INVITE — status changed (accepted/declined/cancelled + resend) ====== */
export const onFamilyInviteUpdated = onDocumentUpdated(
  {
    document: "family_invites/{inviteId}",
    region: REGION,
  },
  async (event) => {
    try {
      const inviteId = String(event.params.inviteId || "");
      const before = event.data?.before.data() as any;
      const after = event.data?.after.data() as any;
      if (!inviteId || !before || !after) return;

      const beforeStatus = String(before.status || "pending");
      const afterStatus = String(after.status || "pending");

      if (beforeStatus === afterStatus) return;

      const toUserId = String(after.toUserId || "");
      const fromUserId = String(after.fromUserId || "");
      const familyId = String(after.familyId || "");

      // RESEND: np. cancelled/declined -> pending (bo macie stałe ID dokumentu)
      if (afterStatus === "pending" && beforeStatus !== "pending") {
        if (!toUserId) return;

        const fromDisplayName =
          (after.fromDisplayName as string) ||
          (after.fromName as string) ||
          (after.fromEmail as string) ||
          "Użytkownik";

        await upsertNotification(toUserId, `family_invite_${inviteId}`, {
          type: "FAMILY_INVITE",
          title: "Zaproszenie do rodziny",
          body: `${fromDisplayName} zaprasza Cię do rodziny.`,
          inviteId,
          familyId: familyId || null,
          fromUserId: fromUserId || null,
          fromDisplayName: after.fromDisplayName || null,
          fromEmail: after.fromEmail || null,
          status: "pending",
        });
        return;
      }

      // dalej: klasyczna ścieżka pending -> resolved
      if (beforeStatus !== "pending") return;

      // zaktualizuj notif u odbiorcy (żeby UI wiedziało, że już "rozwiązane")
      if (toUserId) {
        await db.doc(`users/${toUserId}/notifications/family_invite_${inviteId}`).set(
          {
            status: afterStatus,
            resolved: afterStatus !== "pending",
            resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
            familyId: familyId || null,
            inviteId,
          },
          { merge: true }
        );
      }

      // powiadom nadawcę o decyzji
      if (!fromUserId) return;

      const toName =
        (after.toDisplayName as string) ||
        (after.toName as string) ||
        (after.toEmail as string) ||
        "Użytkownik";

      if (afterStatus === "accepted") {
        await writeNotification(fromUserId, `family_invite_accepted_${inviteId}`, {
          type: "FAMILY_INVITE_ACCEPTED",
          title: "Zaproszenie przyjęte ✅",
          body: `${toName} dołączył(a) do Twojej rodziny.`,
          inviteId,
          familyId: familyId || null,
          toUserId: toUserId || null,
        });
      } else if (afterStatus === "declined") {
        await writeNotification(fromUserId, `family_invite_declined_${inviteId}`, {
          type: "FAMILY_INVITE_DECLINED",
          title: "Zaproszenie odrzucone",
          body: `${toName} odrzucił(a) zaproszenie do rodziny.`,
          inviteId,
          familyId: familyId || null,
          toUserId: toUserId || null,
        });
      }
    } catch (e) {
      console.error("[onFamilyInviteUpdated]", e);
    }
  }
);

/** ====== 3) FRIEND INVITE — po utworzeniu friendship (pending) ====== */
export const onFriendshipCreated = onDocumentCreated(
  {
    document: "friendships/{friendshipId}",
    region: REGION,
  },
  async (event) => {
    try {
      const friendshipId = String(event.params.friendshipId || "");
      const data = event.data?.data() as any;
      if (!friendshipId || !data) return;

      const status = String(data.status || "");
      if (status !== "pending") return;

      const requestedTo = String(data.requestedTo || "");
      const requestedBy = String(data.requestedBy || "");
      if (!requestedTo || !requestedBy) return;

      // profiles: aUid/bUid są sortowane, więc profil requestera trzeba dobrać
      const aUid = String(data.aUid || "");
      const requesterProfile = requestedBy === aUid ? (data.aProfile as any) : (data.bProfile as any);

      const fromName =
        (requesterProfile?.displayName as string) ||
        (requesterProfile?.username as string) ||
        (requesterProfile?.email as string) ||
        "Użytkownik";

      await upsertNotification(requestedTo, `friend_invite_${friendshipId}`, {
        type: "FRIEND_INVITE",
        title: "Zaproszenie do znajomych",
        body: `${fromName} wysłał(a) Ci zaproszenie do znajomych.`,
        friendshipId,
        fromUserId: requestedBy,
        status: "pending",
      });
    } catch (e) {
      console.error("[onFriendshipCreated]", e);
    }
  }
);

/** ====== 4) FRIEND INVITE — status changed (accepted/declined/cancelled + resend) ====== */
export const onFriendshipUpdated = onDocumentUpdated(
  {
    document: "friendships/{friendshipId}",
    region: REGION,
  },
  async (event) => {
    try {
      const friendshipId = String(event.params.friendshipId || "");
      const before = event.data?.before.data() as any;
      const after = event.data?.after.data() as any;
      if (!friendshipId || !before || !after) return;

      const beforeStatus = String(before.status || "");
      const afterStatus = String(after.status || "");
      if (beforeStatus === afterStatus) return;

      const requestedTo = String(after.requestedTo || "");
      const requestedBy = String(after.requestedBy || "");
      if (!requestedTo || !requestedBy) return;

      const aUid = String(after.aUid || "");
      const requesterProfile = requestedBy === aUid ? (after.aProfile as any) : (after.bProfile as any);
      const targetProfile = requestedTo === aUid ? (after.aProfile as any) : (after.bProfile as any);

      const fromName =
        (requesterProfile?.displayName as string) ||
        (requesterProfile?.username as string) ||
        (requesterProfile?.email as string) ||
        "Użytkownik";

      const toName =
        (targetProfile?.displayName as string) ||
        (targetProfile?.username as string) ||
        (targetProfile?.email as string) ||
        "Użytkownik";

      // RESEND: np. cancelled/declined -> pending
      if (afterStatus === "pending" && beforeStatus !== "pending") {
        await upsertNotification(requestedTo, `friend_invite_${friendshipId}`, {
          type: "FRIEND_INVITE",
          title: "Zaproszenie do znajomych",
          body: `${fromName} wysłał(a) Ci zaproszenie do znajomych.`,
          friendshipId,
          fromUserId: requestedBy,
          status: "pending",
        });
        return;
      }

      // pending -> resolved
      if (beforeStatus !== "pending") return;

      // zaktualizuj notif u odbiorcy (UI: resolved)
      await db.doc(`users/${requestedTo}/notifications/friend_invite_${friendshipId}`).set(
        {
          status: afterStatus,
          resolved: afterStatus !== "pending",
          resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          friendshipId,
        },
        { merge: true }
      );

      // powiadom nadawcę o decyzji
      if (afterStatus === "accepted") {
        await writeNotification(requestedBy, `friend_invite_accepted_${friendshipId}`, {
          type: "FRIEND_INVITE_ACCEPTED",
          title: "Zaproszenie przyjęte ✅",
          body: `${toName} zaakceptował(a) zaproszenie do znajomych.`,
          friendshipId,
          toUserId: requestedTo,
        });
      } else if (afterStatus === "declined") {
        await writeNotification(requestedBy, `friend_invite_declined_${friendshipId}`, {
          type: "FRIEND_INVITE_DECLINED",
          title: "Zaproszenie odrzucone",
          body: `${toName} odrzucił(a) zaproszenie do znajomych.`,
          friendshipId,
          toUserId: requestedTo,
        });
      }
    } catch (e) {
      console.error("[onFriendshipUpdated]", e);
    }
  }
);

/** ====== 5) EXP GAIN — po utworzeniu mission_logs (robi je exp.ts) ====== */
export const onMissionLogCreated = onDocumentCreated(
  {
    document: "mission_logs/{logId}",
    region: REGION,
  },
  async (event) => {
    try {
      const logId = String(event.params.logId || "");
      const data = event.data?.data() as any;
      if (!logId || !data) return;

      const userId = String(data.userId || "");
      const missionId = String(data.missionId || "");
      const expGain = Number(data.expGain || 0);

      if (!userId || expGain <= 0) return;

      let missionTitle: string | null = null;
      if (missionId) {
        try {
          const mSnap = await db.doc(`missions/${missionId}`).get();
          if (mSnap.exists) missionTitle = String((mSnap.data() as any)?.title || "");
        } catch {}
      }

      await writeNotification(userId, `exp_${logId}`, {
        type: "EXP_GAIN",
        title: `+${expGain} EXP 💥`,
        body: missionTitle ? `Za misję: „${missionTitle}”.` : "Za wykonaną misję.",
        missionId: missionId || null,
        expGain,
      });
    } catch (e) {
      console.error("[onMissionLogCreated]", e);
    }
  }
);

/** ====== 6) LEVEL UP — po update users/{userId} gdy level rośnie ====== */
export const onUserLevelUpdated = onDocumentUpdated(
  {
    document: "users/{userId}",
    region: REGION,
  },
  async (event) => {
    try {
      const userId = String(event.params.userId || "");
      const before = event.data?.before.data() as any;
      const after = event.data?.after.data() as any;
      if (!userId || !before || !after) return;

      const beforeLevel = Number(before.level || 1);
      const afterLevel = Number(after.level || 1);

      if (!Number.isFinite(beforeLevel) || !Number.isFinite(afterLevel)) return;
      if (afterLevel <= beforeLevel) return;

      await writeNotification(userId, `level_up_${afterLevel}`, {
        type: "LEVEL_UP",
        title: `Level up! LVL ${afterLevel} 🏆`,
        body: `Awansowałeś z LVL ${beforeLevel} → ${afterLevel}.`,
        prevLevel: beforeLevel,
        nextLevel: afterLevel,
        totalExp: Number(after.totalExp || 0),
      });
    } catch (e) {
      console.error("[onUserLevelUpdated]", e);
    }
  }
);
