import { useEffect, useState } from "react";
import {
  auth,
  db,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "../firebase/firebase.web.js";   // <--- poprawiona ścieżka !!!

export function useFamily() {
  const [family, setFamily] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        return;
      }

      // -----------------------------
      // 🔥 Pobieranie danych użytkownika
      // -----------------------------
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data();

      if (!userData?.familyId) {
        setFamily(null);
        setMembers([]);
        setLoading(false);
        return;
      }

      const familyId = userData.familyId;

      // -----------------------------
      // 🔥 Pobieranie info o rodzinie
      // -----------------------------
      const familyDoc = await getDoc(doc(db, "families", familyId));
      setFamily({ id: familyDoc.id, ...familyDoc.data() });

      // -----------------------------
      // 🔥 Pobieranie członków rodziny
      // -----------------------------
      const q = query(
        collection(db, "users"),
        where("familyId", "==", familyId)
      );

      const snapshot = await getDocs(q);

      setMembers(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      );

      setLoading(false);
    };

    load();
  }, []);

  return { family, members, loading };
}
