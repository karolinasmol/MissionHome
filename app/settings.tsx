// app/settings.tsx
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
  Theme,
  useTheme,
  useThemeColors,
  THEMES,
  THEME_COLORS_MAP,
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

const BUCKET = "domowe-443e7.firebasestorage.app";

/* MOTYWY -------------------------------------------------- */

const THEME_LABEL: Record<Theme, string> = {
  dark: "Ciemny",
  light: "Jasny",
  pink: "Różowy",
  yellow: "Żółty",
  brown: "Brązowy",
  purple: "Fioletowy",
  blue: "Niebieski",
  green: "Zielony",
};

function ThemeRow({ t, active, onSelect, colors }) {
  const c = THEME_COLORS_MAP[t];

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onSelect}
      style={[
        styles.themeRow,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: colors.bg,
        },
        Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null,
      ]}
    >
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

      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>
          {THEME_LABEL[t]}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Motyw: {t}
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
              transform: [{ translateX: active ? 14 : 0 }],
              borderColor: colors.border,
            },
          ]}
        >
          {active ? (
            <Ionicons size={14} color="#fff" name="checkmark" />
          ) : null}
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
  const [authEmail, setAuthEmail] = useState(auth.currentUser?.email || "brak");
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

  const [showNickTakenModal, setShowNickTakenModal] = useState(false);

  /* Reauth + hasło */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busyPassword, setBusyPassword] = useState(false);

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

  const saveNick = async () => {
    const user = auth.currentUser;
    if (!user) return;

    const trimmed = nick.trim();
    if (!trimmed) {
      setShowNickTakenModal(true);
      return;
    }

    const newLower = trimmed.toLowerCase();
    setSavingNick(true);

    try {
      const q = query(
        collection("users"),
        where("usernameLower", "==", newLower),
        limit(1)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const found = snap.docs[0];
        if (found.id !== user.uid) {
          setShowNickTakenModal(true);
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
    } catch {
      setShowNickTakenModal(true);
    } finally {
      setSavingNick(false);
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

    if (!newPassword.trim()) return;

    setBusyPassword(true);
    try {
      const ok = await reauth();
      if (!ok) {
        setBusyPassword(false);
        return;
      }

      await updatePassword(user, newPassword.trim());
      setNewPassword("");
    } catch {}
    setBusyPassword(false);
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

  if (loadingInitial) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32,
          width: "100%",
          maxWidth: 900,
          alignSelf: Platform.OS === "web" ? "center" : "stretch",
        }}
      >
        {/* HEADER */}
        <View
          style={{ flexDirection: "row", marginBottom: 18, alignItems: "center" }}
        >
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
          }}
        >
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
            >
              Avatar
            </Text>

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

          {/* Obecne dane */}
          <View
            style={{
              marginTop: 12,
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 15,
                fontWeight: "700",
                marginTop: 2,
              }}
            >
              {displayNameState}
            </Text>
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
              onPress={saveNick}
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
            padding: 14,
            marginBottom: 14,
          }}
        >
          <Text style={labelStyle}>Wygląd</Text>
          <Text style={[mutedStyle, { marginTop: 4 }]}>
            Zmieniaj motyw aplikacji.
          </Text>

          <View style={{ marginTop: 12 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
              Motywy
            </Text>
            <Text style={[mutedStyle, { marginTop: 2 }]}>
              Wybierz jeden z dostępnych motywów
            </Text>
          </View>

          <View style={{ marginTop: 12, gap: 10 }}>
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
            Operacje wymagają podania hasła.
          </Text>

          {/* hasło */}
          <TextInput
            secureTextEntry
            placeholder="Aktualne hasło"
            placeholderTextColor={colors.textMuted}
            style={inputStyle}
            value={currentPassword}
            onChangeText={setCurrentPassword}
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
              onChangeText={setNewPassword}
            />

            <TouchableOpacity
              onPress={changePassword}
              disabled={busyPassword}
              style={{
                ...smallBtnBase,
                marginTop: 12,
                backgroundColor: colors.accent,
              }}
            >
              <Text style={{ fontWeight: "800", color: "#022c22" }}>
                {busyPassword ? "Aktualizuję..." : "Zaktualizuj hasło"}
              </Text>
            </TouchableOpacity>
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
            onPress={openDeleteConfirm}
            disabled={busyDelete}
            style={{
              ...smallBtnBase,
              marginTop: 12,
              backgroundColor: "#7f1d1d",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Usuń konto</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* MODAL — NICK ZAJĘTY */}
      <Modal
        visible={showNickTakenModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNickTakenModal(false)}
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
              Ten nick jest zajęty
            </Text>

            <Text
              style={{
                fontSize: 14,
                textAlign: "center",
                color: colors.textMuted,
              }}
            >
              Wybierz proszę inną nazwę użytkownika.
            </Text>

            <TouchableOpacity
              onPress={() => setShowNickTakenModal(false)}
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

            <Text
              style={{ color: colors.textMuted, textAlign: "center", fontSize: 14 }}
            >
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

            <Text
              style={{ color: colors.textMuted, textAlign: "center", fontSize: 14 }}
            >
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
  );
}

/* STYLES -------------------------------------------------- */

const styles = StyleSheet.create({
  themeRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  themePreview: { flexDirection: "row", gap: 6 },
  previewDot: {
    width: 14,
    height: 14,
    borderRadius: 6,
    borderWidth: 1,
  },
  radioPill: {
    width: 44,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    padding: 3,
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
});

