// app/settings.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
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
  deleteUser,
} from "firebase/auth";

import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import uuid from "react-native-uuid";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  setDoc,
  auth,
} from "../src/firebase/firebase.web";

// Jeśli masz osobny plik natywny, to podepnij go tutaj zamiast firebase.web:
// import { ... } from "../src/firebase/firebase.native";

const BUCKET = "domowe-443e7.firebasestorage.app";

/* ---------- UI: Theme Tile ---------- */

function ThemeTile({
  t,
  active,
  onSelect,
  colors,
}: {
  t: string;
  active: boolean;
  onSelect: () => void;
  colors: any;
}) {
  const c = THEME_COLORS_MAP[t];

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.themeTile,
        {
          backgroundColor: colors.card,
          borderColor: active ? colors.accent : colors.border,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={styles.themeLeft}>
        <View style={styles.themePreview}>
          <View style={[styles.previewDot, { backgroundColor: c.bg, borderColor: c.border }]} />
          <View style={[styles.previewDot, { backgroundColor: c.card, borderColor: c.border }]} />
          <View style={[styles.previewDot, { backgroundColor: c.accent, borderColor: c.border }]} />
        </View>

        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
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
              backgroundColor: active ? "#0f172a" : colors.bg,
              transform: [{ translateX: active ? 12 : 0 }],
              borderColor: colors.border,
            },
          ]}
        >
          {active ? <Ionicons size={12} color="#fff" name="checkmark" /> : null}
        </View>
      </View>
    </Pressable>
  );
}

/* ---------- UI: Section + Row ---------- */

function Section({
  title,
  subtitle,
  colors,
  children,
  icon,
}: {
  title: string;
  subtitle?: string;
  colors: any;
  children: React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          {icon ? (
            <View style={[styles.sectionIcon, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Ionicons name={icon} size={16} color={colors.text} />
            </View>
          ) : null}

          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "900" }}>{title}</Text>
            {subtitle ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{subtitle}</Text>
            ) : null}
          </View>
        </View>
      </View>

      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function PrimaryButton({
  title,
  onPress,
  disabled,
  colors,
  danger,
  loading,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  colors: any;
  danger?: boolean;
  loading?: boolean;
}) {
  const bg = danger ? "#7f1d1d" : colors.accent;
  const text = danger ? "#fff" : "#022c22";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryBtn,
        {
          backgroundColor: bg,
          opacity: disabled || loading ? 0.65 : pressed ? 0.92 : 1,
        },
      ]}
    >
      {loading ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator size="small" color={text} />
          <Text style={{ color: text, fontWeight: "900" }}>{title}</Text>
        </View>
      ) : (
        <Text style={{ color: text, fontWeight: "900" }}>{title}</Text>
      )}
    </Pressable>
  );
}

function SecondaryButton({
  title,
  onPress,
  disabled,
  colors,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  colors: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondaryBtn,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          opacity: disabled ? 0.6 : pressed ? 0.92 : 1,
        },
      ]}
    >
      <Text style={{ color: colors.text, fontWeight: "800" }}>{title}</Text>
    </Pressable>
  );
}

