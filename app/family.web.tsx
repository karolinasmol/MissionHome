import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Platform,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";
import { auth, db } from "../src/firebase/firebase";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useFamily } from "../src/hooks/useFamily";

type UserLite = {
  uid: string;
  docId: string;
  displayName?: string;
  username?: string;
  usernameLower?: string;
  email?: string;
  photoURL?: string | null;
  city?: string;
};

type UserProfileSnap = {
  uid: string;
  docId?: string | null;
  displayName?: string;
  username?: string;
  email?: string;
  photoURL?: string | null;
  city?: string;
};

type FriendshipDoc = {
  id: string;
  aUid: string;
  bUid: string;
  aProfile?: UserProfileSnap;
  bProfile?: UserProfileSnap;
  status: "pending" | "accepted" | "declined" | "cancelled";
  requestedBy: string;
  requestedTo: string;
  createdAt?: any;
  updatedAt?: any;
};

type FamilyInviteDoc = {
  id: string;
  familyId: string;
  fromUserId: string;
  fromDisplayName?: string;
  fromEmail?: string;
  toUserId: string;
  toDisplayName?: string;
  toEmail?: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt?: any;
  updatedAt?: any;
};

const MAX_FAMILY = 6;
const ERROR_COLOR = "#dc2626";

const isProbablyEmail = (val: string) => /@/.test(val);
const safeInitial = (name?: string) =>
  name?.trim()?.[0] ? name.trim()[0].toUpperCase() : "?";

const displayNameOf = (
  u?: Partial<UserLite> | Partial<UserProfileSnap> | null
) => {
  const dn = (u?.displayName || "").trim();
  const un = (u?.username || "").trim();
  const em = (u?.email || "").trim();
  if (dn) return dn;
  if (un) return un;
  if (em) return em.split("@")[0] || "Użytkownik";
  return "Użytkownik";
};

async function userExists(uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists();
  } catch {
    // jeśli rules / sieć blokuje: nie ukrywaj w UI "na siłę"
    return true;
  }
}

function normalizeUserDoc(docId: string, data: any): UserLite {
  const uid = String(data?.uid || docId || "");
  return {
    uid,
    docId,
    displayName: data?.displayName ?? "",
    username: data?.username ?? data?.nick ?? "",
    usernameLower:
      data?.usernameLower ??
      (data?.username
        ? String(data.username).toLowerCase()
        : data?.nick
        ? String(data.nick).toLowerCase()
        : ""),
    email: data?.email ?? "",
    photoURL: data?.photoURL ?? null,
    city: data?.city ?? data?.locationCity ?? data?.town ?? "",
  };
}

