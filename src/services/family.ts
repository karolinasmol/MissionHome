import { db, doc, updateDoc, getDoc, query, where, getDocs, collection } from "../firebase/firebase.web";

export async function findUserByEmail(email) {
  const q = query(collection("users"), where("email", "==", email));
  const res = await getDocs(q);

  if (res.empty) return null;
  return { id: res.docs[0].id, ...res.docs[0].data() };
}

export async function addUserToFamily(userUid, familyId) {
  const userRef = doc("users", userUid);
  await updateDoc(userRef, { familyId });

  const familyRef = doc("families", familyId);
  const familySnap = await getDoc(familyRef);
  const familyData = familySnap.data();

  const newMembers = [...(familyData.members || []), userUid];
  await updateDoc(familyRef, { members: newMembers });
}
