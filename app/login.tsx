// app/login.tsx

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
  Pressable,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";

import { auth, db } from "../src/firebase/firebase";
import {
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";

import {
  doc,
  getDoc,
  query,
  collection,
  where,
  limit,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

/* =========================
   Stałe
   ========================= */
const ERROR_COLOR = "#dc2626";
const DEBUG = true;
const dbg = (...a: any[]) => DEBUG && console.log("[login.native]", ...a);

const showAlert = (title: string, message: string) => {
  try {
    Alert.alert(title, message);
  } catch {
    console.log("[login.native][ALERT]", title, message);
  }
};

function isProbablyEmail(val: string) {
  return typeof val === "string" && /@/.test(val);
}

/* --------------------------------------------------------
   🔥 KANONICZNY PROFIL users/{uid} — zawsze
--------------------------------------------------------- */
async function ensureUserProfile(user: any) {
  if (!user?.uid) return;

  const userRef = doc(db, "users", user.uid);

  try {
    const snap = await getDoc(userRef);

    const baseData: any = {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      updatedAt: serverTimestamp(),
    };

    const requiredDailyFields: any = {
      lastOfferDay: null,
      lastChallengeModalAt: null,
      lastAcceptedAt: {},
    };

    if (!snap.exists()) {
      await setDoc(
        userRef,
        {
          ...baseData,
          ...requiredDailyFields,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await setDoc(userRef, baseData, { merge: true });
    }
  } catch (e: any) {
    dbg("ensureUserProfile error:", e?.message || e);
  }
}

export default function LoginNativeScreen() {
  const router = useRouter();
  const { colors, theme } = useThemeColors();
  const isDark = theme === "dark";

  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [phone, setPhone] = useState("");

  const [loginError, setLoginError] = useState("");
  const [showLoginErrorModal, setShowLoginErrorModal] = useState(false);

  const [loggingIn, setLoggingIn] = useState(false);

  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [verifyInfo, setVerifyInfo] = useState("");
  const userForVerificationRef = useRef<any>(null);

  // ✅ Modal „Witaj w MissionHome”
  const [welcomeModalVisible, setWelcomeModalVisible] = useState(true);

  const passwordRef = useRef<TextInput | null>(null);

  /** ✅ Kolory inputów (fix białej czcionki na jasnym tle) */
  const inputBg = isDark ? "#111827" : "#E5EDF7";
  const inputTextColor = isDark ? "#ffffff" : "#000000";

  /** resolveLoginEmail – e-mail LUB nick => e-mail */
  const resolveLoginEmail = async (identifierRaw: string): Promise<string> => {
    const ident = (identifierRaw || "").trim();
    if (!ident) throw new Error("Podaj e-mail lub nazwę użytkownika.");

    if (isProbablyEmail(ident)) return ident.toLowerCase();

    const nickLower = ident.toLowerCase();
    const qy = query(
      collection(db, "users"),
      where("usernameLower", "==", nickLower),
      limit(1)
    );

    const snap = await getDocs(qy);

    if (snap.empty) {
      throw new Error("Nie znaleziono konta o takiej nazwie użytkownika.");
    }

    const data = snap.docs[0].data() || {};
    if (!data.email) {
      throw new Error(
        "To konto nie ma przypisanego adresu e-mail. Skontaktuj się z supportem."
      );
    }

    return String(data.email).toLowerCase();
  };

  /** finishLoginProfile */
  const finishLoginProfile = async (user: any) => {
    try {
      await ensureUserProfile(user);

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data() || {};
          if ((data as any).displayName) {
            user.displayName = (data as any).displayName;
          }
        }
      } catch {}

      router.replace("/");
    } catch (e: any) {
      dbg("finishLoginProfile error:", e?.message || e);
      router.replace("/");
    }
  };

  // zapamiętane dane
  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const savedIdent = await AsyncStorage.getItem("savedLoginIdentifier");
        const savedPassword = await AsyncStorage.getItem("savedLoginPassword");
        if (savedIdent && savedPassword) {
          setIdentifier(savedIdent);
          setPassword(savedPassword);
          setRememberMe(true);
        }
      } catch {}
    };
    loadSavedCredentials();
  }, []);

  // hint 2FA
  useEffect(() => {
    let active = true;
    const ident = (identifier || "").trim();

    if (!ident) {
      setTwoFAEnabled(false);
      setPhone("");
      return;
    }

    const t = setTimeout(async () => {
      try {
        let emailForHint: string;

        try {
          emailForHint = await resolveLoginEmail(ident);
        } catch {
          if (active) {
            setTwoFAEnabled(false);
            setPhone("");
          }
          return;
        }

        const qy = query(
          collection(db, "users"),
          where("email", "==", emailForHint),
          limit(1)
        );

        const snap = await getDocs(qy);
        if (!active) return;

        if (!snap.empty) {
          const data = snap.docs[0].data() || {};
          const twoFA = (data as any).twoFA || {};
          const enabled =
            !!twoFA.appEnabled ||
            !!twoFA.smsEnabled ||
            !!(data as any).twoFAEnabled ||
            !!(data as any).twoFactorEnabled ||
            !!(data as any).mfaEnabled;

          setTwoFAEnabled(enabled);

          if ((data as any).phone2FA) setPhone(String((data as any).phone2FA));
          else setPhone("");
        } else {
          setTwoFAEnabled(false);
          setPhone("");
        }
      } catch {
        if (active) {
          setTwoFAEnabled(false);
          setPhone("");
        }
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [identifier]);

  const handleLogin = async () => {
    setLoginError("");
    setShowLoginErrorModal(false);

    const ident = (identifier || "").trim();
    if (!ident) {
      setLoginError("Podaj e-mail lub nazwę użytkownika.");
      setShowLoginErrorModal(true);
      return;
    }
    if (!password) {
      setLoginError("Podaj hasło.");
      setShowLoginErrorModal(true);
      return;
    }

    setLoggingIn(true);

    try {
      const loginEmail = await resolveLoginEmail(ident);

      const { user } = await signInWithEmailAndPassword(
        auth,
        loginEmail,
        password
      );

      if (!user.emailVerified) {
        userForVerificationRef.current = user;
        setVerifyInfo(user.email || loginEmail);
        setVerifyModalVisible(true);
        return;
      }

      if (rememberMe) {
        await AsyncStorage.setItem("savedLoginIdentifier", ident);
        await AsyncStorage.setItem("savedLoginPassword", password);
      } else {
        await AsyncStorage.removeItem("savedLoginIdentifier");
        await AsyncStorage.removeItem("savedLoginPassword");
      }

      await finishLoginProfile(user);
    } catch (error: any) {
      if (error instanceof Error && !(error as any).code) {
        setLoginError(error.message);
        setShowLoginErrorModal(true);
        return;
      }

      const map: Record<string, string> = {
        "auth/wrong-password": "Nieprawidłowe hasło.",
        "auth/invalid-credential":
          "Nieprawidłowe dane logowania. Sprawdź e-mail/nazwę użytkownika i hasło.",
        "auth/user-not-found":
          "Konto o podanych danych nie istnieje. Sprawdź wpis lub załóż konto.",
        "auth/invalid-email": "Nieprawidłowy adres e-mail.",
        "auth/too-many-requests":
          "Za dużo nieudanych prób logowania. Spróbuj ponownie za chwilę.",
      };

      const msg =
        map[error?.code] ||
        "Nieprawidłowy e-mail / nazwa użytkownika lub hasło.";

      setLoginError(msg);
      setShowLoginErrorModal(true);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleForgotPassword = async () => {
    const ident = (identifier || "").trim();
    if (!ident) {
      showAlert(
        "Reset hasła",
        "Podaj swój adres e-mail (lub nazwę użytkownika) powyżej, a potem kliknij ponownie."
      );
      return;
    }

    let emailToReset = ident;

    if (!isProbablyEmail(emailToReset)) {
      try {
        emailToReset = await resolveLoginEmail(ident);
      } catch (e: any) {
        showAlert(
          "Reset hasła",
          e?.message ||
            "Najpierw podaj e-mail albo zaloguj się na web i sprawdź e-mail w profilu."
        );
        return;
      }
    }

    try {
      await sendPasswordResetEmail(auth, emailToReset.toLowerCase());
      showAlert(
        "Sprawdź skrzynkę",
        `Wysłaliśmy link do resetu hasła na ${emailToReset}.`
      );
    } catch (e: any) {
      const map: Record<string, string> = {
        "auth/user-not-found": "Konto z tym adresem nie istnieje.",
        "auth/invalid-email": "Nieprawidłowy adres e-mail.",
        "auth/too-many-requests": "Za dużo prób. Spróbuj później.",
      };
      showAlert("Reset hasła", map[e?.code] || "Nie udało się wysłać maila.");
    }
  };

  const resendVerificationEmail = async () => {
    if (!userForVerificationRef.current) {
      showAlert("Błąd", "Najpierw spróbuj się zalogować.");
      return;
    }
    try {
      await sendEmailVerification(userForVerificationRef.current);
      showAlert("Wysłano", "E-mail weryfikacyjny został wysłany ponownie.");
    } catch {
      showAlert("Błąd", "Nie udało się wysłać e-maila. Spróbuj później.");
    }
  };

  const handleGoogleLogin = () => {
    showAlert(
      "Google Sign-In",
      "Google logowanie na mobile dopniemy później. Teraz loguj się e-mailem 🙂"
    );
  };

  const handleFacebookLogin = () => {
    showAlert(
      "Facebook Login",
      "Facebook logowanie na mobile dopniemy później. Teraz loguj się e-mailem 🙂"
    );
  };

  // ✅ nie pokazuj welcome, gdy inne krytyczne modale są aktywne
  const shouldShowWelcome =
    welcomeModalVisible && !verifyModalVisible && !showLoginErrorModal;

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Zaloguj się
            </Text>
          </View>

          {/* Card */}
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {/* Email / nick */}
            <Text style={[styles.label, { color: colors.textMuted || colors.text }]}>
              Email lub nazwa użytkownika
            </Text>

            <TextInput
              placeholder="np. jan.kowalski@email.com lub janek123"
              placeholderTextColor={colors.textMuted}
              value={identifier}
              onChangeText={(v) => {
                setIdentifier(v);
                if (loginError) setLoginError("");
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.input,
                {
                  borderColor: loginError ? ERROR_COLOR : colors.border,
                  backgroundColor: inputBg,
                  color: inputTextColor,
                },
              ]}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordRef.current?.focus?.()}
            />

            {/* Telefon hint (2FA on) */}
            {twoFAEnabled && (
              <>
                <Text style={[styles.label, { color: colors.textMuted || colors.text }]}>
                  Telefon (2FA)
                </Text>

                <TextInput
                  placeholder="np. +48 600 000 000"
                  placeholderTextColor={colors.textMuted}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  style={[
                    styles.input,
                    {
                      borderColor: colors.border,
                      backgroundColor: inputBg,
                      color: inputTextColor,
                    },
                  ]}
                />
              </>
            )}

            {/* Password */}
            <Text style={[styles.label, { color: colors.textMuted || colors.text }]}>
              Hasło
            </Text>

            <View
              style={[
                styles.passwordWrapper,
                {
                  borderColor: loginError ? ERROR_COLOR : colors.border,
                  backgroundColor: inputBg,
                },
              ]}
            >
              <TextInput
                ref={passwordRef}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (loginError) setLoginError("");
                }}
                secureTextEntry={!showPassword}
                style={[styles.passwordInput, { color: inputTextColor }]}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
              />

              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                activeOpacity={0.8}
              >
                <Icon
                  name={showPassword ? "eye-off" : "eye"}
                  size={22}
                  color={colors.textMuted || colors.text}
                />
              </TouchableOpacity>
            </View>

            {loginError ? (
              <Text style={styles.loginErrorText}>{loginError}</Text>
            ) : null}

            {/* Remember me */}
            <Pressable
              style={styles.rememberRow}
              onPress={() => setRememberMe((v) => !v)}
            >
              <Icon
                name={rememberMe ? "checkbox" : "square-outline"}
                size={20}
                color={colors.accent}
              />
              <Text style={[styles.rememberText, { color: colors.text }]}>
                {" "}
                Pamiętaj mnie
              </Text>
            </Pressable>

            {/* Forgot */}
            <TouchableOpacity
              onPress={handleForgotPassword}
              style={styles.forgotLink}
              activeOpacity={0.7}
            >
              <Text style={[styles.forgotText, { color: colors.accent }]}>
                Nie pamiętasz hasła?
              </Text>
            </TouchableOpacity>

            {/* CTA */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loggingIn}
              style={[
                styles.cta,
                {
                  backgroundColor: colors.accent,
                  opacity: loggingIn ? 0.7 : 1,
                },
              ]}
              activeOpacity={0.9}
            >
              {loggingIn ? (
                <View style={styles.loggingRow}>
                  <ActivityIndicator />
                  <Text style={styles.ctaText}>Logowanie…</Text>
                </View>
              ) : (
                <Text style={styles.ctaText}>Zaloguj się</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.socialWrap}>
              <View style={[styles.hr, { backgroundColor: colors.border }]} />
              <Text
                style={[
                  styles.orText,
                  { color: colors.textMuted || colors.text },
                ]}
              >
                lub
              </Text>
              <View style={[styles.hr, { backgroundColor: colors.border }]} />
            </View>

            {/* Google / FB */}
            <TouchableOpacity
              onPress={handleGoogleLogin}
              style={[styles.socialBtnGoogle, { borderColor: colors.border }]}
              activeOpacity={0.9}
            >
              <Icon name="logo-google" size={18} color="#111" />
              <Text style={styles.socialGoogleText}>
                Kontynuuj poprzez Google
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleFacebookLogin}
              style={styles.socialBtnFacebook}
              activeOpacity={0.9}
            >
              <Icon name="logo-facebook" size={18} color="#fff" />
              <Text style={styles.socialFacebookText}>
                Kontynuuj za pomocą Facebooka
              </Text>
            </TouchableOpacity>

            {/* Register */}
            <TouchableOpacity
              onPress={() => router.push("/register")}
              style={styles.registerLink}
              activeOpacity={0.8}
            >
              <Text style={[styles.linkText, { color: colors.text }]}>
                Nie masz konta?{" "}
                <Text style={[styles.linkHighlight, { color: colors.accent }]}>
                  Zarejestruj się!
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ✅ Welcome modal — FULL + scroll */}
      <Modal
        visible={shouldShowWelcome}
        transparent
        animationType="fade"
        onRequestClose={() => setWelcomeModalVisible(false)}
      >
        <View style={styles.overlay}>
          <View
            style={[
              styles.welcomeCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                maxHeight: "85%",
              },
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 6 }}
            >
              <View
                style={[
                  styles.welcomeBadge,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.05)",
                    borderColor: colors.border,
                  },
                ]}
              >
                <Icon name="sparkles" size={18} color={colors.accent} />
                <Text
                  style={[styles.welcomeBadgeText, { color: colors.text }]}
                >
                  MissionHome
                </Text>
              </View>

              <Text style={[styles.welcomeTitle, { color: colors.text }]}>
                Witaj w MissionHome 🏠🚀
              </Text>

              <Text
                style={[
                  styles.welcomeSubtitle,
                  { color: colors.textMuted || colors.text },
                ]}
              >
                Domowe centrum dowodzenia, które zamienia obowiązki w system misji.
              </Text>

              {/* ✅ Lista feature’ów jak WEB */}
              <View style={styles.welcomeFeatures}>
                <View style={styles.welcomeFeatureRow}>
                  <Icon name="sparkles" size={18} color={colors.accent} />
                  <Text
                    style={[
                      styles.welcomeFeatureText,
                      { color: colors.textMuted || colors.text },
                    ]}
                  >
                    Codziennie dostajesz świeżą dawkę misji - krótkie, konkretne
                    zadania, które domykają dzień bez spiny.
                  </Text>
                </View>

                <View style={styles.welcomeFeatureRow}>
                  <Icon name="people" size={18} color={colors.accent} />
                  <Text
                    style={[
                      styles.welcomeFeatureText,
                      { color: colors.textMuted || colors.text },
                    ]}
                  >
                    Pakiet Rodzinny: wspólny kalendarz, jedna tablica misji i
                    możliwość dodawania zadań sobie nawzajem - dom zaczyna działać
                    jak drużyna.
                  </Text>
                </View>

                <View style={styles.welcomeFeatureRow}>
                  <Icon name="podium" size={18} color={colors.accent} />
                  <Text
                    style={[
                      styles.welcomeFeatureText,
                      { color: colors.textMuted || colors.text },
                    ]}
                  >
                    Rywalizuj w rankingu: punkty za misje, serie dni (streaki) -
                    niech wygra ten, kto naprawdę ogarnia.
                  </Text>
                </View>

                <View style={styles.welcomeFeatureRow}>
                  <Icon name="stats-chart" size={18} color={colors.accent} />
                  <Text
                    style={[
                      styles.welcomeFeatureText,
                      { color: colors.textMuted || colors.text },
                    ]}
                  >
                    Osiągnięcia i statystyki: podgląd progresu, nawyków i wkładu
                    domowników - wiesz kto co robi, bez gadania i bez domysłów.
                  </Text>
                </View>
              </View>

              <Text
                style={[
                  styles.welcomeSubtitle,
                  {
                    color: colors.textMuted || colors.text,
                    marginTop: 2,
                    marginBottom: 12,
                  },
                ]}
              >
                Zarejestruj się i odpal pierwszą misję - potem zdecydujesz, czy
                wchodzisz w Pakiet Rodzinny.
              </Text>

              <View style={styles.welcomeButtonsCol}>
                <TouchableOpacity
                  onPress={() => {
                    setWelcomeModalVisible(false);
                    router.push("/register");
                  }}
                  style={[
                    styles.welcomeBtnPrimary,
                    { backgroundColor: colors.accent },
                  ]}
                  activeOpacity={0.9}
                >
                  <Text style={styles.welcomeBtnPrimaryText}>
                    Zarejestruj się
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setWelcomeModalVisible(false)}
                  style={[
                    styles.welcomeBtnGhost,
                    { borderColor: colors.border },
                  ]}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[
                      styles.welcomeBtnGhostText,
                      { color: colors.text },
                    ]}
                  >
                    Mam już konto
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal „Potwierdź e-mail” */}
      <Modal
        visible={verifyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={async () => {
          try {
            await signOut(auth);
          } catch {}
          setVerifyModalVisible(false);
        }}
      >
        <View style={styles.overlay}>
          <View
            style={[
              styles.verifyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.verifyTitle, { color: colors.text }]}>
              Potwierdź e-mail
            </Text>

            <Text
              style={[
                styles.verifyText,
                { color: colors.textMuted || colors.text },
              ]}
            >
              Najpierw potwierdź swój adres e-mail
              {verifyInfo && verifyInfo.includes("@") ? ` (${verifyInfo})` : ""}.
            </Text>

            <View style={styles.verifyButtonsRow}>
              <TouchableOpacity
                onPress={resendVerificationEmail}
                style={[styles.verifyBtnGhost, { borderColor: colors.border }]}
                activeOpacity={0.9}
              >
                <Text
                  style={[
                    styles.verifyBtnGhostText,
                    { color: colors.text },
                  ]}
                >
                  Wyślij ponownie
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => Linking.openURL("mailto:")}
                style={styles.verifyBtnGray}
                activeOpacity={0.9}
              >
                <Text style={styles.verifyBtnSolidText}>Otwórz skrzynkę</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  try {
                    await signOut(auth);
                  } catch {}
                  setVerifyModalVisible(false);
                }}
                style={[
                  styles.verifyBtnPrimary,
                  { backgroundColor: colors.accent },
                ]}
                activeOpacity={0.9}
              >
                <Text style={styles.verifyBtnSolidText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: błąd logowania */}
      <Modal
        visible={showLoginErrorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLoginErrorModal(false)}
      >
        <View style={styles.overlay}>
          <View
            style={[
              styles.verifyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.verifyTitle, { color: colors.text }]}>
              Błąd logowania
            </Text>

            <Text style={[styles.verifyText, { color: ERROR_COLOR }]}>
              {loginError ||
                "Nieprawidłowy e-mail / nazwa użytkownika lub hasło."}
            </Text>

            <View
              style={[
                styles.verifyButtonsRow,
                { justifyContent: "center" },
              ]}
            >
              <TouchableOpacity
                onPress={() => setShowLoginErrorModal(false)}
                style={[
                  styles.verifyBtnPrimary,
                  { backgroundColor: colors.accent },
                ]}
                activeOpacity={0.9}
              >
                <Text style={styles.verifyBtnSolidText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ================== STYLES ================== */
const getStyles = (colors: any, isDark: boolean) => {
  const inputBg = isDark ? "#111827" : "#E5EDF7";

  return StyleSheet.create({
    page: { flex: 1 },

    scroll: {
      flexGrow: 1,
      paddingHorizontal: 14,
      paddingTop: 20,
      paddingBottom: 32,
      justifyContent: "center",
      alignItems: "center",
    },

    header: {
      width: "100%",
      maxWidth: 560,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { fontSize: 18, fontWeight: "900" },

    card: {
      width: "100%",
      maxWidth: 560,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
    },

    label: {
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 6,
      opacity: 0.9,
    },

    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 14,
      backgroundColor: inputBg,
      fontSize: 14,
      fontWeight: "600",
    },

    passwordWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      backgroundColor: inputBg,
      marginBottom: 8,
    },
    passwordInput: {
      flex: 1,
      paddingVertical: 10,
      fontSize: 14,
      fontWeight: "600",
    },

    loginErrorText: {
      color: ERROR_COLOR,
      fontSize: 12,
      marginBottom: 10,
      fontWeight: "700",
    },

    rememberRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    rememberText: { fontSize: 14, fontWeight: "800" },

    forgotLink: { alignSelf: "flex-end", marginBottom: 12 },
    forgotText: {
      fontSize: 13,
      fontWeight: "900",
      textDecorationLine: "underline",
    },

    cta: {
      paddingVertical: 14,
      borderRadius: 999,
      alignItems: "center",
      marginBottom: 12,
    },
    ctaText: {
      color: "#022c22",
      fontSize: 16,
      fontWeight: "900",
    },

    loggingRow: { flexDirection: "row", alignItems: "center", gap: 10 },

    socialWrap: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginVertical: 8,
    },
    hr: { height: 1, flex: 1 },
    orText: { fontSize: 12, fontWeight: "900" },

    socialBtnGoogle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 999,
      borderWidth: 1,
      marginBottom: 10,
      backgroundColor: "#ffffff",
    },
    socialGoogleText: { color: "#111", fontWeight: "900", fontSize: 14 },

    socialBtnFacebook: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 999,
      backgroundColor: "#1877F2",
      marginBottom: 10,
    },
    socialFacebookText: { color: "#fff", fontWeight: "900", fontSize: 14 },

    registerLink: { alignItems: "center", marginTop: 6 },
    linkText: { fontSize: 14, fontWeight: "800" },
    linkHighlight: { fontWeight: "900" },

    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },

    welcomeCard: {
      width: "100%",
      maxWidth: 560,
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 18,
      paddingHorizontal: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
    },

    welcomeBadge: {
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      marginBottom: 10,
    },

    welcomeBadgeText: { fontWeight: "900", letterSpacing: 0.2 },

    welcomeTitle: {
      fontSize: 20,
      fontWeight: "900",
      textAlign: "center",
      marginBottom: 6,
    },

    welcomeSubtitle: {
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 14,
      fontWeight: "700",
    },

    welcomeFeatures: {
      gap: 10,
      marginBottom: 14,
    },
    welcomeFeatureRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    welcomeFeatureText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "800",
      opacity: 0.95,
    },

    welcomeButtonsCol: { gap: 10 },

    welcomeBtnPrimary: {
      paddingVertical: 12,
      borderRadius: 999,
      alignItems: "center",
    },

    welcomeBtnPrimaryText: {
      color: "#022c22",
      fontSize: 15,
      fontWeight: "900",
    },

    welcomeBtnGhost: {
      paddingVertical: 12,
      borderRadius: 999,
      alignItems: "center",
      borderWidth: 1,
      backgroundColor: "transparent",
    },

    welcomeBtnGhostText: { fontSize: 14, fontWeight: "900" },

    verifyCard: {
      width: "100%",
      maxWidth: 520,
      borderRadius: 14,
      borderWidth: 1,
      paddingVertical: 18,
      paddingHorizontal: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
    },

    verifyTitle: {
      fontSize: 18,
      fontWeight: "900",
      textAlign: "center",
      marginBottom: 6,
    },

    verifyText: {
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 12,
      fontWeight: "700",
    },

    verifyButtonsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 10,
      flexWrap: "wrap",
    },

    verifyBtnGhost: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: "transparent",
      borderWidth: 1,
    },

    verifyBtnGhostText: { fontWeight: "900" },

    verifyBtnGray: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: "#6b7280",
      alignItems: "center",
    },

    verifyBtnPrimary: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      alignItems: "center",
    },

    verifyBtnSolidText: { fontWeight: "900", color: "#fff" },
  });
};
