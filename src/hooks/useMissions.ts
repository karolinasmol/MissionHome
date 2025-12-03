// src/hooks/useMissions.ts
import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Query,
} from "firebase/firestore";
import { db } from "../firebase/firebase.web";
import { auth } from "../firebase/firebase";
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

  useEffect(() => {
    const currentUser = auth.currentUser;
    const myUid = currentUser?.uid ?? null;
    const colRef = collection(db, "missions");

    // === PRZYPADEK 1: brak zalogowanego usera – fallback: wszystkie misje ===
    if (!myUid) {
      const qAll = query(colRef, orderBy("dueDate", "asc"));

      const unsub = onSnapshot(
        qAll,
        (snap) => {
          const list: Mission[] = [];

          snap.forEach((docSnap) => {
            list.push({
              id: docSnap.id,
              ...(docSnap.data() as any),
            });
          });

          list.sort((a, b) => getDueTime(a) - getDueTime(b));
          setMissions(list);
          setLoading(false);
        },
        (err) => {
          console.error("Error loading missions (no user):", err);
          setLoading(false);
        }
      );

      return () => unsub();
    }

    // === PRZYPADEK 2: zalogowany user – jego misje + od niego ===

    // 🔥 KLUCZOWE: auto-chore misje wpadają przez assignedToUserId == myUid
    const qAssignedToMe: Query = query(
      colRef,
      where("assignedToUserId", "==", myUid)
    );

    const qByMe: Query = query(colRef, where("assignedByUserId", "==", myUid));

    const qCreatedByMe: Query = query(
      colRef,
      where("createdByUserId", "==", myUid)
    );

    // lokalna pamięć misji
    const cache = new Map<string, Mission>();
    let firstLoaded = false;

    const handleSnapshot = (snap: any) => {
      let changed = false;

      snap.docChanges().forEach((change: any) => {
        const id = change.doc.id;

        if (change.type === "removed") {
          if (cache.has(id)) {
            cache.delete(id);
            changed = true;
          }
          return;
        }

        const data = change.doc.data() as any;
        const mission: Mission = { id, ...data };

        cache.set(id, mission);
        changed = true;
      });

      if (changed) {
        const list = Array.from(cache.values()).sort(
          (a, b) => getDueTime(a) - getDueTime(b)
        );
        setMissions(list);
      }

      if (!firstLoaded) {
        firstLoaded = true;
        setLoading(false);
      }
    };

    const handleError = (err: any) => {
      console.error("Error loading missions:", err);
      if (!firstLoaded) {
        firstLoaded = true;
        setLoading(false);
      }
    };

    // subskrypcje
    const unsub1 = onSnapshot(qAssignedToMe, handleSnapshot, handleError);
    const unsub2 = onSnapshot(qByMe, handleSnapshot, handleError);
    const unsub3 = onSnapshot(qCreatedByMe, handleSnapshot, handleError);

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);

  return { missions, loading };
}
