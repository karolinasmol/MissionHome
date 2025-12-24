// src/services/missions.ts
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";

export type RepeatType = "none" | "daily" | "weekly" | "monthly";

export interface MissionRepeat {
  type: RepeatType;
}

export interface CreateMissionInput {
  title: string;

  // ✅ jeśli misja ma być “rodzinna”
  familyId?: string | null;

  assignedToUserId: string;
  assignedToName: string;

  assignedByUserId?: string | null;
  assignedByName?: string | null;

  // ✅ avatary (opcjonalnie)
  assignedByAvatarUrl?: string | null;
  assignedToAvatarUrl?: string | null;

  // ✅ creator (opcjonalnie, ale najczęściej ustawisz na siebie)
  createdByUserId?: string | null;
  createdByName?: string | null;
  createdByAvatarUrl?: string | null;

  dueDate: Date;
  repeat: MissionRepeat;

  expValue?: number;
  expMode?: "easy" | "medium" | "hard";
}

export async function createMission(input: CreateMissionInput) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Brak zalogowanego użytkownika");
  }

  const createdByUserId = (input.createdByUserId || user.uid) as string;
  const createdByName =
    input.createdByName || user.displayName || input.assignedByName || "Ty";

  const assignedByUserId = (input.assignedByUserId || createdByUserId) as string;
  const assignedByName = input.assignedByName || createdByName;

  const docData = {
    title: input.title.trim(),

    // ✅ ważne: jak brak rodziny -> null (dla rules i query)
    familyId: input.familyId ?? null,

    dueDate: input.dueDate, // Firestore zamieni na Timestamp
    repeat: input.repeat || { type: "none" as RepeatType },

    // kto jest adresatem zadania
    assignedToUserId: input.assignedToUserId,
    assignedToName: input.assignedToName,
    assignedToAvatarUrl: input.assignedToAvatarUrl ?? null,

    // kto przypisał
    assignedByUserId,
    assignedByName,
    assignedByAvatarUrl: input.assignedByAvatarUrl ?? null,

    // kto utworzył dokument
    createdByUserId,
    createdByName,
    createdByAvatarUrl: input.createdByAvatarUrl ?? (user.photoURL ?? null),

    // status
    completed: false,
    completedAt: null,
    completedByUserId: null,
    completedByName: null,

    archived: false,
    skipDates: [],

    expValue: input.expValue ?? 0,
    expMode: input.expMode ?? "easy",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await addDoc(collection(db, "missions"), docData);
}

//src/services/missions.ts
