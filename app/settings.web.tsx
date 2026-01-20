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
  verifyBeforeUpdateEmail,
  deleteUser,
} from "firebase/auth";

import * as ImagePicker from "expo-image-picker";
import uuid from "react-native-uuid";

import { runTransaction } from "firebase/firestore";

import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  auth,
  db,
  serverTimestamp,
} from "../src/firebase/firebase.web";

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

/* ✅ PasswordField (MUSI być poza SettingsScreen!) ------------------- */
/* To naprawia bug: wpisywanie tylko po jednym znaku na web */
function PasswordField({
  value,
  onChangeText,
  placeholder,
  visible,
  onToggle,
  colors,
  inputStyle,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  visible: boolean;
  onToggle: () => void;
  colors: any;
  inputStyle: any;
}) {
  return (
    <View style={{ position: "relative", marginTop: 10 }}>
      <TextInput
        secureTextEntry={!visible}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={{
          ...inputStyle,
          marginTop: 0,
          paddingRight: 44,
        }}
        value={value}
        onChangeText={onChangeText}
      />

      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.85}
        style={{
          position: "absolute",
          right: 10,
          top: 8,
          width: 36,
          height: 36,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 999,
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons
          name={visible ? "eye-outline" : "eye-off-outline"}
          size={20}
          color={colors.textMuted}
        />
      </TouchableOpacity>
    </View>
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

  // INFO/ERROR modal dla nicku
  const [showNickInfoModal, setShowNickInfoModal] = useState(false);
  const [nickInfoTitle, setNickInfoTitle] = useState("Info");
  const [nickInfoMessage, setNickInfoMessage] = useState("");

  // Potwierdzenie zmiany nicku
  const [showNickConfirmModal, setShowNickConfirmModal] = useState(false);

  // Sukces zmiany nicku
  const [showNickSuccessModal, setShowNickSuccessModal] = useState(false);

  /* 🔐 ZMIANA HASŁA */
  const [currentPasswordForPassword, setCurrentPasswordForPassword] =
    useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordRepeat, setNewPasswordRepeat] = useState("");
  const [busyPassword, setBusyPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const [showPasswordSuccessModal, setShowPasswordSuccessModal] =
    useState(false);

  // ✅ oczka (show/hide)
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showRepeatPass, setShowRepeatPass] = useState(false);

  /* 📩 ZMIANA EMAILA */
  const [currentEmailInput, setCurrentEmailInput] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [passwordForEmail, setPasswordForEmail] = useState("");
  const [showEmailPass, setShowEmailPass] = useState(false);
  const [busyEmail, setBusyEmail] = useState(false);
  const [emailError, setEmailError] = useState("");

  const [showEmailConfirmModal, setShowEmailConfirmModal] = useState(false);
  const [showEmailSuccessModal, setShowEmailSuccessModal] = useState(false);

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

  /* ŁADOWANIE PROFILU + SYNC EMAIL -------------------------------------------------- */

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      setLoadingInitial(false);
      return;
    }

    const load = async () => {
      try {
        try {
          await u.reload();
        } catch {}

        const ref = doc("users", u.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const d = snap.data() as any;
          const name = (d.displayName || d.nick || "").trim();

          setNick(name);
          setAvatar(d.photoURL || u.photoURL || "");
          setDisplayNameState(name);

          const authEmail = (u.email || "").trim();
          const dbEmail = (d.email || "").trim();

          if (authEmail && authEmail !== dbEmail) {
            await setDoc(ref, { email: authEmail }, { merge: true });
          }
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
      } catch (e) {
        console.error("profile load error", e);
      } finally {
        setLoadingInitial(false);
      }
    };

    load();
  }, []);

  /* ✅ AVATAR (Firebase Storage SDK) ---------------------------------- */

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

    try {
      setUploadingAvatar(true);

      // ✅ blob z obrazka (działa na web i expo)
      const blob = await (await fetch(uri)).blob();

      const ext =
        pick.assets[0].mimeType?.split("/")[1] ||
        (blob.type ? blob.type.split("/")[1] : "jpg");

      const id = String(uuid.v4());
      const path = `profilePictures/${user.uid}/${id}.${ext}`;

      // ✅ storage z tej samej aplikacji firebase
      const storage = getStorage(auth.app);
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, blob, {
        contentType: blob.type || "image/jpeg",
      });

      const downloadURL = await getDownloadURL(storageRef);

      setAvatar(downloadURL);

      await Promise.all([
        updateProfile(user, { photoURL: downloadURL }),
        setDoc(doc("users", user.uid), { photoURL: downloadURL }, { merge: true }),
      ]);
    } catch (e) {
      console.error("[AVATAR_UPLOAD_ERROR]", e);
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
    if (!user) return;

    const trimmed = nick.trim();
    const newLower = trimmed.toLowerCase();

    setSavingNick(true);

    try {
      const ok = /^[a-zA-Z0-9_.-]{3,20}$/.test(trimmed);

      if (!ok) {
        setShowNickConfirmModal(false);
        openNickInfo(
          "Nieprawidłowy nick",
          "Użyj 3–20 znaków: litery, cyfry oraz . _ -"
        );
        return;
      }

      const userRef = doc("users", user.uid);
      const newNameRef = doc("usernames", newLower);

      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        const userData = userSnap.exists() ? (userSnap.data() as any) : {};
        const oldLower = (userData?.usernameLower || "").toString().toLowerCase();

        const takenSnap = await tx.get(newNameRef);

        if (takenSnap.exists()) {
          const taken = takenSnap.data() as any;
          if (taken?.uid && taken.uid !== user.uid) {
            throw Object.assign(new Error("NICK_TAKEN"), { code: "nick/taken" });
          }
        }

        if (oldLower && oldLower !== newLower) {
          const oldNameRef = doc("usernames", oldLower);
          const oldSnap = await tx.get(oldNameRef);

          if (oldSnap.exists()) {
            const old = oldSnap.data() as any;
            if (old?.uid === user.uid) {
              tx.delete(oldNameRef);
            }
          }
        }

        tx.set(
          newNameRef,
          { uid: user.uid, createdAt: serverTimestamp() },
          { merge: true }
        );

        tx.set(
          userRef,
          {
            displayName: trimmed,
            nick: trimmed,
            usernameLower: newLower,
            photoURL: user.photoURL || avatar || "",
            email: user.email || "",
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      try {
        await updateProfile(user, { displayName: trimmed });
      } catch {}

      setDisplayNameState(trimmed);
      setShowNickConfirmModal(false);
      setShowNickSuccessModal(true);
    } catch (e: any) {
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
    }
  };

  /* 🔐 REAUTH -------------------------------------------------- */

  const reauthWithPassword = async (password: string) => {
    const user = auth.currentUser;

    if (!user || !user.email) {
      throw Object.assign(new Error("NO_USER"), { code: "auth/no-current-user" });
    }

    if (!password) {
      throw Object.assign(new Error("MISSING_PASSWORD"), {
        code: "auth/missing-current-password",
      });
    }

    // ❗ NIE trimujemy hasła – spacje są legalne w haśle
    const cred = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, cred);
    await user.getIdToken(true);
  };

  /* ✅ ZMIANA HASŁA -------------------------------------------------- */

  const changePassword = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setPasswordError("");

    if (!currentPasswordForPassword) {
      setPasswordError("Wpisz aktualne hasło.");
      return;
    }

    if (!newPassword) {
      setPasswordError("Wpisz nowe hasło.");
      return;
    }

    if (!newPasswordRepeat) {
      setPasswordError("Powtórz nowe hasło.");
      return;
    }

    if (newPassword !== newPasswordRepeat) {
      setPasswordError("Nowe hasła nie są takie same.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Nowe hasło musi mieć minimum 6 znaków.");
      return;
    }

    setBusyPassword(true);

    try {
      await reauthWithPassword(currentPasswordForPassword);
      await updatePassword(user, newPassword);

      setNewPassword("");
      setNewPasswordRepeat("");
      setCurrentPasswordForPassword("");
      setShowPasswordSuccessModal(true);

      setShowCurrentPass(false);
      setShowNewPass(false);
      setShowRepeatPass(false);
    } catch (e: any) {
      console.error("[PASSWORD_CHANGE_ERROR]", {
        code: e?.code,
        message: e?.message,
        full: e,
      });

      const code = (e?.code || "").toString();

      if (code === "auth/missing-current-password") {
        setPasswordError("Wpisz aktualne hasło.");
      } else if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential" ||
        code === "auth/invalid-login-credentials"
      ) {
        setPasswordError("Nieprawidłowe aktualne hasło.");
      } else if (code === "auth/too-many-requests") {
        setPasswordError("Zbyt wiele prób. Spróbuj później.");
      } else if (code === "auth/network-request-failed") {
        setPasswordError("Problem z połączeniem. Spróbuj ponownie.");
      } else if (code === "auth/requires-recent-login") {
        setPasswordError("Zaloguj się ponownie i spróbuj jeszcze raz.");
      } else if (code === "auth/weak-password") {
        setPasswordError("Hasło jest za słabe. Ustaw silniejsze hasło.");
      } else {
        setPasswordError("Nie udało się zmienić hasła. Spróbuj ponownie.");
      }
    } finally {
      setBusyPassword(false);
    }
  };

  /* ZMIANA EMAILA (✅ verifyBeforeUpdateEmail) ------------------------ */

  const requestEmailChange = () => {
    const user = auth.currentUser;
    if (!user) return;

    const cur = currentEmailInput.trim();
    const next = newEmail.trim();
    const userEmail = (user.email || "").trim();

    setEmailError("");

    if (!cur || !next) {
      setEmailError("Uzupełnij aktualny i nowy adres e-mail.");
      return;
    }

    if (!isValidEmail(cur) || !isValidEmail(next)) {
      setEmailError("Podaj poprawne adresy e-mail.");
      return;
    }

    if (!userEmail) {
      setEmailError("Brak e-maila na koncie. Spróbuj zalogować się ponownie.");
      return;
    }

    if (userEmail.toLowerCase() !== cur.toLowerCase()) {
      setEmailError("Aktualny e-mail nie zgadza się z tym na koncie.");
      return;
    }

    if (cur.toLowerCase() === next.toLowerCase()) {
      setEmailError("Nowy e-mail musi być inny niż aktualny.");
      return;
    }

    if (!passwordForEmail) {
      setEmailError("Wpisz hasło, aby potwierdzić zmianę e-maila.");
      return;
    }

    setShowEmailConfirmModal(true);
  };

  const performEmailChange = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const next = newEmail.trim();
    setBusyEmail(true);
    setEmailError("");

    try {
      await reauthWithPassword(passwordForEmail);

      const actionCodeSettings = {
        url: `${window.location.origin}/settings`,
        handleCodeInApp: false,
      };

      await verifyBeforeUpdateEmail(user, next, actionCodeSettings);

      setCurrentEmailInput("");
      setNewEmail("");
      setPasswordForEmail("");
      setShowEmailPass(false);

      setShowEmailConfirmModal(false);
      setShowEmailSuccessModal(true);
    } catch (e: any) {
      console.error("[EMAIL_CHANGE_ERROR]", {
        code: e?.code,
        message: e?.message,
        customData: e?.customData,
        full: e,
      });

      setShowEmailConfirmModal(false);

      const code = e?.code as string | undefined;
      const msg = (e?.message || "").toString();
      const messageHas = (needle: string) => msg.toUpperCase().includes(needle);

      if (code === "auth/missing-current-password") {
        setEmailError("Wpisz hasło do potwierdzenia.");
      } else if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential" ||
        code === "auth/invalid-login-credentials"
      ) {
        setEmailError("Nieprawidłowe hasło.");
      } else if (code === "auth/invalid-credential" || code === "auth/user-mismatch") {
        setEmailError("Nie udało się potwierdzić konta. Zaloguj się ponownie.");
      } else if (code === "auth/email-already-in-use" || messageHas("EMAIL_EXISTS")) {
        setEmailError("Ten e-mail jest już używany.");
      } else if (code === "auth/invalid-email" || messageHas("INVALID_EMAIL")) {
        setEmailError("Niepoprawny adres e-mail.");
      } else if (code === "auth/requires-recent-login") {
        setEmailError("Zaloguj się ponownie i spróbuj jeszcze raz.");
      } else if (code === "auth/network-request-failed") {
        setEmailError("Problem z połączeniem. Spróbuj ponownie.");
      } else if (
        code === "auth/operation-not-allowed" ||
        messageHas("OPERATION_NOT_ALLOWED")
      ) {
        setEmailError("Operacja zablokowana w ustawieniach Firebase.");
      } else {
        setEmailError("Nie udało się wysłać maila weryfikacyjnego. Spróbuj ponownie.");
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

  const orbBlur =
    Platform.OS === "web" ? ({ filter: "blur(48px)" } as any) : null;

  if (loadingInitial) {
    return (
      <View style={[styles.page, { backgroundColor: colors.bg }]}>
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

          {/* KARTA PROFIL */}
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

          {/* KARTA WYGLĄD */}
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

          {/* KARTA BEZPIECZEŃSTWO */}
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
              Zmieniaj hasło i e-mail. Każda operacja wymaga potwierdzenia.
            </Text>

            {/* ZMIANA HASŁA */}
            <View
              style={{
                marginTop: 16,
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bg,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>
                Zmień hasło
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                Wpisz aktualne hasło i ustaw nowe (z potwierdzeniem).
              </Text>

              <PasswordField
                value={currentPasswordForPassword}
                onChangeText={(v) => {
                  setCurrentPasswordForPassword(v);
                  if (passwordError) setPasswordError("");
                }}
                placeholder="Aktualne hasło"
                visible={showCurrentPass}
                onToggle={() => setShowCurrentPass((s) => !s)}
                colors={colors}
                inputStyle={inputStyle}
              />

              <PasswordField
                value={newPassword}
                onChangeText={(v) => {
                  setNewPassword(v);
                  if (passwordError) setPasswordError("");
                }}
                placeholder="Nowe hasło"
                visible={showNewPass}
                onToggle={() => setShowNewPass((s) => !s)}
                colors={colors}
                inputStyle={inputStyle}
              />

              <PasswordField
                value={newPasswordRepeat}
                onChangeText={(v) => {
                  setNewPasswordRepeat(v);
                  if (passwordError) setPasswordError("");
                }}
                placeholder="Powtórz nowe hasło"
                visible={showRepeatPass}
                onToggle={() => setShowRepeatPass((s) => !s)}
                colors={colors}
                inputStyle={inputStyle}
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
                  {busyPassword ? "Zmieniam..." : "Zmień hasło"}
                </Text>
              </TouchableOpacity>

              {!!passwordError && (
                <Text
                  style={{
                    marginTop: 10,
                    color: "#b91c1c",
                    fontSize: 13,
                    textAlign: "center",
                  }}
                >
                  {passwordError}
                </Text>
              )}
            </View>

            {/* ZMIANA EMAILA */}
            <View
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bg,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>
                Zmień e-mail
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                Wyślemy link na nowy adres. Zmiana nastąpi dopiero po kliknięciu w mailu.
              </Text>

              <TextInput
                placeholder="Aktualny e-mail"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
                value={currentEmailInput}
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={(v) => {
                  setCurrentEmailInput(v);
                  if (emailError) setEmailError("");
                }}
              />

              <TextInput
                placeholder="Nowy e-mail"
                placeholderTextColor={colors.textMuted}
                style={inputStyle}
                value={newEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={(v) => {
                  setNewEmail(v);
                  if (emailError) setEmailError("");
                }}
              />

              <PasswordField
                value={passwordForEmail}
                onChangeText={(v) => {
                  setPasswordForEmail(v);
                  if (emailError) setEmailError("");
                }}
                placeholder="Hasło do potwierdzenia"
                visible={showEmailPass}
                onToggle={() => setShowEmailPass((s) => !s)}
                colors={colors}
                inputStyle={inputStyle}
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
                  {busyEmail ? "Wysyłam..." : "Wyślij link zmiany e-maila"}
                </Text>
              </TouchableOpacity>

              {!!emailError && (
                <Text
                  style={{
                    marginTop: 10,
                    color: "#b91c1c",
                    fontSize: 13,
                    textAlign: "center",
                  }}
                >
                  {emailError}
                </Text>
              )}
            </View>
          </View>

          {/* USUWANIE KONTA */}
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
            <Text style={[mutedStyle, { marginTop: 4 }]}>
              Usunięcie konta jest nieodwracalne.
            </Text>

            <TouchableOpacity
              onPress={() => {
                setDeleteError("");
                setShowDeleteConfirm(true);
              }}
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

        {/* MODALE – (zostawione jak u Ciebie, bez zmian wizualnych) */}

        {/* INFO/ERROR NICK */}
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

        {/* POTWIERDZENIE ZMIANY NICKU */}
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
                      <Text style={{ color: "#022c22", fontWeight: "800" }}>
                        Zapisuję...
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ color: "#022c22", fontWeight: "800" }}>Tak, zmień</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* SUKCES ZMIANY NICKU */}
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

        {/* SUKCES ZMIANY HASŁA */}
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

        {/* POTWIERDZENIE ZMIANY EMAILA */}
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
                Wyślemy link potwierdzający na:
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
                      <Text style={{ color: "#022c22", fontWeight: "800" }}>
                        Wysyłam...
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ color: "#022c22", fontWeight: "800" }}>Tak, wyślij</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* SUKCES ZMIANY EMAILA */}
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
                Prawie gotowe ✅
              </Text>

              <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14 }}>
                Wysłaliśmy link potwierdzający na nowy adres e-mail.
                Zmiana nastąpi dopiero po kliknięciu w wiadomości.
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

        {/* POTWIERDZENIE USUNIĘCIA */}
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

        {/* SUKCES USUNIĘCIA */}
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
