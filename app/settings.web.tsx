// app/settings.web.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Platform,
  TextInput,
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import {
  useTheme,
  useThemeColors,
  THEMES,
  THEME_COLORS_MAP,
  THEME_LABELS,
} from "../src/context/ThemeContext";

import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
  updateEmail,
  deleteUser,
} from "firebase/auth";

import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import uuid from "react-native-uuid";

import { runTransaction } from "firebase/firestore";

import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  auth,
  db,
  serverTimestamp,
} from "../src/firebase/firebase.web";

const BUCKET = "domowe-443e7.firebasestorage.app";

/* MOTYWY -------------------------------------------------- */

function ThemeRow({ t, active, onSelect, colors }: any) {
  const c = THEME_COLORS_MAP[t];

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onSelect}
      style={[
        styles.themeTile,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: colors.bg,
        },
        Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null,
      ]}
    >
      <View style={styles.themeLeft}>
        <View style={styles.themePreview}>
          <View
            style={[
              styles.previewDot,
              { backgroundColor: c.bg, borderColor: c.border },
            ]}
          />
          <View
            style={[
              styles.previewDot,
              { backgroundColor: c.card, borderColor: c.border },
            ]}
          />
          <View
            style={[
              styles.previewDot,
              { backgroundColor: c.accent, borderColor: c.border },
            ]}
          />
        </View>

        <Text
          numberOfLines={1}
          style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}
        >
          {THEME_LABELS[t]}
        </Text>
      </View>

      <View
        style={[
          styles.radioPill,
          {
            borderColor: active ? colors.accent : colors.border,
            backgroundColor: active ? colors.accent : "transparent",
          },
        ]}
      >
        <View
          style={[
            styles.radioKnob,
            {
              backgroundColor: active ? "#0f172a" : colors.card,
              transform: [{ translateX: active ? 12 : 0 }],
              borderColor: colors.border,
            },
          ]}
        >
          {active ? <Ionicons size={12} color="#fff" name="checkmark" /> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* KOMPONENT SETTINGS -------------------------------------------------- */

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { colors } = useThemeColors();

  /* Profil */
  const [displayNameState, setDisplayNameState] = useState(
    auth.currentUser?.displayName ||
      auth.currentUser?.email?.split("@")[0] ||
      "Użytkownik"
  );
  const [nick, setNick] = useState("");
  const [avatar, setAvatar] = useState("");
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [savingNick, setSavingNick] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // INFO/ERROR modal dla nicku (pusty/brak zmian/zajęty/błąd)
  const [showNickInfoModal, setShowNickInfoModal] = useState(false);
  const [nickInfoTitle, setNickInfoTitle] = useState("Info");
  const [nickInfoMessage, setNickInfoMessage] = useState("");

  // Potwierdzenie zmiany nicku
  const [showNickConfirmModal, setShowNickConfirmModal] = useState(false);

  // Sukces zmiany nicku
  const [showNickSuccessModal, setShowNickSuccessModal] = useState(false);

  /* Reauth + hasło */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busyPassword, setBusyPassword] = useState(false);

  // ✅ Sukces zmiany hasła
  const [showPasswordSuccessModal, setShowPasswordSuccessModal] = useState(false);

  /* Email (✅ użytkownik MUSI sam wpisać aktualny e-mail) */
  const [currentEmailInput, setCurrentEmailInput] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [busyEmail, setBusyEmail] = useState(false);

  const [showEmailConfirmModal, setShowEmailConfirmModal] = useState(false);
  const [showEmailSuccessModal, setShowEmailSuccessModal] = useState(false);

  /* Wspólny błąd dla sekcji bezpieczeństwa */
  const [securityError, setSecurityError] = useState("");

  /* Konto */
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  /* STYLE */
  const cardStyle = useMemo(
    () => ({
      backgroundColor: colors.card,
      borderColor: colors.border,
    }),
    [colors.card, colors.border]
  );

  const labelStyle = { color: colors.text, fontSize: 15, fontWeight: "700" };
  const mutedStyle = { color: colors.textMuted, fontSize: 13 };

  const openNickInfo = (title: string, message: string) => {
    setNickInfoTitle(title);
    setNickInfoMessage(message);
    setShowNickInfoModal(true);
  };

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  /* ŁADOWANIE PROFILU -------------------------------------------------- */

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      setLoadingInitial(false);
      return;
    }

    const load = async () => {
      try {
        const ref = doc("users", u.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const d = snap.data();
          const name = (d.displayName || d.nick || "").trim();

          setNick(name);
          setAvatar(d.photoURL || u.photoURL || "");
          setDisplayNameState(name);
        } else {
          await setDoc(ref, {
            email: u.email,
            displayName: u.displayName || "",
            nick: u.displayName || "",
            photoURL: u.photoURL || "",
            usernameLower: (u.displayName || "").toLowerCase(),
            createdAt: new Date(),
          });

          setNick(u.displayName || "");
          setAvatar(u.photoURL || "");
        }
      } catch {
        console.log("profile load error");
      } finally {
        setLoadingInitial(false);
      }
    };

    load();
  }, []);

  /* AVATAR -------------------------------------------------- */

  const pickAvatar = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (pick.canceled) return;

    const uri = pick.assets[0].uri;
    const ext = pick.assets[0].mimeType
      ? pick.assets[0].mimeType.split("/")[1]
      : "jpg";

    const id = String(uuid.v4());
    const path = `profilePictures/${user.uid}/${id}.${ext}`;

    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(
      path
    )}`;

    try {
      setUploadingAvatar(true);

      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        const form = new FormData();
        form.append("file", blob as any);

        const res = await fetch(uploadUrl, { method: "POST", body: form });
        if (!res.ok) throw new Error();
      } else {
        const res = await FileSystem.uploadAsync(uploadUrl, uri, {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: "file",
        });
        if (res.status !== 200 && res.status !== 201) throw new Error();
      }

      const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(
        path
      )}?alt=media`;

      setAvatar(downloadURL);

      await Promise.all([
        updateProfile(user, { photoURL: downloadURL }),
        setDoc(doc("users", user.uid), { photoURL: downloadURL }, { merge: true }),
      ]);
    } catch {
      console.log("avatar upload error");
    } finally {
      setUploadingAvatar(false);
    }
  };

  /* ZMIANA NICKU -------------------------------------------------- */

  const requestNickChange = () => {
    const trimmed = nick.trim();

    if (!trimmed) {
      openNickInfo("Nieprawidłowy nick", "Nick nie może być pusty.");
      return;
    }

    if (trimmed === displayNameState.trim()) {
      openNickInfo("Brak zmian", "To już jest Twój aktualny nick.");
      return;
    }

    setShowNickConfirmModal(true);
  };

  const performNickChange = async () => {
    const user = auth.currentUser;

    // 🔎 DEBUG helper
    const DEBUG_NICK = true;
    const dlog = (...args: any[]) => {
      if (!DEBUG_NICK) return;
      try {
        console.log("[nick][debug]", ...args);
      } catch {}
    };

    if (!user) {
      dlog("ABORT: auth.currentUser is null/undefined");
      return;
    }

    const trimmed = nick.trim();
    const newLower = trimmed.toLowerCase();

    setSavingNick(true);

    try {
      dlog("START", {
        at: new Date().toISOString(),
        platform: Platform.OS,
        currentUserUid: user.uid,
        currentUserEmail: user.email,
        currentUserDisplayName: user.displayName,
      });

      // 🔎 token/claims (czy Firestore powinien wysyłać auth)
      try {
        const tokenRes = await user.getIdTokenResult?.();
        dlog("ID_TOKEN_RESULT", {
          authTime: tokenRes?.authTime,
          issuedAtTime: tokenRes?.issuedAtTime,
          expirationTime: tokenRes?.expirationTime,
          signInProvider: tokenRes?.signInProvider,
          claimsKeys: tokenRes?.claims ? Object.keys(tokenRes.claims) : [],
        });
      } catch (e: any) {
        dlog("ID_TOKEN_RESULT FAILED", e?.code, e?.message);
      }

      // walidacja (prosta i czytelna)
      const ok = /^[a-zA-Z0-9_.-]{3,20}$/.test(trimmed);
      dlog("VALIDATION", { trimmed, ok, newLower });

      if (!ok) {
        setShowNickConfirmModal(false);
        openNickInfo(
          "Nieprawidłowy nick",
          "Użyj 3–20 znaków: litery, cyfry oraz . _ -"
        );
        return;
      }

      // 🔎 Firestore / project sanity
      dlog("FIRESTORE", {
        projectId: (db as any)?.app?.options?.projectId,
      });

      const userRef = doc("users", user.uid);
      const newNameRef = doc("usernames", newLower);

      dlog("REFS", {
        userRefPath: (userRef as any)?.path,
        newNameRefPath: (newNameRef as any)?.path,
      });

      let txAttempt = 0;

      await runTransaction(db, async (tx) => {
        txAttempt += 1;
        dlog(`TX_BEGIN attempt=${txAttempt}`);

        // 1) user doc
        dlog("TX_GET userRef", (userRef as any)?.path);
        const userSnap = await tx.get(userRef);
        dlog("TX_GOT userRef", { exists: userSnap.exists() });

        const userData = userSnap.exists() ? (userSnap.data() as any) : {};
        const oldLower = (userData?.usernameLower || "").toString().toLowerCase();

        dlog("TX_USER_DATA", {
          oldLower,
          hasUsernameLower: !!oldLower,
          displayNameInDb: userData?.displayName,
          nickInDb: userData?.nick,
        });

        // 2) check if taken
        dlog("TX_GET newNameRef", (newNameRef as any)?.path);
        const takenSnap = await tx.get(newNameRef);
        dlog("TX_GOT newNameRef", { exists: takenSnap.exists() });

        if (takenSnap.exists()) {
          const taken = takenSnap.data() as any;
          dlog("TX_TAKEN_DOC", taken);

          if (taken?.uid && taken.uid !== user.uid) {
            dlog("TX_ABORT: NICK_TAKEN", { takenUid: taken.uid, me: user.uid });
            throw Object.assign(new Error("NICK_TAKEN"), { code: "nick/taken" });
          }
        }

        // 3) release old
        if (oldLower && oldLower !== newLower) {
          const oldNameRef = doc("usernames", oldLower);
          dlog("TX_GET oldNameRef", (oldNameRef as any)?.path);

          const oldSnap = await tx.get(oldNameRef);
          dlog("TX_GOT oldNameRef", { exists: oldSnap.exists() });

          if (oldSnap.exists()) {
            const old = oldSnap.data() as any;
            dlog("TX_OLD_DOC", old);

            if (old?.uid === user.uid) {
              dlog("TX_DELETE oldNameRef", (oldNameRef as any)?.path);
              tx.delete(oldNameRef);
            } else {
              dlog("TX_SKIP delete oldNameRef: owner mismatch", {
                oldUid: old?.uid,
                me: user.uid,
              });
            }
          }
        } else {
          dlog("TX_SKIP release oldLower", { oldLower, newLower });
        }

        // 4) reserve new
        dlog("TX_SET newNameRef", { uid: user.uid, newLower });
        tx.set(
          newNameRef,
          { uid: user.uid, createdAt: serverTimestamp() },
          { merge: true }
        );

        // 5) update profile
        const payload = {
          displayName: trimmed,
          nick: trimmed,
          usernameLower: newLower,
          photoURL: user.photoURL || avatar || "",
          email: user.email || "",
          updatedAt: serverTimestamp(),
        };

        dlog("TX_SET userRef merge", payload);
        tx.set(userRef, payload, { merge: true });

        dlog(`TX_END attempt=${txAttempt}`);
      });

      dlog("TX_COMMIT_OK");

      // update w Auth (po transakcji)
      try {
        dlog("AUTH updateProfile start", { displayName: trimmed });
        await updateProfile(user, { displayName: trimmed });
        dlog("AUTH updateProfile ok");
      } catch (e: any) {
        console.error("[nick] updateProfile failed:", e?.code, e?.message, e);
      }

      setDisplayNameState(trimmed);
      setShowNickConfirmModal(false);
      setShowNickSuccessModal(true);

      dlog("DONE_OK");
    } catch (e: any) {
      console.error("[nick] FAILED:", e?.code, e?.message, e);

      // 🔎 extra info for permission-denied
      if (e?.code === "permission-denied" || e?.message?.includes?.("permission")) {
        try {
          const tokenRes2 = await auth.currentUser?.getIdTokenResult?.();
          dlog("PERM_DENIED token snapshot", {
            currentUserUid: auth.currentUser?.uid,
            claimsKeys: tokenRes2?.claims ? Object.keys(tokenRes2.claims) : [],
            expirationTime: tokenRes2?.expirationTime,
          });
        } catch (e2: any) {
          dlog("PERM_DENIED getIdTokenResult failed", e2?.code, e2?.message);
        }
      }

      setShowNickConfirmModal(false);

      if (e?.code === "nick/taken" || e?.message === "NICK_TAKEN") {
        openNickInfo("Ten nick jest zajęty", "Wybierz proszę inną nazwę użytkownika.");
      } else {
        openNickInfo(
          "Nie udało się zmienić nicku",
          `${e?.code ?? ""} ${e?.message ?? ""}`.trim() ||
            "Spróbuj ponownie za chwilę."
        );
      }
    } finally {
      setSavingNick(false);
      try {
        // końcowy log stanu auth (czasem auth znika w trakcie)
        const u2 = auth.currentUser;
        console.log("[nick][debug] FINALLY auth:", {
          uid: u2?.uid,
          email: u2?.email,
          displayName: u2?.displayName,
        });
      } catch {}
    }
  };

  /* ZMIANA HASŁA -------------------------------------------------- */

  const reauth = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) return false;
    if (!currentPassword) return false;

    try {
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, currentPassword)
      );
      return true;
    } catch {
      return false;
    }
  };

  const changePassword = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const pass = newPassword.trim();
    if (!pass) return;

    setSecurityError("");
    setBusyPassword(true);
    try {
      const ok = await reauth();
      if (!ok) {
        setSecurityError("Nieprawidłowe aktualne hasło.");
        setBusyPassword(false);
        return;
      }

      await updatePassword(user, pass);

      // ✅ czyścimy pola i pokazujemy modal sukcesu
      setNewPassword("");
      setCurrentPassword("");
      setShowPasswordSuccessModal(true);
    } catch {
      setSecurityError("Nie udało się zmienić hasła. Spróbuj ponownie.");
    }
    setBusyPassword(false);
  };

  /* ZMIANA EMAILA -------------------------------------------------- */

  const requestEmailChange = () => {
    const user = auth.currentUser;
    if (!user) return;

    const cur = currentEmailInput.trim();
    const next = newEmail.trim();
    const userEmail = (user.email || "").trim();

    setSecurityError("");

    if (!cur || !next) {
      setSecurityError("Uzupełnij aktualny i nowy adres e-mail.");
      return;
    }

    if (!isValidEmail(cur) || !isValidEmail(next)) {
      setSecurityError("Podaj poprawne adresy e-mail.");
      return;
    }

    if (!userEmail) {
      setSecurityError("Brak e-maila na koncie. Spróbuj zalogować się ponownie.");
      return;
    }

    if (userEmail.toLowerCase() !== cur.toLowerCase()) {
      setSecurityError("Aktualny e-mail nie zgadza się z tym na koncie.");
      return;
    }

    if (cur.toLowerCase() === next.toLowerCase()) {
      setSecurityError("Nowy e-mail musi być inny niż aktualny.");
      return;
    }

    setShowEmailConfirmModal(true);
  };

  const performEmailChange = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const next = newEmail.trim();
    setBusyEmail(true);
    setSecurityError("");

    try {
      const ok = await reauth();
      if (!ok) {
        setSecurityError("Nieprawidłowe aktualne hasło.");
        setBusyEmail(false);
        return;
      }

      await updateEmail(user, next);

      await setDoc(doc("users", user.uid), { email: next }, { merge: true });

      setCurrentEmailInput("");
      setNewEmail("");

      setShowEmailConfirmModal(false);
      setShowEmailSuccessModal(true);
    } catch (e: any) {
      const code = e?.code as string | undefined;

      if (code === "auth/email-already-in-use") {
        setSecurityError("Ten e-mail jest już używany.");
      } else if (code === "auth/invalid-email") {
        setSecurityError("Niepoprawny adres e-mail.");
      } else if (code === "auth/requires-recent-login") {
        setSecurityError("Zaloguj się ponownie i spróbuj jeszcze raz.");
      } else {
        setSecurityError("Nie udało się zmienić e-maila. Spróbuj ponownie.");
      }
    } finally {
      setBusyEmail(false);
    }
  };

  /* USUWANIE KONTA -------------------------------------------------- */

  const openDeleteConfirm = () => {
    setDeleteError("");
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setBusyDelete(true);
    try {
      try {
        await deleteDoc(doc("users", user.uid));
      } catch {}

      await deleteUser(user);

      setShowDeleteConfirm(false);
      setShowDeleteSuccess(true);
    } catch (e) {
      setDeleteError("Błąd przy usuwaniu konta.");
    }
    setBusyDelete(false);
  };

  /* RENDER -------------------------------------------------- */

  const inputStyle = {
    borderWidth: 1,
    borderRadius: 12,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    fontSize: 15,
  };

  const smallBtnBase = {
    alignSelf: "center",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minWidth: 170,
    alignItems: "center",
  };

  // ✅ blur na web jak w stats/index
  const orbBlur = Platform.OS === "web" ? ({ filter: "blur(48px)" } as any) : null;

  if (loadingInitial) {
    return (
      <View style={[styles.page, { backgroundColor: colors.bg }]}>
        {/* 🔥 TŁO jak w osiągnięciach */}
        <View pointerEvents="none" style={styles.bgLayer}>
          <View
            style={[
              styles.orb,
              {
                width: 320,
                height: 320,
                top: -150,
                left: -120,
                backgroundColor: colors.accent + "28",
              },
              orbBlur as any,
            ]}
          />
          <View
            style={[
              styles.orb,
              {
                width: 260,
                height: 260,
                top: -90,
                right: -120,
                backgroundColor: "#22c55e22",
              },
              orbBlur as any,
            ]}
          />
          <View
            style={[
              styles.orb,
              {
                width: 220,
                height: 220,
                top: 210,
                left: -90,
                backgroundColor: "#a855f720",
              },
              orbBlur as any,
            ]}
          />
          <View
            style={[
              styles.orb,
              {
                width: 300,
                height: 300,
                top: 420,
                right: -150,
                backgroundColor: "#0ea5e920",
              },
              orbBlur as any,
            ]}
          />
          <View
            style={[
              styles.orb,
              {
                width: 180,
                height: 180,
                top: 720,
                left: 40,
                backgroundColor: "#f9731620",
              },
              orbBlur as any,
            ]}
          />
        </View>

        <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
          <View style={{ flex: 1, justifyContent: "center", zIndex: 1 }}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      {/* 🔥 TŁO: orby/gradienty jak w stats.tsx */}
      <View pointerEvents="none" style={styles.bgLayer}>
        <View
          style={[
            styles.orb,
            {
              width: 320,
              height: 320,
              top: -150,
              left: -120,
              backgroundColor: colors.accent + "28",
            },
            orbBlur as any,
          ]}
        />
        <View
          style={[
            styles.orb,
            {
              width: 260,
              height: 260,
              top: -90,
              right: -120,
              backgroundColor: "#22c55e22",
            },
            orbBlur as any,
          ]}
        />
        <View
          style={[
            styles.orb,
            {
              width: 220,
              height: 220,
              top: 210,
              left: -90,
              backgroundColor: "#a855f720",
            },
            orbBlur as any,
          ]}
        />
        <View
          style={[
            styles.orb,
            {
              width: 300,
              height: 300,
              top: 420,
              right: -150,
              backgroundColor: "#0ea5e920",
            },
            orbBlur as any,
          ]}
        />
        <View
          style={[
            styles.orb,
            {
              width: 180,
              height: 180,
              top: 720,
              left: 40,
              backgroundColor: "#f9731620",
            },
            orbBlur as any,
          ]}
        />
      </View>

      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent", zIndex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            padding: 16,
            paddingBottom: 140,
            width: "100%",
            maxWidth: 900,
            alignSelf: Platform.OS === "web" ? "center" : "stretch",
          }}
        >
          {/* HEADER */}
          <View style={{ flexDirection: "row", marginBottom: 18, alignItems: "center" }}>
            <TouchableOpacity onPress={() => router.back()} style={{ paddingRight: 8 }}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>

            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
              Ustawienia
            </Text>
          </View>

          {/* KARTA PROFIL (TYLKO TU ZOSTAJĄ KÓŁKA) */}
          <View
            style={{
              ...cardStyle,
              borderWidth: 1,
              borderRadius: 16,
              padding: 14,
              marginBottom: 14,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -80,
                right: -70,
                width: 180,
                height: 180,
                borderRadius: 999,
                backgroundColor: colors.accent,
                opacity: 0.1,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                bottom: -90,
                left: -70,
                width: 200,
                height: 200,
                borderRadius: 999,
                backgroundColor: colors.accent,
                opacity: 0.07,
              }}
            />

            {/* Avatar */}
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  alignSelf: "flex-start",
                }}
              ></Text>

              <Image
                source={{
                  uri: avatar || "https://i.ibb.co/4pDNDk1/avatar-placeholder.png",
                }}
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 42,
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />

              <TouchableOpacity
                onPress={pickAvatar}
                disabled={uploadingAvatar}
                style={{
                  ...smallBtnBase,
                  marginTop: 12,
                  backgroundColor: colors.accent,
                  opacity: uploadingAvatar ? 0.7 : 1,
                }}
              >
                <Text style={{ fontWeight: "800", color: "#022c22" }}>
                  {uploadingAvatar ? "Wysyłam..." : "Zmień zdjęcie"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Nick */}
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
                Zmień nick
              </Text>

              <TextInput
                value={nick}
                onChangeText={setNick}
                placeholder="Nowy nick"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
              />

              <TouchableOpacity
                onPress={requestNickChange}
                disabled={savingNick}
                style={{
                  ...smallBtnBase,
                  marginTop: 12,
                  backgroundColor: colors.accent,
                  opacity: savingNick ? 0.7 : 1,
                }}
              >
                <Text style={{ fontWeight: "800", color: "#022c22" }}>
                  {savingNick ? "Zapisywanie..." : "Zapisz nick"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* KARTA WYGLĄD (BEZ KÓŁEK) */}
          <View
            style={{
              ...cardStyle,
              borderWidth: 1,
              borderRadius: 16,
              padding: 12,
              marginBottom: 14,
            }}
          >
            <Text style={labelStyle}>Wygląd</Text>
            <Text style={[mutedStyle, { marginTop: 4 }]}>Zmieniaj motyw aplikacji.</Text>

            <View style={{ marginTop: 10, marginBottom: 8 }}>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
                Motywy
              </Text>
              <Text style={[mutedStyle, { marginTop: 2, fontSize: 12 }]}>
                Wybierz jeden z dostępnych motywów
              </Text>
            </View>

            <View style={styles.themeGrid}>
              {THEMES.map((t) => (
                <ThemeRow
                  key={t}
                  t={t}
                  active={t === theme}
                  onSelect={() => setTheme(t)}
                  colors={colors}
                />
              ))}
            </View>
          </View>

          {/* KARTA BEZPIECZEŃSTWO (BEZ KÓŁEK) */}
          <View
            style={{
              ...cardStyle,
              borderWidth: 1,
              borderRadius: 16,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <Text style={labelStyle}>Bezpieczeństwo</Text>
            <Text style={[mutedStyle, { marginTop: 4 }]}>
              Operacje wymagają podania hasła.
            </Text>

            {/* ✅ USUNIĘTE: wyświetlanie aktualnego e-maila */}

            <TextInput
              secureTextEntry
              placeholder="Aktualne hasło"
              placeholderTextColor={colors.textMuted}
              style={inputStyle}
              value={currentPassword}
              onChangeText={(v) => {
                setCurrentPassword(v);
                if (securityError) setSecurityError("");
              }}
            />

            <View style={{ marginTop: 14 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
                Zmień hasło
              </Text>

              <TextInput
                secureTextEntry
                placeholder="Nowe hasło"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
                value={newPassword}
                onChangeText={(v) => {
                  setNewPassword(v);
                  if (securityError) setSecurityError("");
                }}
              />

              <TouchableOpacity
                onPress={changePassword}
                disabled={busyPassword}
                style={{
                  ...smallBtnBase,
                  marginTop: 12,
                  backgroundColor: colors.accent,
                  opacity: busyPassword ? 0.75 : 1,
                }}
              >
                <Text style={{ fontWeight: "800", color: "#022c22" }}>
                  {busyPassword ? "Aktualizuję..." : "Zaktualizuj hasło"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ✅ ZMIANA EMAILA */}
            <View style={{ marginTop: 18 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
                Zmień e-mail
              </Text>

              <TextInput
                placeholder="Wpisz aktualny e-mail"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
                value={currentEmailInput}
                autoCapitalize="none"
                keyboardType={Platform.OS === "ios" ? "email-address" : "email-address"}
                onChangeText={(v) => {
                  setCurrentEmailInput(v);
                  if (securityError) setSecurityError("");
                }}
              />

              <TextInput
                placeholder="Wpisz nowy e-mail"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
                value={newEmail}
                autoCapitalize="none"
                keyboardType={Platform.OS === "ios" ? "email-address" : "email-address"}
                onChangeText={(v) => {
                  setNewEmail(v);
                  if (securityError) setSecurityError("");
                }}
              />

              <TouchableOpacity
                onPress={requestEmailChange}
                disabled={busyEmail}
                style={{
                  ...smallBtnBase,
                  marginTop: 12,
                  backgroundColor: colors.accent,
                  opacity: busyEmail ? 0.75 : 1,
                }}
              >
                <Text style={{ fontWeight: "800", color: "#022c22" }}>
                  {busyEmail ? "Aktualizuję..." : "Zaktualizuj e-mail"}
                </Text>
              </TouchableOpacity>
            </View>

            {!!securityError && (
              <Text
                style={{
                  marginTop: 12,
                  color: "#b91c1c",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                {securityError}
              </Text>
            )}
          </View>

          {/* USUWANIE KONTA (BEZ KÓŁEK) */}
          <View
            style={{
              ...cardStyle,
              borderWidth: 1,
              borderRadius: 16,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <Text style={labelStyle}>Niebezpieczna strefa</Text>
            <Text style={[mutedStyle, { marginTop: 4 }]}>Usunięcie konta jest nieodwracalne.</Text>

            <TouchableOpacity
              onPress={openDeleteConfirm}
              disabled={busyDelete}
              style={{
                ...smallBtnBase,
                marginTop: 12,
                backgroundColor: "#7f1d1d",
                opacity: busyDelete ? 0.75 : 1,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>Usuń konto</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* MODAL — INFO/ERROR NICK */}
        <Modal
          visible={showNickInfoModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowNickInfoModal(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.4)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  textAlign: "center",
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                {nickInfoTitle}
              </Text>

              <Text
                style={{
                  fontSize: 14,
                  textAlign: "center",
                  color: colors.textMuted,
                }}
              >
                {nickInfoMessage}
              </Text>

              <TouchableOpacity
                onPress={() => setShowNickInfoModal(false)}
                style={{
                  marginTop: 18,
                  borderRadius: 999,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor: colors.accent,
                }}
              >
                <Text style={{ color: "#022c22", fontWeight: "800" }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL — POTWIERDZENIE ZMIANY NICKU */}
        <Modal
          visible={showNickConfirmModal}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!savingNick) setShowNickConfirmModal(false);
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.4)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  textAlign: "center",
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Zatwierdź zmianę nicku
              </Text>

              <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14 }}>
                Po zapisaniu Twój nick zostanie ustawiony na:
              </Text>

              <Text
                style={{
                  marginTop: 10,
                  textAlign: "center",
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: "900",
                }}
              >
                {nick.trim()}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  marginTop: 18,
                  justifyContent: "space-between",
                }}
              >
                <TouchableOpacity
                  onPress={() => setShowNickConfirmModal(false)}
                  disabled={savingNick}
                  style={{
                    flex: 1,
                    marginRight: 8,
                    paddingVertical: 10,
                    borderRadius: 999,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                    opacity: savingNick ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: colors.text }}>Anuluj</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={performNickChange}
                  disabled={savingNick}
                  style={{
                    flex: 1,
                    marginLeft: 8,
                    paddingVertical: 10,
                    borderRadius: 999,
                    alignItems: "center",
                    backgroundColor: colors.accent,
                    opacity: savingNick ? 0.7 : 1,
                  }}
                >
                  {savingNick ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <ActivityIndicator size="small" color="#022c22" />
                      <Text style={{ color: "#022c22", fontWeight: "800" }}>Zapisuję...</Text>
                    </View>
                  ) : (
                    <Text style={{ color: "#022c22", fontWeight: "800" }}>Tak, zmień</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL — SUKCES ZMIANY NICKU */}
        <Modal
          visible={showNickSuccessModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowNickSuccessModal(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.4)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  textAlign: "center",
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Gotowe ✅
              </Text>

              <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14 }}>
                Nick został zmieniony.
              </Text>

              <TouchableOpacity
                onPress={() => setShowNickSuccessModal(false)}
                style={{
                  marginTop: 18,
                  borderRadius: 999,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor: colors.accent,
                }}
              >
                <Text style={{ color: "#022c22", fontWeight: "800" }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ✅ MODAL — SUKCES ZMIANY HASŁA */}
        <Modal
          visible={showPasswordSuccessModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPasswordSuccessModal(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.4)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  textAlign: "center",
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Gotowe ✅
              </Text>

              <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14 }}>
                Hasło zostało zmienione.
              </Text>

              <TouchableOpacity
                onPress={() => setShowPasswordSuccessModal(false)}
                style={{
                  marginTop: 18,
                  borderRadius: 999,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor: colors.accent,
                }}
              >
                <Text style={{ color: "#022c22", fontWeight: "800" }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL — POTWIERDZENIE ZMIANY EMAILA */}
        <Modal
          visible={showEmailConfirmModal}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!busyEmail) setShowEmailConfirmModal(false);
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.4)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  textAlign: "center",
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Zatwierdź zmianę e-maila
              </Text>

              <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14 }}>
                Na pewno chcesz zmienić e-mail na:
              </Text>

              <Text
                style={{
                  marginTop: 10,
                  textAlign: "center",
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: "900",
                }}
              >
                {newEmail.trim()}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  marginTop: 18,
                  justifyContent: "space-between",
                }}
              >
                <TouchableOpacity
                  onPress={() => setShowEmailConfirmModal(false)}
                  disabled={busyEmail}
                  style={{
                    flex: 1,
                    marginRight: 8,
                    paddingVertical: 10,
                    borderRadius: 999,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                    opacity: busyEmail ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: colors.text }}>Anuluj</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={performEmailChange}
                  disabled={busyEmail}
                  style={{
                    flex: 1,
                    marginLeft: 8,
                    paddingVertical: 10,
                    borderRadius: 999,
                    alignItems: "center",
                    backgroundColor: colors.accent,
                    opacity: busyEmail ? 0.7 : 1,
                  }}
                >
                  {busyEmail ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <ActivityIndicator size="small" color="#022c22" />
                      <Text style={{ color: "#022c22", fontWeight: "800" }}>Zmieniam...</Text>
                    </View>
                  ) : (
                    <Text style={{ color: "#022c22", fontWeight: "800" }}>Tak, zmień</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL — SUKCES ZMIANY EMAILA */}
        <Modal
          visible={showEmailSuccessModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowEmailSuccessModal(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.4)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  textAlign: "center",
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Gotowe ✅
              </Text>

              <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14 }}>
                E-mail został zmieniony.
              </Text>

              <TouchableOpacity
                onPress={() => setShowEmailSuccessModal(false)}
                style={{
                  marginTop: 18,
                  borderRadius: 999,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor: colors.accent,
                }}
              >
                <Text style={{ color: "#022c22", fontWeight: "800" }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL — POTWIERDZENIE USUNIĘCIA */}
        <Modal
          visible={showDeleteConfirm}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeleteConfirm(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.4)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  textAlign: "center",
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Usunięcie konta
              </Text>

              <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14 }}>
                Ta operacja jest nieodwracalna.
              </Text>

              {!!deleteError && (
                <Text
                  style={{
                    color: "#b91c1c",
                    marginTop: 10,
                    textAlign: "center",
                    fontSize: 13,
                  }}
                >
                  {deleteError}
                </Text>
              )}

              <View
                style={{
                  flexDirection: "row",
                  marginTop: 18,
                  justifyContent: "space-between",
                }}
              >
                <TouchableOpacity
                  onPress={() => setShowDeleteConfirm(false)}
                  style={{
                    flex: 1,
                    marginRight: 8,
                    paddingVertical: 10,
                    borderRadius: 999,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                  }}
                >
                  <Text style={{ color: colors.text }}>Anuluj</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConfirmDelete}
                  disabled={busyDelete}
                  style={{
                    flex: 1,
                    marginLeft: 8,
                    paddingVertical: 10,
                    borderRadius: 999,
                    alignItems: "center",
                    backgroundColor: "#7f1d1d",
                    opacity: busyDelete ? 0.75 : 1,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Usuń</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL — SUKCES USUNIĘCIA */}
        <Modal
          visible={showDeleteSuccess}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowDeleteSuccess(false);
            router.replace("/login");
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.4)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "800",
                  textAlign: "center",
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                Do zobaczenia! 👋
              </Text>

              <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14 }}>
                Konto zostało usunięte.
              </Text>

              <TouchableOpacity
                onPress={() => {
                  setShowDeleteSuccess(false);
                  router.replace("/login");
                }}
                style={{
                  marginTop: 18,
                  borderRadius: 999,
                  paddingVertical: 12,
                  alignItems: "center",
                  backgroundColor: colors.accent,
                }}
              >
                <Text style={{ color: "#022c22", fontWeight: "800" }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

/* STYLES -------------------------------------------------- */

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: Platform.OS === "web" ? ("100dvh" as any) : undefined,
  },

  bgLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },

  orb: {
    position: "absolute",
    borderRadius: 999,
    opacity: 1,
  },

  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  themeTile: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,

    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "48%",
  },

  themeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    paddingRight: 8,
  },

  themePreview: { flexDirection: "row", gap: 4 },
  previewDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },

  radioPill: {
    width: 38,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    padding: 2,
    justifyContent: "center",
  },
  radioKnob: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
