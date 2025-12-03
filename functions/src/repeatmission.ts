import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

const db = admin.firestore();
const REGION = "europe-central2";

export const handleRepeatingMissions = onDocumentUpdated(
  {
    region: REGION,
    document: "missions/{missionId}",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const was = before.completed === true;
    const now = after.completed === true;

    if (!now || was) return;

    const repeatType = after.repeat?.type ?? "none";
    if (repeatType === "none") return;

    let dueDate: Date;
    try {
      dueDate = after.dueDate.toDate ? after.dueDate.toDate() : new Date(after.dueDate);
    } catch {
      return;
    }

    const next = new Date(dueDate);
    switch (repeatType) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
    }

    const newData = {
      ...after,
      dueDate: admin.firestore.Timestamp.fromDate(next),
      completed: false,
      completedAt: null,
      archived: false,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      _cycleGeneratedFrom: event.params.missionId,
    };

delete (newData as any)._cycleGenerated;
delete (newData as any)._cycleGeneratedFrom;


    await db.collection("missions").add(newData);
  }
);
