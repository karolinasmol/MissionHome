// src/services/missions.ts
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";

export type RepeatType = "none" | "daily" | "weekly" | "monthly";

export interface MissionRepeat {
  type: RepeatType;
}

export interface CreateMissionInput {
  title: string;

  assignedToUserId: string;
  assignedToName: string;

  assignedByUserId?: string | null;
  assignedByName?: string | null;

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

  const createdByUserId = user.uid;
  const createdByName = user.displayName || input.assignedByName || "Ty";

  const docData = {
    title: input.title,
    dueDate: input.dueDate, // Firestore zrobi z tego Timestamp
    repeat: input.repeat || { type: "none" as RepeatType },

    // kto jest adresatem zadania
    assignedToUserId: input.assignedToUserId,
    assignedToName: input.assignedToName,

    // kto przypisał (jeśli wysyłasz task komuś)
    assignedByUserId: input.assignedByUserId || createdByUserId,
    assignedByName: input.assignedByName || createdByName,

    // kto utworzył dokument
    createdByUserId,
    createdByName,

    completed: false,
    archived: false,
    skipDates: [],

    expValue: input.expValue ?? 0,
    expMode: input.expMode ?? "easy",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await addDoc(collection(db, "missions"), docData);
}