/* ---------- Screen ---------- */

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { colors } = useThemeColors();

  /* Profil */
  const [authEmail, setAuthEmail] = useState(auth.currentUser?.email || "brak");
  const [displayNameState, setDisplayNameState] = useState(
    auth.currentUser?.displayName || auth.currentUser?.email?.split("@")[0] || "Użytkownik"
  );
  const [nick, setNick] = useState("");
  const [avatar, setAvatar] = useState("");
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [savingNick, setSavingNick] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // INFO/ERROR modal (używany też do hasła)
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoTitle, setInfoTitle] = useState("Info");
  const [infoMessage, setInfoMessage] = useState("");

  // Potwierdzenie zmiany nicku
  const [showNickConfirmModal, setShowNickConfirmModal] = useState(false);
  const [showNickSuccessModal, setShowNickSuccessModal] = useState(false);

  /* Reauth + hasło */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busyPassword, setBusyPassword] = useState(false);

  /* Konto */
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const openInfo = (title: string, message: string) => {
    setInfoTitle(title);
    setInfoMessage(message);
    setShowInfoModal(true);
  };

  const inputStyle = useMemo(
    () => ({
      borderWidth: 1,
      borderRadius: 14,
      borderColor: colors.border,
      color: colors.text,
      backgroundColor: colors.bg,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 15,
    }),
    [colors.border, colors.text, colors.bg]
  );

  /* Ładowanie profilu */
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
          const d: any = snap.data();
          const name = (d.displayName || d.nick || "").trim();

          setNick(name);
          setAvatar(d.photoURL || u.photoURL || "");
          setDisplayNameState(name || displayNameState);
          if (d.email) setAuthEmail(d.email);
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
        // celowo cicho, ale możesz tu dodać openInfo(...) jeśli chcesz
        console.log("profile load error");
      } finally {
        setLoadingInitial(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Avatar */
  const pickAvatar = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      openInfo("Brak uprawnień", "Aby zmienić zdjęcie, daj dostęp do galerii.");
      return;
    }

    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });

    if (pick.canceled) return;

    const uri = pick.assets[0].uri;
    const ext = pick.assets[0].mimeType ? pick.assets[0].mimeType.split("/")[1] : "jpg";

    const id = String(uuid.v4());
    const path = `profilePictures/${user.uid}/${id}.${ext}`;

    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(
      path
    )}`;

    try {
      setUploadingAvatar(true);

      // Native upload (iOS/Android)
      const res = await FileSystem.uploadAsync(uploadUrl, uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "file",
      });

      if (res.status !== 200 && res.status !== 201) throw new Error("upload failed");

      const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(
        path
      )}?alt=media`;

      setAvatar(downloadURL);

      await Promise.all([
        updateProfile(user, { photoURL: downloadURL }),
        setDoc(doc("users", user.uid), { photoURL: downloadURL }, { merge: true }),
      ]);

      openInfo("Gotowe ✅", "Zdjęcie profilowe zostało zaktualizowane.");
    } catch {
      openInfo("Błąd", "Nie udało się wgrać zdjęcia. Spróbuj ponownie.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  /* Nick */
  const requestNickChange = () => {
    const trimmed = nick.trim();

    if (!trimmed) {
      openInfo("Nieprawidłowy nick", "Nick nie może być pusty.");
      return;
    }

    if (trimmed === displayNameState.trim()) {
      openInfo("Brak zmian", "To już jest Twój aktualny nick.");
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
      const q = query(collection("users"), where("usernameLower", "==", newLower), limit(1));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const found = snap.docs[0];
        if (found.id !== user.uid) {
          setShowNickConfirmModal(false);
          openInfo("Ten nick jest zajęty", "Wybierz proszę inną nazwę użytkownika.");
          setSavingNick(false);
          return;
        }
      }

      await Promise.all([
        updateProfile(user, { displayName: trimmed }),
        setDoc(
          doc("users", user.uid),
          {
            displayName: trimmed,
            nick: trimmed,
            usernameLower: newLower,
            photoURL: user.photoURL || avatar,
            email: user.email,
          },
          { merge: true }
        ),
      ]);

      setDisplayNameState(trimmed);
      setShowNickConfirmModal(false);
      setShowNickSuccessModal(true);
    } catch {
      setShowNickConfirmModal(false);
      openInfo("Nie udało się zmienić nicku", "Spróbuj ponownie za chwilę.");
    } finally {
      setSavingNick(false);
    }
  };

  /* Hasło */
  const reauth = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) return false;

    if (!currentPassword.trim()) {
      openInfo("Wymagane hasło", "Podaj aktualne hasło, żeby potwierdzić operację.");
      return false;
    }

    try {
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, currentPassword.trim())
      );
      return true;
    } catch {
      openInfo("Niepoprawne hasło", "Aktualne hasło jest nieprawidłowe.");
      return false;
    }
  };

  const changePassword = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const next = newPassword.trim();
    if (!next) {
      openInfo("Brak nowego hasła", "Wpisz nowe hasło.");
      return;
    }
    if (next.length < 6) {
      openInfo("Za krótkie hasło", "Nowe hasło musi mieć minimum 6 znaków.");
      return;
    }

    setBusyPassword(true);
    try {
      const ok = await reauth();
      if (!ok) return;

      await updatePassword(user, next);
      setNewPassword("");
      openInfo("Gotowe ✅", "Hasło zostało zmienione.");
    } catch {
      openInfo("Błąd", "Nie udało się zmienić hasła. Spróbuj ponownie.");
    } finally {
      setBusyPassword(false);
    }
  };

  /* Usuwanie konta */
  const openDeleteConfirm = () => {
    setDeleteError("");
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setBusyDelete(true);
    setDeleteError("");

    try {
      // Firebase często wymaga "recent login" — użyjemy tego samego currentPassword.
      const ok = await reauth();
      if (!ok) {
        setBusyDelete(false);
        return;
      }

      try {
        await deleteDoc(doc("users", user.uid));
      } catch {}

      await deleteUser(user);

      setShowDeleteConfirm(false);
      setShowDeleteSuccess(true);
    } catch {
      setDeleteError("Błąd przy usuwaniu konta.");
    } finally {
      setBusyDelete(false);
    }
  };

  /* Render */
  if (loadingInitial) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={{ color: colors.textMuted, marginTop: 10, fontSize: 13 }}>
            Ładuję ustawienia…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={[styles.header, { borderColor: colors.border, backgroundColor: colors.bg }]}>
              <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
                <Ionicons name="chevron-back" size={24} color={colors.text} />
              </Pressable>

              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>Ustawienia</Text>

              <View style={{ width: 24 }} />
            </View>

            <ScrollView
              contentContainerStyle={{
                padding: 16,
                paddingBottom: 32,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Profil */}
              <Section
                title="Profil"
                subtitle="Zarządzaj swoim kontem i zdjęciem."
                colors={colors}
                icon="person-outline"
              >
                <View style={styles.profileTop}>
                  <Image
                    source={{
                      uri: avatar || "https://i.ibb.co/4pDNDk1/avatar-placeholder.png",
                    }}
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: 38,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.bg,
                    }}
                  />

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900" }} numberOfLines={1}>
                      {displayNameState || "Użytkownik"}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                      {authEmail}
                    </Text>

                    <View style={{ marginTop: 10, alignSelf: "flex-start" }}>
                      <PrimaryButton
                        title={uploadingAvatar ? "Wysyłam..." : "Zmień zdjęcie"}
                        onPress={pickAvatar}
                        disabled={uploadingAvatar}
                        colors={colors}
                        loading={uploadingAvatar}
                      />
                    </View>
                  </View>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "900" }}>Zmień nick</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
                  Nick jest publiczny i musi być unikalny.
                </Text>

                <TextInput
                  value={nick}
                  onChangeText={setNick}
                  placeholder="Nowy nick"
                  placeholderTextColor={colors.textMuted}
                  style={[inputStyle, { marginTop: 10 }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />

                <View style={{ marginTop: 12 }}>
                  <PrimaryButton
                    title={savingNick ? "Zapisywanie..." : "Zapisz nick"}
                    onPress={requestNickChange}
                    disabled={savingNick}
                    colors={colors}
                    loading={savingNick}
                  />
                </View>
              </Section>

              {/* Wygląd */}
              <Section title="Wygląd" subtitle="Zmieniaj motyw aplikacji." colors={colors} icon="color-palette-outline">
                <View style={{ marginTop: 2 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    Wybierz motyw — zmiana działa od razu.
                  </Text>
                </View>

                <View style={styles.themeGrid}>
                  {THEMES.map((t) => (
                    <ThemeTile key={t} t={t} active={t === theme} onSelect={() => setTheme(t)} colors={colors} />
                  ))}
                </View>
              </Section>

              {/* Bezpieczeństwo */}
              <Section
                title="Bezpieczeństwo"
                subtitle="Operacje wymagają potwierdzenia hasłem."
                colors={colors}
                icon="shield-checkmark-outline"
              >
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "900" }}>Potwierdź hasłem</Text>

                <TextInput
                  secureTextEntry
                  placeholder="Aktualne hasło"
                  placeholderTextColor={colors.textMuted}
                  style={[inputStyle, { marginTop: 10 }]}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  returnKeyType="next"
                />

                <View style={{ marginTop: 14 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "900" }}>Zmień hasło</Text>

                  <TextInput
                    secureTextEntry
                    placeholder="Nowe hasło"
                    placeholderTextColor={colors.textMuted}
                    style={[inputStyle, { marginTop: 10 }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    returnKeyType="done"
                  />

                  <View style={{ marginTop: 12 }}>
                    <PrimaryButton
                      title={busyPassword ? "Aktualizuję..." : "Zaktualizuj hasło"}
                      onPress={changePassword}
                      disabled={busyPassword}
                      colors={colors}
                      loading={busyPassword}
                    />
                  </View>
                </View>
              </Section>

              {/* Niebezpieczna strefa */}
              <Section
                title="Niebezpieczna strefa"
                subtitle="Usunięcie konta jest nieodwracalne."
                colors={colors}
                icon="warning-outline"
              >
                <PrimaryButton
                  title={busyDelete ? "Usuwam..." : "Usuń konto"}
                  onPress={openDeleteConfirm}
                  disabled={busyDelete}
                  colors={colors}
                  danger
                  loading={busyDelete}
                />

                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>
                  Jeśli usuwanie wymaga “recent login”, użyj pola “Aktualne hasło” w sekcji Bezpieczeństwo.
                </Text>
              </Section>
            </ScrollView>

            {/* MODAL — INFO */}
            <Modal
              visible={showInfoModal}
              transparent
              animationType="fade"
              onRequestClose={() => setShowInfoModal(false)}
            >
              <View style={styles.modalOverlay}>
                <View
                  style={[
                    styles.modalCard,
                    { borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <Text style={{ fontSize: 18, fontWeight: "900", textAlign: "center", color: colors.text }}>
                    {infoTitle}
                  </Text>

                  <Text style={{ fontSize: 14, textAlign: "center", color: colors.textMuted, marginTop: 8 }}>
                    {infoMessage}
                  </Text>

                  <View style={{ marginTop: 16 }}>
                    <PrimaryButton title="OK" onPress={() => setShowInfoModal(false)} colors={colors} />
                  </View>
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
              <View style={styles.modalOverlay}>
                <View
                  style={[
                    styles.modalCard,
                    { borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <Text style={{ fontSize: 18, fontWeight: "900", textAlign: "center", color: colors.text }}>
                    Zatwierdź zmianę nicku
                  </Text>

                  <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14, marginTop: 8 }}>
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

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                    <View style={{ flex: 1 }}>
                      <SecondaryButton
                        title="Anuluj"
                        onPress={() => setShowNickConfirmModal(false)}
                        disabled={savingNick}
                        colors={colors}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton
                        title={savingNick ? "Zapisuję..." : "Tak, zmień"}
                        onPress={performNickChange}
                        disabled={savingNick}
                        colors={colors}
                        loading={savingNick}
                      />
                    </View>
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
              <View style={styles.modalOverlay}>
                <View
                  style={[
                    styles.modalCard,
                    { borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <Text style={{ fontSize: 18, fontWeight: "900", textAlign: "center", color: colors.text }}>
                    Gotowe ✅
                  </Text>

                  <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14, marginTop: 8 }}>
                    Nick został zmieniony.
                  </Text>

                  <View style={{ marginTop: 16 }}>
                    <PrimaryButton title="OK" onPress={() => setShowNickSuccessModal(false)} colors={colors} />
                  </View>
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
              <View style={styles.modalOverlay}>
                <View
                  style={[
                    styles.modalCard,
                    { borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <Text style={{ fontSize: 18, fontWeight: "900", textAlign: "center", color: colors.text }}>
                    Usunięcie konta
                  </Text>

                  <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14, marginTop: 8 }}>
                    Ta operacja jest nieodwracalna.
                  </Text>

                  {!!deleteError && (
                    <Text
                      style={{
                        color: "#b91c1c",
                        marginTop: 10,
                        textAlign: "center",
                        fontSize: 13,
                        fontWeight: "700",
                      }}
                    >
                      {deleteError}
                    </Text>
                  )}

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                    <View style={{ flex: 1 }}>
                      <SecondaryButton
                        title="Anuluj"
                        onPress={() => setShowDeleteConfirm(false)}
                        colors={colors}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <PrimaryButton
                        title={busyDelete ? "Usuwam..." : "Usuń"}
                        onPress={handleConfirmDelete}
                        disabled={busyDelete}
                        colors={colors}
                        danger
                        loading={busyDelete}
                      />
                    </View>
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
              <View style={styles.modalOverlay}>
                <View
                  style={[
                    styles.modalCard,
                    { borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <Text style={{ fontSize: 18, fontWeight: "900", textAlign: "center", color: colors.text }}>
                    Do zobaczenia! 👋
                  </Text>

                  <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: 14, marginTop: 8 }}>
                    Konto zostało usunięte.
                  </Text>

                  <View style={{ marginTop: 16 }}>
                    <PrimaryButton
                      title="OK"
                      onPress={() => {
                        setShowDeleteSuccess(false);
                        router.replace("/login");
                      }}
                      colors={colors}
                    />
                  </View>
                </View>
              </View>
            </Modal>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  section: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  profileTop: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },

  divider: {
    height: 1,
    marginVertical: 14,
  },

  primaryBtn: {
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },

  secondaryBtn: {
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    borderWidth: 1,
  },

  themeGrid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  themeTile: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,

    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "48%",
  },

  themeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },

  themePreview: {
    flexDirection: "row",
    gap: 5,
  },

  previewDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },

  radioPill: {
    width: 40,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    padding: 2,
    justifyContent: "center",
  },

  radioKnob: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },

  modalCard: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
});
