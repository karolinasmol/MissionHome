// src/hooks/useFamily.ts
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import { auth, db } from "../firebase/firebase.web.js"; // ✅ poprawiona ścieżka

export function useFamily() {
  const [family, setFamily] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const safeSet = <T,>(setter: (v: T) => void, value: T) => {
      if (!cancelled) setter(value);
    };

    const load = async (uid: string) => {
      safeSet(setLoading, true);

      try {
        // -----------------------------
        // 🔥 Pobieranie danych użytkownika
        // -----------------------------
        const userDocSnap = await getDoc(doc(db, "users", uid));
        const userData = userDocSnap.exists() ? (userDocSnap.data() as any) : null;

        if (!userData?.familyId) {
          safeSet(setFamily, null);
          safeSet(setMembers, []);
          safeSet(setLoading, false);
          return;
        }

        const familyId = String(userData.familyId);

        // -----------------------------
        // 🔥 Pobieranie info o rodzinie
        // -----------------------------
        const familyDocSnap = await getDoc(doc(db, "families", familyId));
        const familyData = familyDocSnap.exists() ? (familyDocSnap.data() as any) : null;

        safeSet(setFamily, familyData ? { id: familyDocSnap.id, ...familyData } : { id: familyId });

        // -----------------------------
        // 🔥 Pobieranie członków rodziny
        // -----------------------------
        const qRef = query(collection(db, "users"), where("familyId", "==", familyId));
        const snapshot = await getDocs(qRef);

        safeSet(
          setMembers,
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        );

        safeSet(setLoading, false);
      } catch (err: any) {
        console.error("🟥 useFamily error:", err?.code, err?.message, err);

        // ✅ przy braku uprawnień nie rozwalamy aplikacji – zwracamy pusto
        safeSet(setFamily, null);
        safeSet(setMembers, []);
        safeSet(setLoading, false);
      }
    };

    // ✅ nie polegamy na auth.currentUser (często null na starcie)
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        safeSet(setFamily, null);
        safeSet(setMembers, []);
        safeSet(setLoading, false);
        return;
      }
      load(user.uid);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return { family, members, loading };
}
