import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/**
 * Zwraca łączny EXP wymagany na podany level.
 *
 * Założenia:
 *  - do LVL 2 potrzeba 100 EXP
 *  - każdy kolejny level wymaga +50 EXP więcej niż poprzedni
 *
 * Przykład (wartości łączne):
 *  LVL 1 → 0 EXP
 *  LVL 2 → 100 EXP
 *  LVL 3 → 250 EXP (100 + 150)
 *  LVL 4 → 450 EXP (100 + 150 + 200)
 *  LVL 5 → 700 EXP (100 + 150 + 200 + 250)
 */
function requiredExpForLevel(level: number): number {
  if (level <= 1) return 0;

  let total = 0;
  for (let l = 1; l < level; l++) {
    const gainForThisLevelUp = 100 + 50 * (l - 1);
    total += gainForThisLevelUp;
  }
  return total;
}

export const onMissionCompleted = onDocumentUpdated(
  {
    region: "europe-central2",
    document: "missions/{missionId}",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) return;

    // przejście completed false → true
    const wasCompleted = before.completed === true;
    const isCompleted = after.completed === true;
    if (!isCompleted || wasCompleted) return;

    const missionId = event.params.missionId;

    const userId = after.assignedToUserId as string | undefined;
    if (!userId) return;

    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();
    const user = userSnap.data();
    if (!user) return;

    const expGain = (after.expValue as number | undefined) ?? 0;
    if (expGain <= 0) {
      console.log(`Mission ${missionId} has no expValue`);
      return;
    }

    const currentExp = (user.totalExp as number | undefined) ?? 0;
    let level = (user.level as number | undefined) ?? 1;

    const newExp = currentExp + expGain;

    // level up loop
    while (newExp >= requiredExpForLevel(level + 1)) {
      level++;
    }

    await userRef.update({
      totalExp: newExp,
      level,
      updatedAt: admin.firestore.Timestamp.now(),
    });

    await db.collection("mission_logs").add({
      missionId,
      userId,
      expGain,
      levelAfter: level,
      totalExpAfter: newExp,
      timestamp: admin.firestore.Timestamp.now(),
    });

    console.log(
      `User ${userId} gained ${expGain} EXP for mission ${missionId}, new total: ${newExp}, level: ${level}`
    );
  }
);
