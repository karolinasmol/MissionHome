import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where, limit, or } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

import { db, auth } from "../firebase/firebase";
import { Mission } from "../context/TasksContext";

interface UseMissionsResult {
  missions: Mission[];
  loading: boolean;
}

// helper do sortowania po dueDate
function getDueTime(m: any): number {
  const v = m?.dueDate;
  if (!v) return 0;
  try {
    if (v instanceof Date) return v.getTime();
    if (typeof v.toDate === "function") return v.toDate().getTime();
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
}

export function useMissions(): UseMissionsResult {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  const [uid, setUid] = useState<string | null>(auth?.currentUser?.uid ?? null);

  // ✅ trzymamy mapę misji w ref — szybkie aktualizacje po docChanges()
  const missionsMapRef = useRef<Map<string, Mission>>(new Map());
  const unsubRef = useRef<null | (() => void)>(null);

  // ✅ zawsze czekamy na Auth (żeby nie odpalać zapytań jako "niezalogowany")
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    // sprzątnij poprzedni listener
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    // reset stanu na zmianę usera
    missionsMapRef.current = new Map();
    setMissions([]);

    // ✅ brak usera = nie czytamy nic z missions (Rules i tak zablokują)
    if (!uid) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const colRef = collection(db, "missions");

    // ✅ JEDEN listener, jedna lista, brak “bucket overwrite”
    // Dokument pojawia się tylko raz, a update (completed/completedDates) od razu odświeża UI.
    const q = query(
      colRef,
      or(
        where("assignedToUserId", "==", uid),
        where("assignedByUserId", "==", uid),
        where("createdByUserId", "==", uid)
      ),
      limit(500)
    );

    unsubRef.current = onSnapshot(
      q,
      (snap) => {
        // incremental updates (najszybsze + najmniej bugów referencji)
        snap.docChanges().forEach((ch) => {
          const id = ch.doc.id;

          if (ch.type === "removed") {
            missionsMapRef.current.delete(id);
            return;
          }

          // ✅ zawsze nowy obiekt (ważne dla React/wyliczeń useMemo w UI)
          missionsMapRef.current.set(id, { id, ...(ch.doc.data() as any) } as Mission);
        });

        const list = Array.from(missionsMapRef.current.values())
          .map((m) => ({ ...(m as any) } as Mission)) // ✅ nowa referencja per element
          .sort((a, b) => getDueTime(a) - getDueTime(b));

        setMissions(list);
        setLoading(false);
      },
      (err: any) => {
        console.error("Error loading missions:", err?.code, err?.message, err);
        setLoading(false);
      }
    );

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [uid]);

  return { missions, loading };
}

// src/hooks/useMissions.ts
