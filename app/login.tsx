import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Linking,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";

import { auth, db } from "../src/firebase/firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "firebase/auth";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

const ERROR_COLOR = "#dc2626";

/* --------------------------------------------------------
   🔥 TU JEST CAŁA MAGIA — tworzymy dokument USERS/{UID}
--------------------------------------------------------- */
async function ensureUserDoc(user: any) {
  if (!user?.uid) return;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // tylko to, co backend oczekuje
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || null,
      createdAt: serverTimestamp(),

      // wymagane przez daily challenges:
      lastOfferDay: null,
      lastChallengeModalAt: null,
      lastAcceptedAt: {},
    });
  }
}

export default function LoginNativeScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [verifyInfo, setVerifyInfo] = useState("");
  const userForVerificationRef = useRef<any>(null);

  const passwordRef = useRef<TextInput | null>(null);

  const styles = useMemo(() => getStyles(colors), [colors]);

  /* --------------------------------------------------------
     🔥 LOGIN
  --------------------------------------------------------- */
  const handleLogin = async () => {
    setLoginError("");

    if (!identifier.trim()) {
      setLoginError("Podaj e-mail.");
      Alert.alert("Błąd", "Podaj e-mail.");
      return;
    }

    if (!password) {
      setLoginError("Podaj hasło.");
      Alert.alert("Błąd", "Podaj hasło.");
      return;
    }

    const email = identifier.trim().toLowerCase();

    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);

      // 🔥 tu powstaje dokument USERS/{uid}
      await ensureUserDoc(user);

      if (!user.emailVerified) {
        userForVerificationRef.current = user;
        setVerifyInfo(user.email || email);
        setVerifyModalVisible(true);
        return;
      }

      router.replace("/");
    } catch (error: any) {
      const map: Record<string, string> = {
        "auth/wrong-password": "Nieprawidłowe hasło.",
        "auth/invalid-credential": "Nieprawidłowy login lub hasło.",
        "auth/user-not-found": "Konto nie istnieje.",
        "auth/invalid-email": "Nieprawidłowy e-mail.",
        "auth/too-many-requests": "Za dużo prób logowania.",
      };

      const msg = map[error?.code] || "Nieprawidłowy login lub hasło.";
      setLoginError(msg);
      Alert.alert("Błąd logowania", msg);
    }
  };

  const handleForgotPassword = async () => {
    if (!identifier.trim()) {
      Alert.alert("Reset hasła", "Podaj e-mail powyżej.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, identifier.trim().toLowerCase());
      Alert.alert("Sprawdź skrzynkę", "Wysłaliśmy link do resetu hasła.");
    } catch (e: any) {
      Alert.alert("Reset hasła", "Nie udało się wysłać maila.");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

        <Text style={[styles.title, { color: colors.text }]}>MissionHome</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Zaloguj się, aby kontynuować
        </Text>

        {/* EMAIL */}
        <Text style={[styles.label, { color: colors.textMuted }]}>Email</Text>
        <View style={[styles.inputWrapper, { borderColor: loginError ? ERROR_COLOR : colors.border }]}>
          <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
          <TextInput
            placeholder="np. jan@email.com"
            placeholderTextColor={colors.textMuted}
            value={identifier}
            onChangeText={(v) => {
              setIdentifier(v);
              if (loginError) setLoginError("");
            }}
            style={[styles.input, { color: colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus?.()}
          />
        </View>

        {/* PASSWORD */}
        <Text style={[styles.label, { color: colors.textMuted }]}>Hasło</Text>
        <View style={[styles.inputWrapper, { borderColor: loginError ? ERROR_COLOR : colors.border }]}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <TextInput
            ref={passwordRef as any}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (loginError) setLoginError("");
            }}
            style={[styles.input, { color: colors.text }]}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={18}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        </View>

        {loginError ? <Text style={styles.loginErrorText}>{loginError}</Text> : null}

        {/* RESET */}
        <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotButton}>
          <Text style={[styles.forgotText, { color: colors.accent }]}>Nie pamiętasz hasła?</Text>
        </TouchableOpacity>

        {/* LOGIN */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.accent }]}
          onPress={handleLogin}
        >
          <Text style={styles.buttonText}>Zaloguj się</Text>
        </TouchableOpacity>

      </View>

      {/* VERIFY EMAIL MODAL */}
      <Modal visible={verifyModalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.verifyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>

            <Text style={[styles.verifyTitle, { color: colors.text }]}>Potwierdź e-mail</Text>
            <Text style={[styles.verifyText, { color: colors.textMuted }]}>
              Najpierw potwierdź adres e-mail {verifyInfo}.
            </Text>

            <TouchableOpacity
              onPress={async () => {
                await sendEmailVerification(userForVerificationRef.current);
                Alert.alert("Wysłano", "Sprawdź skrzynkę.");
              }}
              style={[styles.verifyBtnPrimary, { backgroundColor: colors.accent }]}
            >
              <Text style={[styles.verifyBtnSolidText, { color: "#022c22" }]}>
                Wyślij ponownie
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                await signOut(auth);
                setVerifyModalVisible(false);
              }}
              style={[styles.verifyBtnGray]}
            >
              <Text style={styles.verifyBtnSolidText}>OK</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
    card: { width: "100%", maxWidth: 420, padding: 24, borderRadius: 20, borderWidth: 1 },
    title: { fontSize: 28, fontWeight: "800", textAlign: "center" },
    subtitle: { fontSize: 14, textAlign: "center", marginTop: 6, marginBottom: 18 },
    label: { fontSize: 12, fontWeight: "800", marginBottom: 6 },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      marginBottom: 12,
      gap: 8,
    },
    input: { flex: 1, fontSize: 15 },
    loginErrorText: {
      color: ERROR_COLOR,
      fontSize: 12,
      marginTop: -4,
      marginBottom: 10,
      fontWeight: "700",
    },
    forgotButton: { alignSelf: "flex-end", marginBottom: 10 },
    forgotText: { fontSize: 13, fontWeight: "800" },
    button: { paddingVertical: 12, borderRadius: 999, alignItems: "center", marginTop: 8 },
    buttonText: { color: "#022c22", fontSize: 16, fontWeight: "900" },

    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    verifyCard: {
      width: "100%",
      maxWidth: 520,
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 18,
      paddingHorizontal: 16,
    },
    verifyTitle: { fontSize: 18, fontWeight: "900", textAlign: "center", marginBottom: 6 },
    verifyText: { fontSize: 14, textAlign: "center", marginBottom: 12 },
    verifyBtnPrimary: {
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
      marginBottom: 10,
    },
    verifyBtnGray: {
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: "#6b7280",
      alignItems: "center",
    },
    verifyBtnSolidText: { color: "#fff", fontWeight: "900" },
  });