function toDateSafe(v: any): Date | null {
  try {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (v instanceof Timestamp) return v.toDate();
    if (typeof v?.toDate === "function") return v.toDate();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000);
    if (typeof v === "string") {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveUserByEmailOrNick(
  identifierRaw: string
): Promise<UserLite | null> {
  const identifier = (identifierRaw || "").trim();
  if (!identifier) return null;

  if (isProbablyEmail(identifier)) {
    const emailLower = identifier.toLowerCase();

    const qEmailLower = query(
      collection(db, "users"),
      where("email", "==", emailLower),
      limit(1)
    );
    const sLower = await getDocs(qEmailLower);
    if (!sLower.empty) return normalizeUserDoc(sLower.docs[0].id, sLower.docs[0].data());

    // fallback: jeśli ktoś ma w bazie email nie znormalizowany
    const qEmailRaw = query(
      collection(db, "users"),
      where("email", "==", identifier),
      limit(1)
    );
    const sRaw = await getDocs(qEmailRaw);
    if (!sRaw.empty) return normalizeUserDoc(sRaw.docs[0].id, sRaw.docs[0].data());

    return null;
  }

  const nickLower = identifier.toLowerCase();
  const qNick = query(
    collection(db, "users"),
    where("usernameLower", "==", nickLower),
    limit(1)
  );
  const sNick = await getDocs(qNick);
  if (sNick.empty) return null;
  return normalizeUserDoc(sNick.docs[0].id, sNick.docs[0].data());
}

const friendshipId = (uid1: string, uid2: string) => {
  const [a, b] = [uid1, uid2].sort();
  return `${a}__${b}`.replace(/[^\w-]/g, "_");
};

const familyInviteId = (familyId: string, fromUid: string, toUid: string) => {
  return `${familyId}__${fromUid}__${toUid}`.replace(/[^\w-]/g, "_");
};

// ======= Modal feedback (web+native) =======
type FeedbackModalState =
  | { visible: false }
  | { visible: true; title: string; message?: string; variant?: "success" | "error" | "info" };

function FeedbackModal({
  state,
  onClose,
  colors,
}: {
  state: FeedbackModalState;
  onClose: () => void;
  colors: any;
}) {
  if (!state.visible) return null;

  const icon =
    state.variant === "success"
      ? "checkmark-circle"
      : state.variant === "error"
      ? "close-circle"
      : "information-circle";
  const iconColor =
    state.variant === "success"
      ? "#22c55e"
      : state.variant === "error"
      ? "#ef4444"
      : colors.accent;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          padding: 16,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 480,
            backgroundColor: colors.card,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name={icon as any} size={26} color={iconColor} />
            <Text
              style={{
                color: colors.text,
                fontWeight: "900",
                fontSize: 16,
                flex: 1,
              }}
            >
              {state.title}
            </Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {!!state.message && (
            <Text
              style={{
                color: colors.textMuted,
                marginTop: 10,
                lineHeight: 18,
              }}
            >
              {state.message}
            </Text>
          )}

          <TouchableOpacity
            onPress={onClose}
            style={{
              marginTop: 14,
              backgroundColor: colors.accent,
              borderRadius: 12,
              paddingVertical: 10,
              alignItems: "center",
            }}
            activeOpacity={0.9}
          >
            <Text style={{ fontWeight: "900", color: "#022c22" }}>OK</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ======= Confirm modal (web+native, ładny) =======
type ConfirmModalState =
  | { visible: false }
  | {
      visible: true;
      title: string;
      message?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      destructive?: boolean;
    };

function ConfirmModal({
  state,
  onCancel,
  onConfirm,
  colors,
}: {
  state: ConfirmModalState;
  onCancel: () => void;
  onConfirm: () => void;
  colors: any;
}) {
  if (!state.visible) return null;

  const confirmLabel = state.confirmLabel || "Tak";
  const cancelLabel = state.cancelLabel || "Nie";
  const destructive = !!state.destructive;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          padding: 16,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 480,
            backgroundColor: colors.card,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons
              name={"alert-circle" as any}
              size={26}
              color={destructive ? ERROR_COLOR : colors.accent}
            />
            <Text
              style={{
                color: colors.text,
                fontWeight: "900",
                fontSize: 16,
                flex: 1,
              }}
            >
              {state.title}
            </Text>
            <TouchableOpacity onPress={onCancel} style={{ padding: 6 }}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {!!state.message && (
            <Text
              style={{
                color: colors.textMuted,
                marginTop: 10,
                lineHeight: 18,
              }}
            >
              {state.message}
            </Text>
          )}

          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 16,
            }}
          >
            <TouchableOpacity
              onPress={onCancel}
              style={{
                paddingVertical: 9,
                paddingHorizontal: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textMuted, fontWeight: "800" }}>
                {cancelLabel}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onConfirm}
              style={{
                paddingVertical: 9,
                paddingHorizontal: 14,
                borderRadius: 10,
                backgroundColor: destructive ? ERROR_COLOR : colors.accent,
              }}
            >
              <Text
                style={{
                  color: destructive ? "#fef2f2" : "#022c22",
                  fontWeight: "900",
                }}
              >
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function FamilyScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();

  // FAMILY (MAX) from hook
  const { family, members: rawMembers, loading: familyLoading } = useFamily();

  const myUid = auth.currentUser?.uid ?? null;

  const [modal, setModal] = useState<FeedbackModalState>({ visible: false });
  const showModal = (
    title: string,
    message?: string,
    variant: "success" | "error" | "info" = "info"
  ) => setModal({ visible: true, title, message, variant });

  // confirm modal state (usuń / opuść)
  const [confirmState, setConfirmState] = useState<ConfirmModalState>({
    visible: false,
  });
  const confirmActionRef = useRef<null | (() => void)>(null);

  const openConfirm = (
    cfg: {
      title: string;
      message?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      destructive?: boolean;
    },
    onConfirm: () => void
  ) => {
    confirmActionRef.current = onConfirm;
    setConfirmState({ visible: true, ...cfg });
  };

  const handleConfirmCancel = () => {
    setConfirmState((s) => ({ ...s, visible: false }));
    confirmActionRef.current = null;
  };

  const handleConfirmOk = () => {
    const fn = confirmActionRef.current;
    setConfirmState((s) => ({ ...s, visible: false }));
    confirmActionRef.current = null;
    if (fn) fn();
  };

  // my profile (/users) + premium
  const [myUserDocId, setMyUserDocId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<UserProfileSnap | null>(null);
  const [isPremium, setIsPremium] = useState(false);

  // fallback familyId if hook doesn’t see it immediately
  const [localFamilyId, setLocalFamilyId] = useState<string | null>(null);
  const familyId = useMemo(() => {
    const fid = (family as any)?.id ? String((family as any).id) : null;
    return fid || localFamilyId;
  }, [family, localFamilyId]);

  const members = useMemo<any[]>(() => (rawMembers ?? []) as any, [rawMembers]);

  // ===== ownerId źródło prawdy (families/{familyId}.ownerId), z fallbackiem na ID dokumentu rodziny =====
  const [familyOwnerId, setFamilyOwnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!familyId) {
      setFamilyOwnerId(null);
      return;
    }

    const famRef = doc(db, "families", String(familyId));
    const unsub = onSnapshot(
      famRef,
      (snap) => {
        const data: any = snap.data() || {};
        // jeśli nie ma ownerId, a u Was familyId == uid ownera -> fallback na ID dokumentu
        const owner = String(
          data?.ownerId || data?.ownerUid || data?.createdBy || snap.id || ""
        );
        setFamilyOwnerId(owner || null);
      },
      () => {
        // jeśli nie da się odczytać families (rules), nadal zakładamy, że owner == familyId (u Was)
        setFamilyOwnerId(String(familyId));
      }
    );

    return () => unsub();
  }, [familyId]);

  const effectiveOwnerId = useMemo(() => {
    if (familyOwnerId) return familyOwnerId;
    return familyId ? String(familyId) : null;
  }, [familyOwnerId, familyId]);

  // ===== “samoleczenie” danych: jeśli ja jestem ownerem, a w members mam role=member -> napraw =====
  useEffect(() => {
    const fid = familyId ? String(familyId) : "";
    const ownerUid = effectiveOwnerId ? String(effectiveOwnerId) : "";
    if (!fid || !myUid || !ownerUid) return;
    if (myUid !== ownerUid) return;

    // owner powinien mieć role=owner (to naprawia istniejące rodziny z błędnymi rolami)
    setDoc(
      doc(db, "families", fid, "members", ownerUid),
      { userId: ownerUid, role: "owner", updatedAt: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
  }, [familyId, effectiveOwnerId, myUid]);

  const memberIds = useMemo(() => {
    const s = new Set<string>();
    members.forEach((m: any) => {
      const id = String(m?.uid || m?.userId || m?.id || "");
      if (id) s.add(id);
    });
    if (myUid) s.add(myUid);
    return s;
  }, [members, myUid]);

  const myFamilyMember = useMemo(() => {
    if (!myUid) return null;
    return (
      (members as any[]).find((m: any) => {
        const id = String(m?.uid || m?.userId || m?.id || "");
        return id && id === myUid;
      }) || null
    );
  }, [members, myUid]);

  // ✅ owner rozpoznajemy po families.ownerId (fallback: familyId), a nie tylko po members.role
  const iAmOwner = useMemo(() => {
    if (!myUid) return false;
    if (effectiveOwnerId && String(effectiveOwnerId) === myUid) return true;
    if (myFamilyMember?.role === "owner") return true;
    // ostateczny fallback (u Was zwykle działa): owner == familyId
    if (familyId && String(familyId) === myUid) return true;
    return false;
  }, [myUid, effectiveOwnerId, myFamilyMember, familyId]);

  const familyCount = useMemo(() => {
    const base = members.length;
    return memberIds.size > base ? memberIds.size : base;
  }, [members.length, memberIds.size]);

  const canAddFamilyMore = !!familyId && familyCount < MAX_FAMILY;

  // ✅ NOWA ZASADA: zapraszać może tylko OWNER (i musi mieć Premium i aktywną rodzinę)
  const canInviteByPremium = !!myUid && !!familyId && isPremium && iAmOwner;

  const myProfileReady = !!myUid && !!myProfile && !!myUserDocId;

  // członek może wyjść; owner nie ma w UI opcji wyjścia
  const iBelongToFamily =
    !!familyId &&
    !!myUid &&
    (memberIds.has(myUid) ||
      String(localFamilyId || "") === String(familyId));
  const canLeaveFamily =
    !!familyId && !!myUid && !!myUserDocId && iBelongToFamily;

  // ==========================
  // FRIENDS state
  // ==========================
  const [friendsAccepted, setFriendsAccepted] = useState<FriendshipDoc[]>([]);
  const [friendReqIncoming, setFriendReqIncoming] = useState<FriendshipDoc[]>(
    []
  );
  const [friendReqOutgoing, setFriendReqOutgoing] = useState<FriendshipDoc[]>(
    []
  );
  const [friendActionId, setFriendActionId] = useState<string | null>(null);

  const friendUidSet = useMemo(() => {
    const s = new Set<string>();
    friendsAccepted.forEach((f) => {
      const other = f.aUid === myUid ? f.bUid : f.aUid;
      if (other) s.add(other);
    });
    return s;
  }, [friendsAccepted, myUid]);

  const findBetween = (uidA: string, uidB: string) => {
    const id = friendshipId(uidA, uidB);
    const all = [
      ...friendsAccepted,
      ...friendReqIncoming,
      ...friendReqOutgoing,
    ];
    return all.find((x) => x.id === id) || null;
  };

  const otherProfileFromFriendship = (
    f: FriendshipDoc
  ): UserProfileSnap | null => {
    if (!myUid) return null;
    if (f.aUid === myUid) return (f.bProfile as any) || null;
    if (f.bUid === myUid) return (f.aProfile as any) || null;
    return null;
  };

  // ==========================
  // FAMILY invites (MAX)
  // ==========================
  const [familyInvIncoming, setFamilyInvIncoming] = useState<FamilyInviteDoc[]>(
    []
  );
  const [familyInvOutgoing, setFamilyInvOutgoing] = useState<FamilyInviteDoc[]>(
    []
  );
  const [familyInvActionId, setFamilyInvActionId] = useState<string | null>(
    null
  );

  const [familyMemberActionUid, setFamilyMemberActionUid] =
    useState<string | null>(null);
  const [familySelfActionBusy, setFamilySelfActionBusy] = useState(false);

  const pendingFamilyTo = useMemo(() => {
    const s = new Set<string>();
    familyInvOutgoing.forEach((i) => s.add(String(i.toUserId)));
    return s;
  }, [familyInvOutgoing]);

  // ====== realtime my /users doc (premium + familyId always fresh) ======
  const didAutoCreateMeRef = useRef(false);

  useEffect(() => {
    if (!myUid) {
      setMyUserDocId(null);
      setMyProfile(null);
      setIsPremium(false);
      setLocalFamilyId(null);
      didAutoCreateMeRef.current = false;
      return;
    }

    const meRef = doc(db, "users", myUid);
    const unsub = onSnapshot(
      meRef,
      async (snap) => {
        if (!snap.exists()) {
          // OPTIONAL: auto-create minimal profile if missing (rules may block)
          if (!didAutoCreateMeRef.current) {
            didAutoCreateMeRef.current = true;
            try {
              const emailRaw = auth.currentUser?.email || "";
              const displayNameRaw = auth.currentUser?.displayName || "";
              const photoURLRaw = auth.currentUser?.photoURL || null;

              await setDoc(
                meRef,
                {
                  uid: myUid,
                  email: emailRaw ? emailRaw.toLowerCase() : "",
                  emailRaw,
                  displayName: displayNameRaw,
                  photoURL: photoURLRaw,
                  username: "",
                  usernameLower: "",
                  isPremium: false,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              );
              return;
            } catch (e: any) {
              console.warn(
                "auto-create /users/{uid} failed:",
                e?.message || e
              );
            }
          }

          setMyUserDocId(null);
          setMyProfile(null);
          setIsPremium(false);
          setLocalFamilyId(null);
          return;
        }

        const data: any = snap.data();
        setMyUserDocId(snap.id);

        const fid = String(data?.familyId || "");
        setLocalFamilyId(fid || null);

        // premium can be time-limited
        const until = toDateSafe(data?.premiumUntil);
        const now = new Date();
        const premiumActive = !!data?.isPremium && (!until || until > now);
        setIsPremium(premiumActive);

        const me = normalizeUserDoc(snap.id, data);
        setMyProfile({
          uid: myUid,
          docId: snap.id,
          displayName: me.displayName || auth.currentUser?.displayName || "",
          username: me.username || "",
          email: me.email || auth.currentUser?.email || "",
          photoURL:
            me.photoURL || (auth.currentUser?.photoURL as any) || null,
          city: me.city || "",
        });
      },
      (err) => {
        console.warn("users/{uid} snapshot error:", err);
        setIsPremium(false);
      }
    );

    return () => unsub();
  }, [myUid]);

  // ====== realtime friendships (bez indeksów: single where) ======
  const acceptedMapRef = useRef<Map<string, FriendshipDoc>>(new Map());
  const acceptedRefreshTokenRef = useRef(0);

  const rebuildAccepted = async () => {
    if (!myUid) return;
    const token = ++acceptedRefreshTokenRef.current;

    const all = Array.from(acceptedMapRef.current.values());
    const accepted = all.filter((x) => x.status === "accepted");

    const checked = await Promise.all(
      accepted.map(async (f) => {
        const otherUid = f.aUid === myUid ? f.bUid : f.aUid;
        if (!otherUid) return null;
        const exists = await userExists(otherUid);
        return exists ? f : null;
      })
    );

    if (token !== acceptedRefreshTokenRef.current) return;

    const filtered = checked.filter(Boolean) as FriendshipDoc[];
    filtered.sort(
      (a: any, b: any) => (b?.updatedAt?.seconds || 0) - (a?.updatedAt?.seconds || 0)
    );
    setFriendsAccepted(filtered);
  };

  useEffect(() => {
    if (!myUid) return;

    // --- INCOMING FRIEND REQUESTS ---
    const qIn = query(
      collection(db, "friendships"),
      where("requestedTo", "==", myUid),
      limit(200)
    );
    const unsubIn = onSnapshot(
      qIn,
      (snap) => {
        const all = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as FriendshipDoc[];
        setFriendReqIncoming(
          all
            .filter((x) => x.status === "pending")
            .sort(
              (a: any, b: any) =>
                (b?.createdAt?.seconds || 0) - (a?.createdAt?.seconds || 0)
            )
        );
      },
      (err) => {
        console.warn("friend incoming snapshot error:", err);
        showModal(
          "Błąd subskrypcji",
          err?.message || "Nie mogę odczytać zaproszeń (rules).",
          "error"
        );
        setFriendReqIncoming([]);
      }
    );

    // --- OUTGOING FRIEND REQUESTS ---
    const qOut = query(
      collection(db, "friendships"),
      where("requestedBy", "==", myUid),
      limit(200)
    );
    const unsubOut = onSnapshot(
      qOut,
      (snap) => {
        const all = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as FriendshipDoc[];
        setFriendReqOutgoing(
          all
            .filter((x) => x.status === "pending")
            .sort(
              (a: any, b: any) =>
                (b?.createdAt?.seconds || 0) - (a?.createdAt?.seconds || 0)
            )
        );
      },
      (err) => {
        console.warn("friend outgoing snapshot error:", err);
        showModal(
          "Błąd subskrypcji",
          err?.message || "Nie mogę odczytać wysłanych (rules).",
          "error"
        );
        setFriendReqOutgoing([]);
      }
    );

    // --- ACCEPTED FRIENDSHIPS ---
    const qAccA = query(
      collection(db, "friendships"),
      where("aUid", "==", myUid),
      limit(400)
    );
    const qAccB = query(
      collection(db, "friendships"),
      where("bUid", "==", myUid),
      limit(400)
    );

    const mergeAccepted = (arr: FriendshipDoc[]) => {
      arr.forEach((x) => acceptedMapRef.current.set(x.id, x));
      rebuildAccepted();
    };

    const unsubA = onSnapshot(
      qAccA,
      (snap) => {
        const arr = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as FriendshipDoc[];
        mergeAccepted(arr);
      },
      (err) => {
        console.warn("friend accepted A snapshot error:", err);
        showModal(
          "Błąd subskrypcji",
          err?.message || "Nie mogę odczytać znajomych (rules).",
          "error"
        );
        setFriendsAccepted([]);
      }
    );

    const unsubB = onSnapshot(
      qAccB,
      (snap) => {
        const arr = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as FriendshipDoc[];
        mergeAccepted(arr);
      },
      (err) => {
        console.warn("friend accepted B snapshot error:", err);
        showModal(
          "Błąd subskrypcji",
          err?.message || "Nie mogę odczytać znajomych (rules).",
          "error"
        );
        setFriendsAccepted([]);
      }
    );

    return () => {
      unsubIn();
      unsubOut();
      unsubA();
      unsubB();
      acceptedMapRef.current.clear();
      acceptedRefreshTokenRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUid]);

  // ====== realtime family invites (bez indeksów: single where, filtr w kliencie) ======
  useEffect(() => {
    if (!myUid) {
      setFamilyInvIncoming([]);
      setFamilyInvOutgoing([]);
      return;
    }

    const unsubIn = onSnapshot(
      query(
        collection(db, "family_invites"),
        where("toUserId", "==", myUid),
        limit(200)
      ),
      (snap) => {
        const all = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as FamilyInviteDoc[];
        setFamilyInvIncoming(
          all
            .filter((x) => x.status === "pending")
            .sort(
              (a: any, b: any) =>
                (b?.createdAt?.seconds || 0) - (a?.createdAt?.seconds || 0)
            )
        );
      },
      (err) => {
        console.warn("family invites incoming snapshot error:", err);
        setFamilyInvIncoming([]);
      }
    );

    // outgoing: tylko moje (czyli ownera, bo owner tylko może wysyłać)
    const unsubOut = onSnapshot(
      query(
        collection(db, "family_invites"),
        where("fromUserId", "==", myUid),
        limit(200)
      ),
      (snap) => {
        const all = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as FamilyInviteDoc[];
        setFamilyInvOutgoing(
          all
            .filter((x) => x.status === "pending")
            .sort(
              (a: any, b: any) =>
                (b?.createdAt?.seconds || 0) - (a?.createdAt?.seconds || 0)
            )
        );
      },
      (err) => {
        console.warn("family invites outgoing snapshot error:", err);
        setFamilyInvOutgoing([]);
      }
    );

    return () => {
      unsubIn();
      unsubOut();
    };
  }, [myUid]);

  // ====== Typeahead/search ======
  const [qText, setQText] = useState("");
  const [qError, setQError] = useState("");
  const [qLoading, setQLoading] = useState(false);
  const [qPicked, setQPicked] = useState<UserLite | null>(null);

  const [typeahead, setTypeahead] = useState<UserLite[]>([]);
  const [typeaheadStatus, setTypeaheadStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [typeaheadErr, setTypeaheadErr] = useState("");

  const [inputFocused, setInputFocused] = useState(false);
  const blurHideTimer = useRef<any>(null);
  const lastReqId = useRef(0);

  useEffect(() => {
    const text = (qText || "").trim();
    setQError("");

    if (!inputFocused || text.length < 2) {
      setTypeahead([]);
      setTypeaheadStatus("idle");
      setTypeaheadErr("");
      return;
    }

    const reqId = ++lastReqId.current;
    setTypeaheadStatus("loading");
    setTypeaheadErr("");

    const timer = setTimeout(async () => {
      try {
        const prefix = text.toLowerCase();
        const out: UserLite[] = [];
        const seen = new Set<string>();

        const push = (u: UserLite) => {
          if (!u.uid) return;
          if (myUid && u.uid === myUid) return;
          if (seen.has(u.uid)) return;
          seen.add(u.uid);
          out.push(u);
        };

        // usernameLower prefix
        try {
          const q1 = query(
            collection(db, "users"),
            where("usernameLower", ">=", prefix),
            where("usernameLower", "<=", prefix + "\uf8ff"),
            limit(10)
          );
          const s1 = await getDocs(q1);
          s1.forEach((d) => push(normalizeUserDoc(d.id, d.data())));
        } catch (err: any) {
          console.warn("typeahead usernameLower error:", err?.message || err);
        }

        // email prefix (opcjonalnie)
        if (isProbablyEmail(prefix)) {
          try {
            const q2 = query(
              collection(db, "users"),
              where("email", ">=", prefix),
              where("email", "<=", prefix + "\uf8ff"),
              limit(10)
            );
            const s2 = await getDocs(q2);
            s2.forEach((d) => push(normalizeUserDoc(d.id, d.data())));
          } catch (err: any) {
            console.warn("typeahead email error:", err?.message || err);
          }
        }

        // fallback: exact resolve
        if (out.length === 0 && text.length >= 3) {
          try {
            const exact = await resolveUserByEmailOrNick(text);
            if (exact) push(exact);
          } catch {}
        }

        if (reqId !== lastReqId.current) return;
        setTypeahead(out);
        setTypeaheadStatus("done");
      } catch (e: any) {
        if (reqId !== lastReqId.current) return;
        setTypeahead([]);
        setTypeaheadStatus("error");
        setTypeaheadErr(e?.message || "Nie udało się pobrać podpowiedzi.");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [qText, inputFocused, myUid]);

  const handlePick = (u: UserLite) => {
    setQPicked(u);
    setQText(u.username || u.displayName || u.email || "");
    setTypeahead([]);
    setTypeaheadStatus("idle");
    setTypeaheadErr("");
  };

  const handleSearch = async () => {
    setQError("");
    setTypeahead([]);
    setTypeaheadStatus("idle");
    setTypeaheadErr("");

    const ident = (qText || "").trim();
    if (!ident) return setQError("Wpisz e-mail albo nick.");

    setQLoading(true);
    try {
      const u = await resolveUserByEmailOrNick(ident);
      if (!u) {
        setQPicked(null);
        setQError("Nie znaleziono użytkownika.");
        return;
      }
      if (myUid && u.uid === myUid) {
        setQPicked(null);
        setQError("To jesteś Ty 😄");
        return;
      }
      setQPicked(u);
    } catch (e: any) {
      setQError(e?.message || "Błąd wyszukiwania.");
    } finally {
      setQLoading(false);
    }
  };

  // ====== friend actions ======
  const sendFriendRequest = async (u: UserLite) => {
    if (!myUid) return showModal("Brak sesji", "Zaloguj się ponownie.", "error");
    if (!myProfile)
      return showModal(
        "Brak profilu",
        "Brakuje Twojego profilu z /users.",
        "error"
      );

    const toUid = String(u.uid || "");
    if (!toUid) return;

    const existing = findBetween(myUid, toUid);
    if (existing?.status === "pending" && existing.requestedTo === myUid) {
      return showModal(
        "Masz już zaproszenie",
        "Ta osoba już wysłała Ci prośbę — zaakceptuj ją w sekcji „Przychodzące”.",
        "info"
      );
    }
    if (existing?.status === "accepted")
      return showModal("Info", "Jesteście już znajomymi.", "info");
    if (existing?.status === "pending")
      return showModal("Info", "Zaproszenie już jest w toku.", "info");

    const id = friendshipId(myUid, toUid);
    const [a, b] = [myUid, toUid].sort();
    const meIsA = a === myUid;

    const otherProfile: UserProfileSnap = {
      uid: toUid,
      docId: u.docId,
      displayName: u.displayName || "",
      username: u.username || "",
      email: u.email || "",
      photoURL: u.photoURL || null,
      city: u.city || "",
    };

    const aProfile = meIsA ? myProfile : otherProfile;
    const bProfile = meIsA ? otherProfile : myProfile;

    setFriendActionId(id);
    try {
      await setDoc(
        doc(db, "friendships", id),
        {
          aUid: a,
          bUid: b,
          aProfile,
          bProfile,
          status: "pending",
          requestedBy: myUid,
          requestedTo: toUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      showModal(
        "Wysłano ✅",
        "Zaproszenie do znajomych zostało wysłane.",
        "success"
      );
    } catch (e: any) {
      showModal(
        "Błąd",
        e?.message || "Nie udało się wysłać zaproszenia.",
        "error"
      );
    } finally {
      setFriendActionId(null);
    }
  };

  const acceptFriendRequest = async (f: FriendshipDoc) => {
    setFriendActionId(f.id);
    try {
      await updateDoc(doc(db, "friendships", f.id), {
        status: "accepted",
        updatedAt: serverTimestamp(),
      });
      showModal("Dodano ✅", "Jesteście znajomymi.", "success");
    } catch (e: any) {
      showModal(
        "Błąd",
        e?.message || "Nie udało się zaakceptować.",
        "error"
      );
    } finally {
      setFriendActionId(null);
    }
  };

  const declineFriendRequest = async (f: FriendshipDoc) => {
    setFriendActionId(f.id);
    try {
      await updateDoc(doc(db, "friendships", f.id), {
        status: "declined",
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      showModal(
        "Błąd",
        e?.message || "Nie udało się odrzucić.",
        "error"
      );
    } finally {
      setFriendActionId(null);
    }
  };

  const cancelFriendRequest = async (f: FriendshipDoc) => {
    setFriendActionId(f.id);
    try {
      await updateDoc(doc(db, "friendships", f.id), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
      showModal("OK", "Cofnięto zaproszenie.", "success");
    } catch (e: any) {
      showModal(
        "Błąd",
        e?.message || "Nie udało się cofnąć.",
        "error"
      );
    } finally {
      setFriendActionId(null);
    }
  };

  const removeFriend = async (f: FriendshipDoc) => {
    setFriendActionId(f.id);
    try {
      await updateDoc(doc(db, "friendships", f.id), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });
      showModal("Usunięto ✅", "Usunięto znajomego.", "success");
    } catch (e: any) {
      showModal(
        "Błąd",
        e?.message || "Nie udało się usunąć znajomego.",
        "error"
      );
    } finally {
      setFriendActionId(null);
    }
  };

  const handleRemoveFriend = (f: FriendshipDoc) => {
    const other = otherProfileFromFriendship(f);
    openConfirm(
      {
        title: "Usunąć znajomego?",
        message: `Na pewno chcesz usunąć ${displayNameOf(
          other
        )} ze znajomych?`,
        confirmLabel: "Tak, usuń",
        cancelLabel: "Nie",
        destructive: true,
      },
      () => removeFriend(f)
    );
  };

  // ====== Family MAX actions ======
  const createFamilyMax = async () => {
    if (!myUid) return showModal("Brak sesji", "Zaloguj się ponownie.", "error");
    if (!myUserDocId)
      return showModal(
        "Brak profilu",
        "Nie znaleźliśmy dokumentu w /users.",
        "error"
      );
    if (!isPremium) return router.push("/premium");

    try {
      if (familyId) {
        setLocalFamilyId(String(familyId));
        return showModal("Info", "Masz już rodzinę MAX.", "info");
      }

      // u Was familyId == uid ownera
      const fid = myUid;
      const batch = writeBatch(db);

      batch.set(
        doc(db, "families", fid),
        {
          ownerId: myUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          plan: "max",
        },
        { merge: true }
      );

      // ✅ owner zawsze "owner"
      batch.set(
        doc(db, "families", fid, "members", myUid),
        {
          userId: myUid,
          role: "owner",
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      batch.set(
        doc(db, "users", myUserDocId),
        { familyId: fid, updatedAt: serverTimestamp() },
        { merge: true }
      );

      await batch.commit();
      setLocalFamilyId(fid);
      showModal(
        "Gotowe ✅",
        "Utworzono rodzinę MAX. Możesz zapraszać znajomych.",
        "success"
      );
    } catch (e: any) {
      showModal(
        "Błąd",
        e?.message || "Nie udało się utworzyć rodziny.",
        "error"
      );
    }
  };

  // ✅ PROSTA LOGIKA invitation: Premium + familyId + limit + friend + not member + not pending + OWNER ONLY
  const familyInviteDisabledReason = (toUid: string) => {
    if (!myUid) return "Brak sesji.";
    if (!isPremium) return "Rodzina MAX jest w Premium.";
    if (!familyId) return "Najpierw utwórz rodzinę MAX.";
    if (!iAmOwner) return "Tylko właściciel rodziny może zapraszać.";
    if (!canAddFamilyMore) return `Limit ${MAX_FAMILY} osób w rodzinie.`;
    if (!friendUidSet.has(toUid))
      return "Możesz zapraszać do rodziny tylko znajomych.";
    if (memberIds.has(toUid)) return "Ta osoba już jest w Twojej rodzinie.";
    if (pendingFamilyTo.has(toUid))
      return "Zaproszenie do rodziny już wysłane.";
    return null;
  };

  const sendFamilyInvite = async (f: FriendshipDoc) => {
    if (!myUid) return showModal("Brak sesji", "Zaloguj się ponownie.", "error");
    if (!myProfile)
      return showModal(
        "Brak profilu",
        "Brakuje Twojego profilu z /users.",
        "error"
      );
    if (!familyId)
      return showModal(
        "Brak rodziny",
        "Najpierw utwórz rodzinę MAX.",
        "info"
      );
    if (!iAmOwner)
      return showModal(
        "Brak uprawnień",
        "Tylko właściciel rodziny może zapraszać.",
        "info"
      );

    const other = otherProfileFromFriendship(f);
    const toUid = String(other?.uid || "");
    if (!toUid) return;

    const reason = familyInviteDisabledReason(toUid);
    if (reason) {
      if (reason.includes("Premium")) router.push("/premium");
      return showModal("Nie można", reason, "info");
    }

    setFamilyInvActionId(toUid);
    try {
      const memSnap = await getDocs(
        query(
          collection(db, "families", String(familyId), "members"),
          limit(MAX_FAMILY + 1)
        )
      );
      if (memSnap.size >= MAX_FAMILY) {
        showModal("Limit", `Rodzina ma już ${MAX_FAMILY} osób.`, "info");
        return;
      }

      const invId = familyInviteId(String(familyId), myUid, toUid);

      await setDoc(
        doc(db, "family_invites", invId),
        {
          familyId: String(familyId),
          fromUserId: myUid,
          fromDisplayName: displayNameOf(myProfile),
          fromEmail: myProfile.email || auth.currentUser?.email || "",
          toUserId: toUid,
          toDisplayName: displayNameOf(other),
          toEmail: other?.email || "",
          status: "pending",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      showModal(
        "Wysłano ✅",
        "Zaproszenie do rodziny MAX zostało wysłane.",
        "success"
      );
    } catch (e: any) {
      showModal(
        "Błąd",
        e?.message || "Nie udało się wysłać zaproszenia do rodziny.",
        "error"
      );
    } finally {
      setFamilyInvActionId(null);
    }
  };

  const leaveFamily = async () => {
    if (!myUid) return showModal("Brak sesji", "Zaloguj się ponownie.", "error");
    if (!myUserDocId)
      return showModal(
        "Brak profilu",
        "Nie znaleźliśmy dokumentu w /users.",
        "error"
      );
    if (!familyId)
      return showModal(
        "Brak rodziny",
        "Nie należysz do rodziny MAX.",
        "info"
      );

    if (iAmOwner) {
      return showModal(
        "Nie można",
        "Założyciel rodziny nie może w ten sposób opuścić rodziny.",
        "info"
      );
    }

    setFamilySelfActionBusy(true);
    try {
      const batch = writeBatch(db);

      batch.delete(doc(db, "families", String(familyId), "members", myUid));
      batch.set(
        doc(db, "users", myUserDocId),
        { familyId: null, updatedAt: serverTimestamp() },
        { merge: true }
      );

      await batch.commit();
      setLocalFamilyId(null);
      showModal("Gotowe ✅", "Opuściłeś rodzinę MAX.", "success");
    } catch (e: any) {
      showModal(
        "Błąd",
        e?.message || "Nie udało się opuścić rodziny.",
        "error"
      );
    } finally {
      setFamilySelfActionBusy(false);
    }
  };

  const removeFamilyMember = async (targetUid: string) => {
    if (!myUid) return showModal("Brak sesji", "Zaloguj się ponownie.", "error");
    if (!familyId)
      return showModal(
        "Brak rodziny",
        "Brak aktywnej rodziny MAX.",
        "error"
      );
    if (!iAmOwner) {
      return showModal(
        "Brak uprawnień",
        "Tylko właściciel rodziny może usuwać członków.",
        "error"
      );
    }

    const ownerUid = String(effectiveOwnerId || "");
    if (!targetUid || targetUid === myUid) return;
    if (ownerUid && targetUid === ownerUid) {
      return showModal(
        "Nie można",
        "Nie można usunąć właściciela rodziny.",
        "info"
      );
    }

    setFamilyMemberActionUid(targetUid);
    try {
      const batch = writeBatch(db);

      // usuń z members
      batch.delete(
        doc(db, "families", String(familyId), "members", targetUid)
      );

      // wyczyść familyId u usera (zakładamy /users/{uid})
      batch.set(
        doc(db, "users", targetUid),
        { familyId: null, updatedAt: serverTimestamp() },
        { merge: true }
      );

      await batch.commit();
      showModal(
        "Usunięto ✅",
        "Członek został usunięty z rodziny.",
        "success"
      );
    } catch (e: any) {
      showModal(
        "Błąd",
        e?.message || "Nie udało się usunąć członka rodziny.",
        "error"
      );
    } finally {
      setFamilyMemberActionUid(null);
    }
  };

  const handleLeaveFamily = () => {
    openConfirm(
      {
        title: "Opuścić rodzinę?",
        message:
          "Na pewno chcesz opuścić tę rodzinę MAX? Utracisz powiązanie z członkami rodziny.",
        confirmLabel: "Tak, opuść",
        cancelLabel: "Nie",
        destructive: true,
      },
      () => leaveFamily()
    );
  };

  const handleRemoveFamilyMember = (targetUid: string, label: string) => {
    openConfirm(
      {
        title: "Usunąć członka rodziny?",
        message: `Na pewno chcesz usunąć ${label} z rodziny MAX?`,
        confirmLabel: "Tak, usuń",
        cancelLabel: "Nie",
        destructive: true,
      },
      () => removeFamilyMember(targetUid)
    );
  };

  // ✅ Akceptacja: dołączający zawsze dostaje role=member (tylko owner zaprasza i tylko owner usuwa)
  const acceptFamilyInvite = async (inv: FamilyInviteDoc) => {
    if (!myUid) return showModal("Brak sesji", "Zaloguj się ponownie.", "error");
    if (!myUserDocId)
      return showModal("Brak profilu", "Nie znaleźliśmy /users.", "error");

    const fid = String(inv.familyId || "");
    if (!fid) return showModal("Błąd", "Zaproszenie bez familyId.", "error");

    setFamilyInvActionId(inv.id);
    try {
      // limit target family
      const memTargetSnap = await getDocs(
        query(collection(db, "families", fid, "members"), limit(MAX_FAMILY + 1))
      );
      if (memTargetSnap.size >= MAX_FAMILY) {
        showModal(
          "Limit",
          `Ta rodzina ma już limit ${MAX_FAMILY} osób.`,
          "info"
        );
        return;
      }

      const meRef = doc(db, "users", myUserDocId);
      const myFam: string | null = localFamilyId || null;

      // already in this family -> just accept invite
      if (myFam && myFam === fid) {
        await updateDoc(doc(db, "family_invites", inv.id), {
          status: "accepted",
          updatedAt: serverTimestamp(),
        });
        setLocalFamilyId(fid);
        showModal("OK ✅", "Już jesteś w tej rodzinie.", "success");
        return;
      }

      // if has other family: allow switch only when old family is SOLO (<=1 member)
      if (myFam && myFam !== fid) {
        const memOldSnap = await getDocs(
          query(collection(db, "families", myFam, "members"), limit(2))
        );
        if (memOldSnap.size > 1) {
          showModal(
            "Masz już rodzinę",
            "Najpierw opuść obecną rodzinę (jeśli ma innych członków).",
            "info"
          );
          return;
        }

        const batch = writeBatch(db);
        batch.update(doc(db, "family_invites", inv.id), {
          status: "accepted",
          updatedAt: serverTimestamp(),
        });
        batch.delete(doc(db, "families", myFam, "members", myUid));
        batch.set(
          doc(db, "families", fid, "members", myUid),
          {
            userId: myUid,
            role: "member",
            joinedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        batch.set(
          meRef,
          { familyId: fid, updatedAt: serverTimestamp() },
          { merge: true }
        );

        await batch.commit();
        setLocalFamilyId(fid);
        showModal(
          "Dołączono ✅",
          "Przeniesiono Cię do nowej rodziny MAX.",
          "success"
        );
        return;
      }

      // no family -> normal join
      const batch = writeBatch(db);
      batch.update(doc(db, "family_invites", inv.id), {
        status: "accepted",
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(db, "families", fid, "members", myUid),
        {
          userId: myUid,
          role: "member",
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      batch.set(
        meRef,
        { familyId: fid, updatedAt: serverTimestamp() },
        { merge: true }
      );

      await batch.commit();
      setLocalFamilyId(fid);
      showModal("Dołączono ✅", "Jesteś w rodzinie MAX.", "success");
    } catch (e: any) {
      showModal(
        "Błąd",
        e?.message || "Nie udało się zaakceptować.",
        "error"
      );
    } finally {
      setFamilyInvActionId(null);
    }
  };

  const declineFamilyInvite = async (inv: FamilyInviteDoc) => {
    setFamilyInvActionId(inv.id);
    try {
      await updateDoc(doc(db, "family_invites", inv.id), {
        status: "declined",
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      showModal(
        "Błąd",
        e?.message || "Nie udało się odrzucić.",
        "error"
      );
    } finally {
      setFamilyInvActionId(null);
    }
  };

  const cancelFamilyInvite = async (inv: FamilyInviteDoc) => {
    const go = async () => {
      setFamilyInvActionId(inv.id);
      try {
        await updateDoc(doc(db, "family_invites", inv.id), {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });
        showModal(
          "OK",
          "Cofnięto zaproszenie do rodziny.",
          "success"
        );
      } catch (e: any) {
        showModal(
          "Błąd",
          e?.message || "Nie udało się cofnąć.",
          "error"
        );
      } finally {
        setFamilyInvActionId(null);
      }
    };

    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm("Cofnąć zaproszenie do rodziny?")) go();
      return;
    }

    Alert.alert("Cofnij zaproszenie", "Na pewno?", [
      { text: "Anuluj", style: "cancel" },
      { text: "Cofnij", style: "destructive", onPress: go },
    ]);
  };

  // ====== UI helpers (settings vibe) ======
  const cardStyle = { backgroundColor: colors.card, borderColor: colors.border };
  const labelStyle = { color: colors.text, fontWeight: "800", fontSize: 15 };
  const mutedStyle = { color: colors.textMuted, fontSize: 13 };

  const buttonStyle = (disabled?: boolean) => ({
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    opacity: disabled ? 0.6 : 1,
  });

  const ghostButtonStyle = (disabled?: boolean) => ({
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    opacity: disabled ? 0.6 : 1,
  });

  const renderUserRow = (
    u: {
      uid?: string;
      displayName?: string;
      username?: string;
      email?: string;
      photoURL?: string | null;
      city?: string;
    },
    right?: React.ReactNode,
    subtitle?: string
  ) => {
    const photo = u.photoURL ? String(u.photoURL) : null;

    const goToProfile = () => {
      if (!u.uid) return;
      router.push(`/Profile?uid=${u.uid}`);
    };

    const Wrapper: any = u.uid ? TouchableOpacity : View;

    return (
      <Wrapper
        onPress={u.uid ? goToProfile : undefined}
        activeOpacity={0.8}
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg,
          borderRadius: 14,
          padding: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={{ width: 42, height: 42, borderRadius: 999 }}
          />
        ) : (
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#022c22", fontWeight: "900" }}>
              {safeInitial(displayNameOf(u))}
            </Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.text,
              fontWeight: "900",
              fontSize: 15,
            }}
            numberOfLines={1}
          >
            {displayNameOf(u)}
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {subtitle || u.email || "—"}
            {u.city ? ` • ${u.city}` : ""}
          </Text>
        </View>

        {right}
      </Wrapper>
    );
  };

  // ====== Derived picked state
  const pickedBetween = qPicked && myUid ? findBetween(myUid, qPicked.uid) : null;
  const pickedIsFriend = !!qPicked && friendUidSet.has(qPicked.uid);
  const pickedIncoming =
    !!pickedBetween &&
    pickedBetween.status === "pending" &&
    pickedBetween.requestedTo === myUid;
  const pickedOutgoing =
    !!pickedBetween &&
    pickedBetween.status === "pending" &&
    pickedBetween.requestedBy === myUid;

  const familyInvIncomingForMy = useMemo(
    () => familyInvIncoming,
    [familyInvIncoming]
  );
  const familyInvOutgoingForMyFamily = useMemo(() => {
    if (!familyId) return [];
    return familyInvOutgoing.filter(
      (x) => String(x.familyId) === String(familyId)
    );
  }, [familyInvOutgoing, familyId]);

  if (familyLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <FeedbackModal
        state={modal}
        onClose={() => setModal({ visible: false })}
        colors={colors}
      />
      <ConfirmModal
        state={confirmState}
        onCancel={handleConfirmCancel}
        onConfirm={handleConfirmOk}
        colors={colors}
      />

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32,
          width: "100%",
          maxWidth: 900,
          alignSelf: Platform.OS === "web" ? "center" : "stretch",
          gap: 14,
        }}
      >
        {/* HEADER */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ paddingRight: 8, paddingVertical: 4 }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: "800",
            }}
          >
            Znajomi & Rodzina
          </Text>
        </View>

        {/* ============ RODZINA MAX (TOP) ============ */}
        <View
          style={{ ...cardStyle, borderWidth: 1, borderRadius: 16, padding: 14 }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <Text style={labelStyle}>Rodzina MAX</Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 12,
                fontWeight: "900",
              }}
            >
              {familyId ? `${familyCount}/${MAX_FAMILY}` : `0/${MAX_FAMILY}`}
            </Text>
          </View>

          <Text style={[mutedStyle, { marginTop: 4 }]}>
            Premium: {isPremium ? "aktywny ✅" : "brak"} •{" "}
            {familyId ? "rodzina: aktywna" : "brak rodziny"} •{" "}
            {familyId
              ? iAmOwner
                ? "rola: właściciel"
                : "rola: członek"
              : "rola: —"}
          </Text>

          {/* CREATE FAMILY MAX (Premium) */}
          {!familyId ? (
            <View style={{ marginTop: 14 }}>
              <TouchableOpacity
                onPress={createFamilyMax}
                style={buttonStyle(false)}
                activeOpacity={0.9}
              >
                <Text style={{ fontWeight: "900", color: "#022c22" }}>
                  Utwórz rodzinę MAX
                </Text>
              </TouchableOpacity>
              {!isPremium ? (
                <Text style={[mutedStyle, { marginTop: 8 }]}>
                  Rodzina MAX jest dostępna w Premium.
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* ============ LISTA CZŁONKÓW RODZINY ============ */}
          <Text
            style={{
              marginTop: 14,
              color: colors.text,
              fontWeight: "900",
            }}
          >
            Członkowie rodziny
          </Text>

          {!familyId || members.length === 0 ? (
            <Text style={[mutedStyle, { marginTop: 8 }]}>
              Brak członków rodziny.
            </Text>
          ) : (
            members
              .slice()
              .sort((a: any, b: any) => {
                const auid = String(a?.uid || a?.userId || a?.id || "");
                const buid = String(b?.uid || b?.userId || b?.id || "");
                const aIsOwner =
                  effectiveOwnerId && auid === String(effectiveOwnerId);
                const bIsOwner =
                  effectiveOwnerId && buid === String(effectiveOwnerId);
                if (aIsOwner) return -1;
                if (bIsOwner) return 1;
                return String(a?.displayName || "").localeCompare(
                  String(b?.displayName || "")
                );
              })
              .map((m: any) => {
                const memUid = String(m.uid || m.userId || "");
                const isMe = myUid && memUid === myUid;

                const isOwnerRow =
                  !!effectiveOwnerId &&
                  memUid === String(effectiveOwnerId);
                const roleLabel = isOwnerRow
                  ? "owner"
                  : String(m?.role || "member");

                let rightNode: React.ReactNode;
                let subtitle =
                  roleLabel === "owner"
                    ? "Założyciel rodziny MAX"
                    : "Członek rodziny";

                if (roleLabel === "owner") {
                  rightNode = (
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontWeight: "900",
                      }}
                    >
                      {isMe ? "Właściciel (Ty)" : "Właściciel"}
                    </Text>
                  );
                  if (isMe) subtitle = "Założyciel rodziny MAX (Ty)";
                } else if (iAmOwner) {
                  const busy = familyMemberActionUid === memUid;
                  const label =
                    m.displayName ||
                    m.email ||
                    (isMe ? "Ciebie" : "tego członka rodziny");

                  rightNode = (
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontWeight: "900",
                        }}
                      >
                        Członek
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          handleRemoveFamilyMember(memUid, label)
                        }
                        disabled={busy}
                        style={[
                          ghostButtonStyle(busy),
                          {
                            marginTop: 6,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          },
                        ]}
                        activeOpacity={0.9}
                      >
                        {busy ? (
                          <ActivityIndicator color={colors.textMuted} />
                        ) : (
                          <Text
                            style={{
                              fontWeight: "900",
                              color: ERROR_COLOR,
                              fontSize: 12,
                            }}
                          >
                            Usuń z rodziny
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                } else {
                  rightNode = (
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontWeight: "900",
                      }}
                    >
                      Członek
                    </Text>
                  );
                }

                return renderUserRow(
                  {
                    uid: m.uid || m.userId,
                    displayName: m.displayName,
                    email: m.email,
                    photoURL: m.photoURL || null,
                    city: m.city,
                  },
                  rightNode,
                  subtitle
                );
              })
          )}

          {/* OPUŚĆ RODZINĘ (dla zwykłego członka) — NIE pokazujemy jeśli owner */}
          {canLeaveFamily && !iAmOwner ? (
            <View style={{ marginTop: 16 }}>
              <TouchableOpacity
                onPress={handleLeaveFamily}
                disabled={familySelfActionBusy}
                style={[
                  ghostButtonStyle(familySelfActionBusy),
                  { borderColor: ERROR_COLOR, paddingVertical: 9 },
                ]}
                activeOpacity={0.9}
              >
                {familySelfActionBusy ? (
                  <ActivityIndicator color={ERROR_COLOR} />
                ) : (
                  <Text
                    style={{
                      color: ERROR_COLOR,
                      fontWeight: "900",
                      textAlign: "center",
                    }}
                  >
                    Opuść rodzinę
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* ⭐⭐⭐ ALWAYS VISIBLE INCOMING INVITES ⭐⭐⭐ */}
          <Text
            style={{
              marginTop: 18,
              color: colors.text,
              fontWeight: "900",
            }}
          >
            Zaproszenia do rodziny
          </Text>

          {familyInvIncomingForMy.length === 0 ? (
            <Text style={[mutedStyle, { marginTop: 8 }]}>
              Brak zaproszeń.
            </Text>
          ) : (
            familyInvIncomingForMy.map((inv) => {
              const busy = familyInvActionId === inv.id;
              return renderUserRow(
                {
                  uid: inv.fromUserId,
                  displayName: inv.fromDisplayName,
                  email: inv.fromEmail,
                },
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => acceptFamilyInvite(inv)}
                    disabled={busy}
                    style={buttonStyle(busy)}
                    activeOpacity={0.9}
                  >
                    {busy ? (
                      <ActivityIndicator color="#022c22" />
                    ) : (
                      <Text
                        style={{
                          fontWeight: "900",
                          color: "#022c22",
                        }}
                      >
                        Akceptuj
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => declineFamilyInvite(inv)}
                    disabled={busy}
                    style={ghostButtonStyle(busy)}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={{
                        fontWeight: "900",
                        color: colors.textMuted,
                      }}
                    >
                      Odrzuć
                    </Text>
                  </TouchableOpacity>
                </View>,
                "Zaproszenie do rodziny MAX"
              );
            })
          )}

          {/* ================= ONLY OWNER+PREMIUM CAN SEE THIS BLOCK ================= */}
          {canInviteByPremium ? (
            <>
              <Text
                style={{
                  marginTop: 18,
                  color: colors.text,
                  fontWeight: "900",
                }}
              >
                Wysłane zaproszenia
              </Text>

              {familyInvOutgoingForMyFamily.length === 0 ? (
                <Text style={[mutedStyle, { marginTop: 8 }]}>
                  Brak wysłanych.
                </Text>
              ) : (
                familyInvOutgoingForMyFamily.map((inv) => {
                  const busy = familyInvActionId === inv.id;
                  return renderUserRow(
                    {
                      uid: inv.toUserId,
                      displayName: inv.toDisplayName,
                      email: inv.toEmail,
                    },
                    <TouchableOpacity
                      onPress={() => cancelFamilyInvite(inv)}
                      disabled={busy}
                      style={ghostButtonStyle(busy)}
                      activeOpacity={0.9}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.textMuted} />
                      ) : (
                        <Text
                          style={{
                            fontWeight: "900",
                            color: colors.textMuted,
                          }}
                        >
                          Cofnij
                        </Text>
                      )}
                    </TouchableOpacity>,
                    "Oczekuje"
                  );
                })
              )}

              <Text
                style={{
                  marginTop: 18,
                  color: colors.text,
                  fontWeight: "900",
                }}
              >
                Zaproś znajomego do rodziny
              </Text>
              <Text style={[mutedStyle, { marginTop: 4 }]}>
                Dostępne w Premium. Limit {MAX_FAMILY} osób.
              </Text>

              {friendsAccepted.length === 0 ? (
                <Text style={[mutedStyle, { marginTop: 8 }]}>
                  Najpierw dodaj znajomych.
                </Text>
              ) : (
                friendsAccepted.slice(0, 30).map((fr) => {
                  const other = otherProfileFromFriendship(fr);
                  const toUid = String(other?.uid || "");
                  const reason = toUid
                    ? familyInviteDisabledReason(toUid)
                    : "Brak uid.";
                  const disabled = !!reason;
                  const busy = familyInvActionId === toUid;

                  return renderUserRow(
                    {
                      uid: toUid,
                      displayName: other?.displayName,
                      username: other?.username,
                      email: other?.email,
                      photoURL: other?.photoURL || null,
                      city: other?.city,
                    },
                    <TouchableOpacity
                      onPress={() => sendFamilyInvite(fr)}
                      disabled={disabled || busy}
                      style={buttonStyle(disabled || busy)}
                      activeOpacity={0.9}
                    >
                      {busy ? (
                        <ActivityIndicator color="#022c22" />
                      ) : (
                        <Text
                          style={{
                            fontWeight: "900",
                            color: "#022c22",
                          }}
                        >
                          {disabled ? "Już w rodzinie" : "Zaproś"}
                        </Text>
                      )}
                    </TouchableOpacity>,
                    disabled ? reason || "—" : "Znajomy"
                  );
                })
              )}

              {!canAddFamilyMore ? (
                <Text
                  style={[
                    mutedStyle,
                    { marginTop: 10, fontWeight: "900" },
                  ]}
                >
                  Osiągnięto limit {MAX_FAMILY} osób w rodzinie.
                </Text>
              ) : null}
            </>
          ) : null}
        </View>

        {/* ===================== FRIENDS: ADD / REQUESTS / LIST ===================== */}
        <View
          style={{ ...cardStyle, borderWidth: 1, borderRadius: 16, padding: 14 }}
        >
          <Text style={labelStyle}>Dodaj znajomego</Text>
          <Text style={[mutedStyle, { marginTop: 4 }]}>
            Nick lub e-mail.
          </Text>

          <View
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderRadius: 14,
              borderColor: qError ? ERROR_COLOR : colors.border,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              placeholder="np. janek123 lub jan@email.com"
              placeholderTextColor={colors.textMuted}
              value={qText}
              onChangeText={(v) => {
                setQText(v);
                if (qError) setQError("");
              }}
              style={{
                flex: 1,
                color: colors.text,
                fontSize: 14,
                fontWeight: "700",
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              onFocus={() => {
                if (blurHideTimer.current) clearTimeout(blurHideTimer.current);
                setInputFocused(true);
              }}
              onBlur={() => {
                blurHideTimer.current = setTimeout(
                  () => setInputFocused(false),
                  160
                );
              }}
            />

            <TouchableOpacity
              onPress={handleSearch}
              style={[buttonStyle(qLoading), { minWidth: 92 }]}
              disabled={qLoading}
              activeOpacity={0.9}
            >
              {qLoading ? (
                <ActivityIndicator color="#022c22" />
              ) : (
                <Text
                  style={{
                    fontWeight: "900",
                    color: "#022c22",
                  }}
                >
                  Szukaj
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {qError ? (
            <Text
              style={{
                color: ERROR_COLOR,
                fontSize: 12,
                fontWeight: "800",
                marginTop: 8,
              }}
            >
              {qError}
            </Text>
          ) : null}

          {/* TYPEAHEAD */}
          {inputFocused && qText.trim().length >= 2 ? (
            <View
              style={{
                marginTop: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bg,
                overflow: "hidden",
              }}
            >
              {typeaheadStatus === "loading" ? (
                <View style={{ paddingVertical: 12 }}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : typeaheadStatus === "error" ? (
                <View style={{ padding: 12 }}>
                  <Text
                    style={{
                      color: ERROR_COLOR,
                      fontWeight: "900",
                      fontSize: 12,
                    }}
                  >
                    {typeaheadErr || "Błąd podpowiedzi."}
                  </Text>
                </View>
              ) : typeahead.length === 0 ? (
                <View style={{ padding: 12 }}>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontWeight: "800",
                      fontSize: 12,
                    }}
                  >
                    Brak wyników dla “{qText.trim()}”.
                  </Text>
                </View>
              ) : (
                typeahead.map((u) => {
                  const between = myUid ? findBetween(myUid, u.uid) : null;
                  const isFriend = friendUidSet.has(u.uid);
                  return (
                    <TouchableOpacity
                      key={`ta-${u.uid}`}
                      onPress={() => handlePick(u)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                      }}
                      activeOpacity={0.9}
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 999,
                          backgroundColor: colors.accent,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: "#022c22",
                            fontWeight: "900",
                          }}
                        >
                          {safeInitial(displayNameOf(u))}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ color: colors.text, fontWeight: "900" }}
                          numberOfLines={1}
                        >
                          {displayNameOf(u)}
                        </Text>
                        <Text
                          style={{
                            color: colors.textMuted,
                            fontSize: 12,
                            marginTop: 2,
                          }}
                          numberOfLines={1}
                        >
                          {u.email || "—"}
                          {u.city ? ` • ${u.city}` : ""}
                        </Text>
                      </View>

                      <Text
                        style={{
                          color: colors.textMuted,
                          fontWeight: "900",
                          fontSize: 11,
                        }}
                      >
                        {isFriend
                          ? "ZNAJOMY"
                          : between?.status === "pending"
                          ? "PENDING"
                          : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          ) : null}

          {/* PICKED */}
          {qPicked ? (
            <View style={{ marginTop: 12 }}>
              {renderUserRow(
                qPicked,
                pickedIncoming ? (
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontWeight: "900",
                    }}
                  >
                    → „Przychodzące”
                  </Text>
                ) : pickedOutgoing ? (
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontWeight: "900",
                    }}
                  >
                    Wysłane
                  </Text>
                ) : pickedIsFriend ? (
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontWeight: "900",
                    }}
                  >
                    Znajomy
                  </Text>
                ) : (
                  <TouchableOpacity
                    onPress={() => sendFriendRequest(qPicked)}
                    disabled={!myProfileReady}
                    style={buttonStyle(!myProfileReady)}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={{
                        fontWeight: "900",
                        color: "#022c22",
                      }}
                    >
                      {!myProfileReady ? "Ładuję..." : "Dodaj"}
                    </Text>
                  </TouchableOpacity>
                ),
                pickedIsFriend
                  ? "Znajomy"
                  : pickedOutgoing
                  ? "Zaproszenie wysłane"
                  : pickedIncoming
                  ? "Masz od niego zaproszenie"
                  : !myProfileReady
                  ? "Ładowanie profilu…"
                  : "Użytkownik"
              )}
            </View>
          ) : null}
        </View>

        {/* Incoming friend requests */}
        <View
          style={{ ...cardStyle, borderWidth: 1, borderRadius: 16, padding: 14 }}
        >
          <Text style={labelStyle}>Przychodzące zaproszenia</Text>
          <Text style={[mutedStyle, { marginTop: 4 }]}>
            Kto chce Cię dodać do znajomych.
          </Text>

          {friendReqIncoming.length === 0 ? (
            <Text style={[mutedStyle, { marginTop: 10 }]}>
              Brak zaproszeń.
            </Text>
          ) : (
            friendReqIncoming.map((f) => {
              const other = otherProfileFromFriendship(f);
              const busy = friendActionId === f.id;

              return renderUserRow(
                {
                  uid: other?.uid || "",
                  displayName: other?.displayName,
                  username: other?.username,
                  email: other?.email,
                  photoURL: other?.photoURL || null,
                  city: other?.city,
                },
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => acceptFriendRequest(f)}
                    disabled={busy}
                    style={buttonStyle(busy)}
                    activeOpacity={0.9}
                  >
                    {busy ? (
                      <ActivityIndicator color="#022c22" />
                    ) : (
                      <Text
                        style={{
                          fontWeight: "900",
                          color: "#022c22",
                        }}
                      >
                        Akceptuj
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => declineFriendRequest(f)}
                    disabled={busy}
                    style={ghostButtonStyle(busy)}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={{
                        fontWeight: "900",
                        color: colors.textMuted,
                      }}
                    >
                      Odrzuć
                    </Text>
                  </TouchableOpacity>
                </View>,
                "Prośba o dodanie"
              );
            })
          )}
        </View>

        {/* Outgoing friend requests */}
        <View
          style={{ ...cardStyle, borderWidth: 1, borderRadius: 16, padding: 14 }}
        >
          <Text style={labelStyle}>Wysłane zaproszenia</Text>
          <Text style={[mutedStyle, { marginTop: 4 }]}>
            Oczekują na akceptację.
          </Text>

          {friendReqOutgoing.length === 0 ? (
            <Text style={[mutedStyle, { marginTop: 10 }]}>Brak.</Text>
          ) : (
            friendReqOutgoing.map((f) => {
              const other = otherProfileFromFriendship(f);
              const busy = friendActionId === f.id;

              return renderUserRow(
                {
                  uid: other?.uid || "",
                  displayName: other?.displayName,
                  username: other?.username,
                  email: other?.email,
                  photoURL: other?.photoURL || null,
                  city: other?.city,
                },
                <TouchableOpacity
                  onPress={() => cancelFriendRequest(f)}
                  disabled={busy}
                  style={ghostButtonStyle(busy)}
                  activeOpacity={0.9}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.textMuted} />
                  ) : (
                    <Text
                      style={{
                        fontWeight: "900",
                        color: colors.textMuted,
                      }}
                    >
                      Cofnij
                    </Text>
                  )}
                </TouchableOpacity>,
                "Oczekuje"
              );
            })
          )}
        </View>

        {/* Friends list */}
        <View
          style={{ ...cardStyle, borderWidth: 1, borderRadius: 16, padding: 14 }}
        >
          <Text style={labelStyle}>Znajomi</Text>
          <Text style={[mutedStyle, { marginTop: 4 }]}>
            Twoja lista znajomych.
          </Text>

          {friendsAccepted.length === 0 ? (
            <Text style={[mutedStyle, { marginTop: 10 }]}>
              Nie masz jeszcze znajomych.
            </Text>
          ) : (
            friendsAccepted.map((f) => {
              const other = otherProfileFromFriendship(f);
              const busy = friendActionId === f.id;

              return renderUserRow(
                {
                  uid: other?.uid || "",
                  displayName: other?.displayName,
                  username: other?.username,
                  email: other?.email,
                  photoURL: other?.photoURL || null,
                  city: other?.city,
                },
                <TouchableOpacity
                  onPress={() => handleRemoveFriend(f)}
                  disabled={busy}
                  style={[
                    ghostButtonStyle(busy),
                    { paddingVertical: 8, paddingHorizontal: 10 },
                  ]}
                  activeOpacity={0.9}
                >
                  {busy ? (
                    <ActivityIndicator color={ERROR_COLOR} />
                  ) : (
                    <Text
                      style={{
                        color: ERROR_COLOR,
                        fontWeight: "900",
                        fontSize: 12,
                      }}
                    >
                      Usuń znajomego
                    </Text>
                  )}
                </TouchableOpacity>,
                "Znajomy"
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// src/screens/FamilyScreen.tsx
