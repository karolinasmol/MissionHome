// app/login.web.tsx

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Pressable,
  Platform,
  Image,
  Modal,
  Linking,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/Ionicons";
import {
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
} from "firebase/auth";

import { auth, db } from "../src/firebase/firebase";
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
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";

/* =========================
   Stałe
   ========================= */
const ERROR_COLOR = "#dc2626";

/* ========= Debug / Alert wrapper ========= */
const DEBUG = true;
const dbg = (...a: any[]) => DEBUG && console.log("[login.web]", ...a);

/** Bezpieczny wrapper na alert – działa zarówno na web, jak i natywie */
const showAlert = (title: string, message: string) => {
  console.log("[login.web][ALERT]", title, message);

  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(`${title}\n\n${message}`);
      } else {
        console.warn("[login.web] window.alert nie jest dostępny");
      }
    } catch (e) {
      console.error("[login.web] błąd przy window.alert", e);
    }
  } else {
    Alert.alert(title, message);
  }
};

function isProbablyEmail(val: string) {
  return typeof val === "string" && /@/.test(val);
}

type Preferred2FAMethod = "auth_app" | "sms";

export default function LoginScreen() {
  const { colors, theme } = useThemeColors();
  const isDark = theme === "dark";

  const { width } = useWindowDimensions();
  const router = useRouter();

  const [email, setEmail] = useState(""); // e-mail LUB nick
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [userForVerification, setUserForVerification] = useState<any>(null);

  const passwordRef = useRef<TextInput | null>(null);

  // Modal „Potwierdź e-mail”
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [verifyInfo, setVerifyInfo] = useState("");

  // 2FA – tylko wizualny hint z Firestore (UI)
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [phone, setPhone] = useState("");

  // Błąd logowania
  const [loginError, setLoginError] = useState("");
  const [showLoginErrorModal, setShowLoginErrorModal] = useState(false);

  // Stan ładowania przy logowaniu
  const [loggingIn, setLoggingIn] = useState(false);

  /** resolveLoginEmail – e-mail LUB nick => e-mail */
  const resolveLoginEmail = async (identifierRaw: string): Promise<string> => {
    const identifier = (identifierRaw || "").trim();
    if (!identifier) {
      throw new Error("Podaj e-mail lub nazwę użytkownika.");
    }

    if (isProbablyEmail(identifier)) {
      return identifier.toLowerCase();
    }

    // traktujemy to jako nick
    const nickLower = identifier.toLowerCase();
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

  // WEB: kolor tła + ukrycie scroll – spójnie z colors.bg
  useEffect(() => {
    if (Platform.OS === "web") {
      const prev = document.body.style.backgroundColor;
      document.body.style.backgroundColor = colors.bg || "#000";

      const old = document.getElementById("hide-scrollbars-login");
      if (old) old.remove();

      const style = document.createElement("style");
      style.id = "hide-scrollbars-login";
      style.innerHTML = `
        html, body { scrollbar-width: none; -ms-overflow-style: none; }
        html::-webkit-scrollbar, body::-webkit-scrollbar, *::-webkit-scrollbar {
          width: 0 !important; height: 0 !important;
        }
      `;
      document.head.appendChild(style);
      return () => {
        document.body.style.backgroundColor = prev;
        style.remove();
      };
    }
  }, [colors.bg]);

  // zapamiętane dane
  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem("savedEmail");
        const savedPassword = await AsyncStorage.getItem("savedPassword");
        if (savedEmail && savedPassword) {
          setEmail(savedEmail);
          setPassword(savedPassword);
          setRememberMe(true);
        }
      } catch {
        // ignore
      }
    };
    loadSavedCredentials();
  }, []);

  // ====== UTYLKA: zapewnij kanoniczny profil users/{uid} ======
  const ensureUserProfile = async (user: any) => {
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

      if (!snap.exists()) {
        // Tworzymy profil KANONICZNIE pod users/{uid}
        await setDoc(
          userRef,
          {
            ...baseData,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        // Tylko aktualizacja podstawowych pól, bez nadpisywania innych rzeczy
        await setDoc(userRef, baseData, { merge: true });
      }
    } catch (e: any) {
      dbg("ensureUserProfile error:", e?.message || e);
    }
  };

  // obsługa wyniku po redirect (Google/Facebook)
  useEffect(() => {
    (async () => {
      try {
        const res = await getRedirectResult(auth);
        if (res?.user) {
          try {
            // Upewniamy się, że powstaje/istnieje users/{uid}, a nie losowe ID
            await ensureUserProfile(res.user);

            const docSnap = await getDoc(doc(db, "users", res.user.uid));
            if (docSnap.exists()) {
              const { displayName } = docSnap.data() || {};
              if (displayName) res.user.displayName = displayName;
            }
          } catch (e: any) {
            dbg("getRedirectResult profile hydrate error:", e?.message || e);
          }
          router.replace("/");
        }
      } catch (e: any) {
        dbg("getRedirectResult error:", e?.message || e);
      }
    })();
  }, []);

  // hint 2FA (tylko wizualny) – na podstawie identyfikatora (mail/nick)
  useEffect(() => {
    let active = true;
    const ident = (email || "").trim();
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

          if ((data as any).phone2FA) {
            setPhone(String((data as any).phone2FA));
          } else {
            setPhone("");
          }
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
  }, [email]);

  // ====== RESET HASŁA (mail LUB nick) ======
  const handleForgotPassword = async () => {
    dbg("handleForgotPassword CLICK", { rawEmail: email });

    const ident = (email || "").trim();
    if (!ident) {
      dbg("handleForgotPassword -> brak identyfikatora");
      showAlert(
        "Reset hasła",
        "Podaj swój adres e-mail (lub nazwę użytkownika) powyżej, a potem kliknij ponownie."
      );
      return;
    }

    let emailTrim = ident;
    if (!isProbablyEmail(emailTrim)) {
      dbg(
        "handleForgotPassword -> wygląda na NICK, próbuję resolveLoginEmail",
        ident
      );
      try {
        emailTrim = await resolveLoginEmail(ident);
        dbg("handleForgotPassword -> resolveLoginEmail OK", emailTrim);
      } catch (e: any) {
        console.warn(
          "[login.web] handleForgotPassword -> resolveLoginEmail ERROR",
          e?.message || e
        );
        showAlert(
          "Reset hasła",
          e?.message ||
            "Najpierw podaj e-mail albo zaloguj się na web i sprawdź e-mail w profilu."
        );
        return;
      }
    } else {
      dbg("handleForgotPassword -> wygląda na e-mail", emailTrim);
    }

    try {
      dbg("handleForgotPassword -> sendPasswordResetEmail START", emailTrim);
      await sendPasswordResetEmail(auth, emailTrim);
      dbg("handleForgotPassword -> sendPasswordResetEmail OK");
      showAlert(
        "Sprawdź skrzynkę",
        `Wysłaliśmy link do resetu hasła na ${emailTrim}.`
      );
    } catch (e: any) {
      console.error(
        "[login.web] handleForgotPassword -> sendPasswordResetEmail ERROR",
        e?.code,
        e?.message || e
      );
      const map: Record<string, string> = {
        "auth/user-not-found": "Konto z tym adresem nie istnieje.",
        "auth/invalid-email": "Nieprawidłowy adres e-mail.",
        "auth/too-many-requests": "Za dużo prób. Spróbuj później.",
      };
      showAlert(
        "Reset hasła",
        map[e?.code] || e?.message || "Nie udało się wysłać maila."
      );
    }
  };

  // === FINISH LOGIN PROFILE ===
  const finishLoginProfile = async (user: any) => {
    try {
      if (!user) {
        showAlert("Błąd", "Brak danych użytkownika.");
        return;
      }

      // KLUCZOWE: upewniamy się, że profil jest zawsze pod users/{uid}
      await ensureUserProfile(user);

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data = snap.data() || {};
          if ((data as any).displayName) {
            user.displayName = (data as any).displayName;
          }
        }
      } catch (e: any) {
        dbg("finishLoginProfile Firestore error:", e?.message || e);
      }

      router.replace("/");
    } catch (e: any) {
      dbg("finishLoginProfile error:", e?.message || e);
      router.replace("/");
    }
  };

  const handleLogin = async () => {
    setLoginError("");
    setShowLoginErrorModal(false);

    const trimmedEmail = (email || "").trim();
    if (!trimmedEmail) {
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
      const loginEmail = await resolveLoginEmail(trimmedEmail);

      const { user } = await signInWithEmailAndPassword(
        auth,
        loginEmail,
        password
      );

      if (!user.emailVerified) {
        setUserForVerification(user);
        setVerifyInfo(user.email || "");
        setVerifyModalVisible(true);
        return;
      }

      if (rememberMe) {
        await AsyncStorage.setItem("savedEmail", trimmedEmail); // może być nick lub mail
        await AsyncStorage.setItem("savedPassword", password);
      } else {
        await AsyncStorage.removeItem("savedEmail");
        await AsyncStorage.removeItem("savedPassword");
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

  // Google sign-in
  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      await finishLoginProfile(auth.currentUser);
    } catch (error: any) {
      if (
        error?.code === "auth/popup-blocked" ||
        error?.code === "auth/popup-closed-by-user" ||
        error?.code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          const provider = new GoogleAuthProvider();
          await signInWithRedirect(auth, provider);
          return;
        } catch (e: any) {
          showAlert("Google Sign-In", e.message);
        }
      } else {
        showAlert("Google Sign-In", error.message);
      }
    }
  };

  // Facebook sign-in
  const handleFacebookLogin = async () => {
    try {
      const provider = new FacebookAuthProvider();
      await signInWithPopup(auth, provider);
      await finishLoginProfile(auth.currentUser);
    } catch (error: any) {
      if (
        error?.code === "auth/popup-blocked" ||
        error?.code === "auth/popup-closed-by-user" ||
        error?.code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          const provider = new FacebookAuthProvider();
          await signInWithRedirect(auth, provider);
          return;
        } catch (e: any) {
          showAlert("Facebook Login", e.message);
        }
      } else {
        showAlert("Facebook Login", error.message);
      }
    }
  };

  const resendVerificationEmail = async () => {
    if (!userForVerification) {
      showAlert("Błąd", "Najpierw spróbuj się zalogować.");
      return;
    }
    try {
      await sendEmailVerification(userForVerification);
      setVerifyInfo("Wysłano ponownie e-mail weryfikacyjny.");
    } catch (error: any) {
      showAlert("Błąd", "Nie udało się wysłać e-maila. Spróbuj później.");
    }
  };

  const inputBg = isDark ? "#111827" : "#E5EDF7"; // spokojne tło pól jak w rejestracji
  const styles = useMemo(() => getStyles(colors, width), [colors, width]);
  const googleLogo = require("../src/assets/google_g.png");

  return (
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
      <View style={styles.row}>
        <View style={styles.gutter} />
        <View style={styles.center}>
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text
              style={[
                styles.headerTitle,
                { color: colors.text, textAlign: "center" },
              ]}
            >
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
            <Text
              style={[
                styles.label,
                { color: colors.textMuted || colors.text },
              ]}
            >
              Email lub nazwa użytkownika
            </Text>
            <TextInput
              placeholder="np. jan.kowalski@email.com lub janek123"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (loginError) setLoginError("");
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[
                styles.input,
                {
                  borderColor: loginError ? ERROR_COLOR : colors.border,
                  color: "#000000", // <<< CZARNY TEKST
                  backgroundColor: inputBg,
                },
              ]}
              placeholderTextColor={colors.textMuted}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordRef.current?.focus?.()}
            />

            {/* Telefon (wizualny hint, 2FA on) */}
            {twoFAEnabled && (
              <>
                <Text
                  style={[
                    styles.label,
                    { color: colors.textMuted || colors.text },
                  ]}
                >
                  Telefon (2FA)
                </Text>
                <TextInput
                  placeholder="np. +48 600 000 000"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  style={[
                    styles.input,
                    {
                      borderColor: colors.border,
                      color: "#000000", // <<< CZARNY TEKST
                      backgroundColor: inputBg,
                    },
                  ]}
                  placeholderTextColor={colors.textMuted}
                />
              </>
            )}

            {/* Password */}
            <Text
              style={[
                styles.label,
                { color: colors.textMuted || colors.text },
              ]}
            >
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
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (loginError) setLoginError("");
                }}
                secureTextEntry={!showPassword}
                style={[styles.passwordInput, { color: "#000000" }]} // <<< CZARNY TEKST
                placeholderTextColor={colors.textMuted}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)}>
                <Icon
                  name={showPassword ? "eye-off" : "eye"}
                  size={22}
                  color={colors.textMuted || colors.text}
                />
              </TouchableOpacity>
            </View>

            {/* IN-LINE komunikat błędu logowania */}
            {loginError ? (
              <Text style={styles.loginErrorText}>{loginError}</Text>
            ) : null}

            {/* Remember me */}
            <Pressable
              style={styles.rememberRow}
              onPress={() => setRememberMe(!rememberMe)}
            >
              <Icon
                name={rememberMe ? "checkbox" : "square-outline"}
                size={20}
                color={colors.accent}
              />
              <Text
                style={[
                  styles.rememberText,
                  { color: colors.text || "#000" },
                ]}
              >
                {" "}
                Pamiętaj mnie
              </Text>
            </Pressable>

            {/* Forgot password */}
            <TouchableOpacity
              onPress={handleForgotPassword}
              style={styles.forgotLink}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.forgotText,
                  { color: colors.accent || colors.text },
                ]}
              >
                Nie pamiętasz hasła?
              </Text>
            </TouchableOpacity>

            {/* CTA login */}
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
              <Text style={styles.ctaText}>
                {loggingIn ? "Logowanie…" : "Zaloguj się"}
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.socialWrap}>
              <View style={styles.hr} />
              <Text
                style={[
                  styles.orText,
                  { color: colors.textMuted || colors.text },
                ]}
              >
                lub
              </Text>
              <View style={styles.hr} />
            </View>

            {/* Google */}
            <TouchableOpacity
              onPress={handleGoogleLogin}
              style={styles.socialBtnGoogle}
              activeOpacity={0.9}
            >
              <Image
                source={googleLogo}
                style={{ width: 20, height: 20, marginRight: 10 }}
              />
              <Text style={styles.socialGoogleText}>
                Kontynuuj poprzez Google
              </Text>
            </TouchableOpacity>

            {/* Facebook */}
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

            {/* Resend verify (link także poza modalem) */}
            {userForVerification && (
              <TouchableOpacity
                onPress={resendVerificationEmail}
                style={styles.resendEmailButton}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.resendEmailText,
                    { color: colors.accent || colors.text },
                  ]}
                >
                  Mail nie dotarł? Wyślij ponownie
                </Text>
              </TouchableOpacity>
            )}

            {/* Register */}
            <TouchableOpacity
              onPress={() => router.push("/register")}
              style={styles.registerLink}
            >
              <Text
                style={[
                  styles.linkText,
                  { color: colors.text || "#000" },
                ]}
              >
                Nie masz konta?{" "}
                <Text
                  style={[
                    styles.linkHighlight,
                    { color: colors.accent || colors.text },
                  ]}
                >
                  Zarejestruj się!
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.gutter} />
      </View>

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
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.verifyTitle,
                { color: colors.text || "#000" },
              ]}
            >
              Potwierdź e-mail
            </Text>

            <Text
              style={[
                styles.verifyText,
                { color: colors.textMuted || colors.text },
              ]}
            >
              Najpierw potwierdź swój adres e-mail
              {verifyInfo && verifyInfo.includes("@")
                ? ` (${verifyInfo})`
                : ""}
              .
            </Text>

            {!!verifyInfo && !verifyInfo.includes("@") && (
              <Text
                style={[
                  styles.verifyHint,
                  { color: colors.textMuted || colors.text },
                ]}
              >
                {verifyInfo}
              </Text>
            )}

            <View style={styles.verifyButtonsRow}>
              <TouchableOpacity
                onPress={resendVerificationEmail}
                style={styles.verifyBtnGhost}
                activeOpacity={0.9}
              >
                <Text
                  style={[
                    styles.verifyBtnGhostText,
                    { color: colors.text || "#000" },
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
                style={styles.verifyBtnPrimary}
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
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.verifyTitle,
                { color: colors.text || "#000" },
              ]}
            >
              Błąd logowania
            </Text>
            <Text
              style={[
                styles.verifyText,
                { color: ERROR_COLOR },
              ]}
            >
              {loginError ||
                "Nieprawidłowy e-mail / nazwa użytkownika lub hasło."}
            </Text>

            <View
              style={[
                styles.verifyButtonsRow,
                { justifyContent: "center", gap: 0 },
              ]}
            >
              <TouchableOpacity
                onPress={() => setShowLoginErrorModal(false)}
                style={[styles.verifyBtnPrimary, { paddingHorizontal: 24 }]}
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
const getStyles = (colors: any, width: number) => {
  const isNarrow = width <= 768;

  return StyleSheet.create({
    page: {
      flex: 1,
      paddingVertical: isNarrow ? 12 : 0,
    },
    row: { flex: 1, flexDirection: "row", width: "100%" },
    gutter: { flexGrow: 1, flexBasis: 0 },
    center: {
      width: "100%",
      maxWidth: 560,
      paddingHorizontal: isNarrow ? 12 : 14,
      justifyContent: isNarrow ? "flex-start" : "center",
    },

    header: {
      marginTop: isNarrow ? 16 : 28,
      marginBottom: isNarrow ? 10 : 12,
      padding: isNarrow ? 10 : 12,
      borderRadius: 10,
      borderWidth: 1,
    },
    headerTitle: { fontSize: 18, fontWeight: "800" },

    card: {
      padding: isNarrow ? 14 : 16,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: isNarrow ? 18 : 24,
    },

    label: { fontSize: 12, fontWeight: "800", marginBottom: 6, opacity: 0.9 },

    input: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginBottom: 14,
    },

    passwordWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    passwordInput: { flex: 1, paddingVertical: 10 },

    loginErrorText: {
      color: ERROR_COLOR,
      fontSize: 12,
      marginBottom: 10,
      fontWeight: "600",
    },

    rememberRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    rememberText: { fontSize: 14, fontWeight: "700" },

    forgotLink: { alignSelf: "flex-end", marginBottom: 12 },
    forgotText: {
      fontSize: 13,
      fontWeight: "800",
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
      fontWeight: "700",
    },

    resendEmailButton: { marginTop: 4, marginBottom: 16, alignItems: "center" },
    resendEmailText: {
      fontSize: 14,
      fontWeight: "700",
      textDecorationLine: "underline",
    },

    registerLink: { alignItems: "center", marginTop: 6 },
    linkText: { fontSize: 14, fontWeight: "700" },
    linkHighlight: { fontWeight: "800" },

    socialWrap: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginVertical: 8,
    },
    hr: {
      height: 1,
      flex: 1,
      backgroundColor: colors.border,
    },
    orText: { fontSize: 12, fontWeight: "800" },

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
    socialGoogleText: { color: "#111", fontWeight: "800", fontSize: 14 },

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
    socialFacebookText: { color: "#fff", fontWeight: "800", fontSize: 14 },

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
      alignSelf: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
    verifyTitle: {
      fontSize: 18,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 6,
    },
    verifyText: {
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 8,
    },
    verifyHint: {
      fontSize: 12,
      textAlign: "center",
      opacity: 0.9,
      marginBottom: 10,
    },
    verifyButtonsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 10,
    },
    verifyBtnGhost: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.border,
    },
    verifyBtnGhostText: {
      fontWeight: "800",
    },
    verifyBtnGray: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: "#6b7280",
    },
    verifyBtnPrimary: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.accent,
      marginTop: 8,
    },
    verifyBtnSolidText: {
      fontWeight: "800",
      color: "#fff",
    },
  });
};

// app/login.web.tsx
