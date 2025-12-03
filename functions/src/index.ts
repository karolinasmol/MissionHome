import * as admin from "firebase-admin";

// 🔥 Inicjalizacja tylko raz — poprawiona wersja
if (!admin.apps.length) {
  admin.initializeApp();
}

// EXP system
export { onMissionCompleted } from "./exp";

// Repeat system
export { handleRepeatingMissions } from "./repeatmission";

// Premium / payments
export {
  paymentsApi,
  handleSubscriptionWebhook,
  expirePremiumDaily
} from "./premium";

// DAILY RANDOM 7 TASKS SYSTEM (NEW)
export {
  generateDailyChallenges,
  onChallengeAcceptedCreateMission,
  onChallengeDeclinedStamp,
} from "./nowewyzwanie";

// NOTIFICATIONS
export {
  onFamilyInviteCreated,
  onFamilyInviteUpdated,
  onFriendshipCreated,
  onFriendshipUpdated,
  onMissionLogCreated,
  onUserLevelUpdated,
} from "./missionhome_notifications";
