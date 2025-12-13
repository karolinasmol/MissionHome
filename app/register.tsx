// app/register.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  Switch,
  Linking,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import {
  auth,
  collection,
  doc,
  query,
  where,
  limit,
  getDocs,
  setDoc,
  serverTimestamp,
} from "../src/firebase/firebase.web";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  signOut,
  fetchSignInMethodsForEmail,
} from "firebase/auth";

import { useThemeColors } from "../src/context/ThemeContext";

/* ===========================
   Stałe / kolory / regulamin
   =========================== */

const ERROR_COLOR = "#dc2626";

const TERMS_PDF_URL = "https://mojelicytacje.pl/regulamin.pdf";

const TERMS_PL = `1. POSTANOWIENIA OGÓLNE
1.1. Niniejszy regulamin („Regulamin”) określa zasady korzystania z serwisu Moje Licytacje („Serwis”) oraz aplikacji mobilnej Moje Licytacje, zwanych łącznie „Platformą”.
1.2. Operatorem Platformy jest [nazwa firmy / osoba prowadząca działalność], z siedzibą w [adres], NIP: [NIP], REGON: [REGON], zwany dalej „Operatorem”.
1.3. Kontakt z Operatorem możliwy jest w szczególności pod adresem e-mail: [adres e-mail] lub za pośrednictwem formularza kontaktowego dostępnego w zakładce „Kontakt”.
1.4. Każda osoba korzystająca z Platformy („Użytkownik”) zobowiązana jest do zapoznania się z Regulaminem przed założeniem konta oraz do przestrzegania jego postanowień.
1.5. Warunkiem korzystania z Platformy jest akceptacja Regulaminu. Rejestracja konta oraz korzystanie z Platformy oznacza akceptację wszystkich postanowień Regulaminu.

2. DEFINICJE
2.1. Użytkownik – osoba fizyczna posiadająca pełną zdolność do czynności prawnych, która założyła konto w Platformie.
2.2. Konto – indywidualny panel Użytkownika umożliwiający korzystanie z funkcji Platformy, w szczególności wystawianie oraz udział w aukcjach.
2.3. Aukcja – ogłoszenie z możliwością składania ofert w formie licytacji, organizowane przez Użytkownika – Sprzedającego, dostępne wyłącznie w formule licytacji (brak opcji natychmiastowego zakupu).
2.4. Sprzedający – Użytkownik wystawiający przedmiot w ramach Aukcji.
2.5. Kupujący – Użytkownik składający oferty w Aukcji i wygrywający ją poprzez złożenie najwyższej ważnej oferty.
2.6. Kredyty – wirtualna jednostka rozliczeniowa w Platformie, wykorzystywana do opłacania usług dodatkowych (w szczególności konta Premium) oraz – w zakresie przewidzianym w niniejszym Regulaminie i funkcjach Platformy – do częściowego pokrywania ceny przedmiotów i opłat w ramach Platformy; 1000 (słownie: tysiąc) Kredytów odpowiada wartości rozliczeniowej 1,00 zł (słownie: jeden złoty). Kredyty nie stanowią środka płatniczego w rozumieniu przepisów prawa.
2.7. Konto Premium – płatna usługa dodatkowa dostępna dla Użytkowników, wykupywana odpłatnie (płatność online) lub w oparciu o zgromadzone Kredyty, zapewniająca dodatkowe korzyści opisane w Regulaminie.
2.8. KYC / Weryfikacja bankowa – proces weryfikacji tożsamości Użytkownika oraz jego danych bankowych, przeprowadzany przez Operatora lub podmiot współpracujący.
2.9. Osiągnięcie / odznaka – wirtualne wyróżnienie przyznawane Użytkownikowi za określone działania w Platformie (np. liczba wystawionych aukcji, wygranych licytacji, wysłanych wiadomości), prezentowane m.in. w profilu Użytkownika.
2.10. Punkty doświadczenia (EXP) – punkty przyznawane Użytkownikowi za zdobyte osiągnięcia, służące do wyliczania poziomu aktywności w Platformie.
2.11. Poziom – wartość liczbowa przypisana do Konta, obliczana na podstawie zgromadzonych punktów EXP zgodnie z wewnętrznym algorytmem Operatora; kolejne poziomy wymagają coraz większej liczby punktów EXP.
2.12. Czat Aukcji – funkcja komunikacji tekstowej powiązana z daną Aukcją, umożliwiająca wymianę wiadomości pomiędzy Użytkownikami w związku z daną Aukcją.
2.13. Konto firmowe – Konto Użytkownika oznaczone w ustawieniach profilu jako „konto firmowe”, wykorzystywane przez Użytkownika będącego przedsiębiorcą, w szczególności w związku z prowadzoną działalnością gospodarczą; przy korzystaniu z Konta firmowego zastosowanie mogą mieć odmienne przepisy dotyczące relacji B2B, w szczególności w zakresie rękojmi i prawa odstąpienia od umowy.
2.14. Uwierzytelnianie dwuskładnikowe (2FA) – dodatkowy mechanizm zabezpieczenia Konta polegający na konieczności potwierdzenia logowania lub wybranych operacji za pomocą kodu jednorazowego (np. SMS) lub innego dodatkowego składnika.
2.15. Pytania pomocnicze – zestaw pytań i odpowiadających im odpowiedzi Użytkownika, skonfigurowany w ustawieniach zabezpieczeń Konta, wykorzystywany jako dodatkowy element weryfikacji tożsamości, przechowywany w postaci zaszyfrowanej lub zhashowanej.

3. CHARAKTER I ZAKRES USŁUG
3.1. Moje Licytacje jest platformą pośredniczącą, umożliwiającą Użytkownikom organizowanie i udział w Aukcjach przedmiotów w formule licytacji.
3.2. Platforma nie jest klasycznym portalem ogłoszeniowym – Użytkownik może wyłącznie licytować przedmioty, bez funkcji „kup teraz” lub standardowych ogłoszeń.
3.3. Platforma zawiera elementy grywalizacji, w szczególności system osiągnięć, odznak, rang oraz poziomów (EXP), mający na celu zwiększenie zaangażowania Użytkowników.
3.4. Operator nie jest stroną umów sprzedaży zawieranych pomiędzy Użytkownikami. Rolą Operatora jest udostępnienie narzędzi technicznych do przeprowadzenia Aukcji.
3.5. Platforma nie świadczy usług depozytowych (escrow) oraz co do zasady nie przyjmuje płatności za przedmioty będące przedmiotem Aukcji w charakterze depozytariusza. Rozliczenia pomiędzy Sprzedającym a Kupującym odbywają się co do zasady bezpośrednio, z wykorzystaniem danych bankowych Sprzedającego, zweryfikowanych w procesie KYC, z zastrzeżeniem możliwości wykorzystania Kredytów jako rabatu lub częściowego pokrycia ceny zgodnie z postanowieniami § 7.
3.6. W przypadku gdy Platforma umożliwia wykorzystanie Kredytów do obniżenia kwoty należnej za przedmiot (np. poprzez zastosowanie rabatu, kodu promocyjnego lub częściowe pokrycie ceny), odpowiednia część ceny jest pomniejszana rozliczeniowo o równowartość wykorzystanych Kredytów (z zastosowaniem przelicznika 1000 Kredytów = 1,00 zł), natomiast pozostała część ceny może być opłacana bezpośrednio pomiędzy Użytkownikami lub za pośrednictwem usług płatniczych udostępnianych w Platformie.
3.7. Platforma nie świadczy usług hazardowych, nie organizuje gier losowych ani zakładów wzajemnych w rozumieniu przepisów prawa.

[... pełna wersja TERMS_PL ...]
`;

/* ===== PROFANITY FILTER ===== */

const FORBIDDEN_USER_PARTS = [
  // polskie
  "chuj",
  "chu",
  "chuja",
  "chuju",
  "kurw",
  "kurew",
  "kurwa",
  "kurwo",
  "skurw",
  "spierdal",
  "pierdal",
  "sperdal",
  "rdal",
  "jebac",
  "jebać",
  "jeban",
  "jebie",
  "wyjeb",
  "zjeb",
  "zjeba",
  "zjeban",
  "pierd",
  "pizd",
  "cipk",
  "kutas",
  "cwel",
  "dziwk",
  // angielskie
  "fuck",
  "fck",
  "fock",
  "shit",
  "bitch",
  "slut",
  "whore",
  "rape",
  "rapist",
];

function normalizeForProfanity(str: string) {
  return (str || "")
    .toLowerCase()
    .replace(/[@]/g, "a")
    .replace(/[0]/g, "o")
    .replace(/[3]/g, "e")
    .replace(/[1!]/g, "i")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-ząćęłńóśźż]+/g, "");
}

function isProfaneUsername(username: string) {
  const norm = normalizeForProfanity(username);
  if (!norm) return false;
  return FORBIDDEN_USER_PARTS.some((bad) => norm.includes(bad));
}

function isProbablyEmail(val: string) {
  if (typeof val !== "string") return false;
  const v = val.trim();
  if (!v.includes("@")) return false;
  return v.length >= 5;
}

type FocusField = "username" | "email" | "password" | "confirmPassword" | null;

export default function RegisterScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Modale / stany logiki
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [captchaChecked, setCaptchaChecked] = useState(false);

  const [showCongrats, setShowCongrats] = useState(false);
  const [showProfanityModal, setShowProfanityModal] = useState(false);
  const [showEmailExistsModal, setShowEmailExistsModal] = useState(false);

  // Błędy walidacji
  const [usernameError, setUsernameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [showRequiredHint, setShowRequiredHint] = useState(false);

  // UI
  const [focused, setFocused] = useState<FocusField>(null);

  const styles = useMemo(() => getStyles(colors), [colors]);

  const resetErrors = () => {
    setUsernameError("");
    setEmailError("");
    setPasswordError("");
    setConfirmPasswordError("");
  };

  const validateBasic = () => {
    resetErrors();
    let ok = true;

    const nick = username.trim();
    const emailTrim = email.trim();

    if (!nick) {
      setUsernameError("Nazwa użytkownika jest wymagana.");
      ok = false;
    } else if (isProfaneUsername(nick)) {
      setUsernameError("Nazwa zawiera niedozwolone słowa.");
      setShowProfanityModal(true);
      ok = false;
    }

    if (!emailTrim) {
      setEmailError("Adres e-mail jest wymagany.");
      ok = false;
    } else if (!isProbablyEmail(emailTrim)) {
      setEmailError("Podaj poprawny adres e-mail.");
      ok = false;
    }

    if (!password) {
      setPasswordError("Hasło jest wymagane.");
      ok = false;
    } else if (password.length < 6) {
      setPasswordError("Hasło powinno mieć co najmniej 6 znaków.");
      ok = false;
    }

    if (!confirmPassword) {
      setConfirmPasswordError("Powtórz hasło.");
      ok = false;
    } else if (confirmPassword !== password) {
      setConfirmPasswordError("Hasła nie są takie same.");
      ok = false;
    }

    if (!ok) setShowRequiredHint(true);
    return ok;
  };

  const onPressRegister = () => {
    if (!validateBasic()) return;
    setShowTermsModal(true);
  };

  const handleRegister = async () => {
    if (!termsAccepted) {
      Alert.alert("Uwaga", "Musisz zaakceptować regulamin.");
      return;
    }
    if (!captchaChecked) {
      Alert.alert("Uwaga", "Potwierdź, że nie jesteś robotem.");
      return;
    }

    if (!validateBasic()) {
      setShowTermsModal(false);
      return;
    }

    const nick = username.trim();
    const emailTrim = email.trim();
    const emailLower = emailTrim.toLowerCase();
    const nickLower = nick.toLowerCase();

    try {
      // 0) Czy email ma już konto w Auth?
      const methods = await fetchSignInMethodsForEmail(auth, emailLower);
      if (methods && methods.length > 0) {
        setShowTermsModal(false);
        setEmailError(
          "Konto z tym adresem e-mail już istnieje. Zaloguj się lub użyj innego adresu."
        );
        setShowEmailExistsModal(true);
        return;
      }

      // 1) Unikalność nazwy użytkownika
      const usersRef = collection("users");
      const usernameQuery = query(
        usersRef,
        where("usernameLower", "==", nickLower),
        limit(1)
      );
      const usernameSnap = await getDocs(usernameQuery);

      if (!usernameSnap.empty) {
        setShowTermsModal(false);
        setUsernameError("Ta nazwa użytkownika jest już zajęta.");
        return;
      }

      // 2) Email w kolekcji users (fallback)
      const emailQuery = query(usersRef, where("email", "==", emailLower), limit(1));
      const emailSnap = await getDocs(emailQuery);

      if (!emailSnap.empty) {
        setShowTermsModal(false);
        setEmailError("Ten adres e-mail jest już używany.");
        setShowEmailExistsModal(true);
        return;
      }

      // 3) Tworzenie konta w Auth
      const { user } = await createUserWithEmailAndPassword(auth, emailLower, password);

      await updateProfile(user, { displayName: nick });

      await setDoc(doc("users", user.uid), {
        email: user.email,
        displayName: nick,
        username: nick,
        usernameLower: nickLower,
        createdAt: serverTimestamp(),
      });

      // 4) Wysyłka maila weryfikacyjnego
      await sendEmailVerification(user);

      // 5) Wyloguj użytkownika, żeby nie korzystał bez weryfikacji
      try {
        await signOut(auth);
      } catch {
        // ignorujemy błąd wylogowania – ważniejsze jest wysłanie maila
      }

      // 6) Zamknij regulamin i pokaż okienko z instrukcją
      setShowTermsModal(false);
      setShowCongrats(true);
    } catch (error: any) {
      if (error?.code === "auth/email-already-in-use") {
        setShowTermsModal(false);
        setEmailError("Ten adres e-mail jest już używany.");
        setShowEmailExistsModal(true);
        return;
      }
      Alert.alert("Błąd rejestracji", error?.message || "Spróbuj ponownie.");
    }
  };

  const handleOpenPDF = () => {
    Linking.openURL(TERMS_PDF_URL).catch(() => {
      Alert.alert("Błąd", "Nie można otworzyć pliku PDF.");
    });
  };

  const getBorderColor = (field: FocusField, hasError: boolean) => {
    if (hasError) return ERROR_COLOR;
    if (focused === field) return colors.accent;
    return colors.border;
  };

  const isTermsReady = termsAccepted && captchaChecked;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
        >
          {/* subtelny top accent */}
          <View style={styles.topAccent} pointerEvents="none" />

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.brandRow}>
                <View
                  style={[
                    styles.brandIconWrap,
                    { backgroundColor: colors.accent },
                  ]}
                >
                  <Ionicons name="home-outline" size={18} color="#022c22" />
                </View>
                <Text style={[styles.title, { color: colors.text }]}>
                  MissionHome
                </Text>
              </View>

              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Utwórz konto
              </Text>

              {showRequiredHint && (
                <View style={styles.hintBox}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={16}
                    color={ERROR_COLOR}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.requiredHint}>
                    Pola oznaczone gwiazdką (*) są wymagane. Uzupełnij je, aby
                    kontynuować.
                  </Text>
                </View>
              )}

              {/* Username */}
              <Text style={[styles.label, { color: colors.textMuted }]}>
                <Text>Nazwa użytkownika</Text>
                <Text style={{ color: ERROR_COLOR }}> *</Text>
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    borderColor: getBorderColor("username", !!usernameError),
                    backgroundColor: colors.bg,
                  },
                ]}
              >
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={colors.textMuted}
                  style={styles.icon}
                />
                <TextInput
                  placeholder="np. DomowyNinja"
                  placeholderTextColor={colors.textMuted}
                  value={username}
                  onChangeText={(val) => {
                    setUsername(val);
                    if (usernameError) setUsernameError("");
                  }}
                  style={[styles.input, { color: colors.text }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="username"
                  onFocus={() => setFocused("username")}
                  onBlur={() => setFocused(null)}
                  returnKeyType="next"
                />
              </View>
              {!!usernameError && <Text style={styles.errorText}>{usernameError}</Text>}

              {/* Email */}
              <Text style={[styles.label, { color: colors.textMuted }]}>
                <Text>Adres e-mail</Text>
                <Text style={{ color: ERROR_COLOR }}> *</Text>
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    borderColor: getBorderColor("email", !!emailError),
                    backgroundColor: colors.bg,
                  },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={colors.textMuted}
                  style={styles.icon}
                />
                <TextInput
                  placeholder="Email"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (emailError) setEmailError("");
                  }}
                  style={[styles.input, { color: colors.text }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                  returnKeyType="next"
                />
              </View>
              {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}

              {/* Hasło */}
              <Text style={[styles.label, { color: colors.textMuted }]}>
                <Text>Hasło</Text>
                <Text style={{ color: ERROR_COLOR }}> *</Text>
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    borderColor: getBorderColor("password", !!passwordError),
                    backgroundColor: colors.bg,
                  },
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={colors.textMuted}
                  style={styles.icon}
                />
                <TextInput
                  placeholder="Hasło"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (passwordError) setPasswordError("");
                  }}
                  style={[styles.input, { color: colors.text }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  autoComplete="password-new"
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  returnKeyType="next"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
              {!!passwordError && <Text style={styles.errorText}>{passwordError}</Text>}

              {/* Powtórz hasło */}
              <Text style={[styles.label, { color: colors.textMuted }]}>
                <Text>Powtórz hasło</Text>
                <Text style={{ color: ERROR_COLOR }}> *</Text>
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    borderColor: getBorderColor("confirmPassword", !!confirmPasswordError),
                    backgroundColor: colors.bg,
                  },
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={colors.textMuted}
                  style={styles.icon}
                />
                <TextInput
                  placeholder="Powtórz hasło"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={(val) => {
                    setConfirmPassword(val);
                    if (confirmPasswordError) setConfirmPasswordError("");
                  }}
                  style={[styles.input, { color: colors.text }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  autoComplete="password-new"
                  onFocus={() => setFocused("confirmPassword")}
                  onBlur={() => setFocused(null)}
                  returnKeyType="done"
                  onSubmitEditing={onPressRegister}
                />
              </View>
              {!!confirmPasswordError && (
                <Text style={styles.errorText}>{confirmPasswordError}</Text>
              )}

              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.accent }]}
                onPress={onPressRegister}
                activeOpacity={0.85}
              >
                <Text style={styles.buttonText}>Utwórz konto</Text>
                <Ionicons
                  name="arrow-forward-outline"
                  size={18}
                  color="#022c22"
                  style={{ marginLeft: 8 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/login")}
                activeOpacity={0.8}
                style={styles.backBtn}
              >
                <Text style={[styles.backText, { color: colors.textMuted }]}>
                  ← Masz już konto? Zaloguj się
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.bottomSpacer} />
          </ScrollView>

          {/* Modal z regulaminem */}
          <Modal visible={showTermsModal} animationType="fade" transparent>
            <View style={styles.overlay}>
              <SafeAreaView style={styles.modalSafe}>
                <View
                  style={[
                    styles.termsCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.termsHeaderRow}>
                    <Text style={[styles.termsTitle, { color: colors.text }]}>
                      Regulamin serwisu
                    </Text>

                    <Pressable
                      onPress={() => setShowTermsModal(false)}
                      hitSlop={10}
                      style={styles.closeBtn}
                    >
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>

                  <ScrollView
                    style={styles.termsScroll}
                    contentContainerStyle={{ paddingBottom: 10 }}
                    showsVerticalScrollIndicator={true}
                  >
                    <Text style={[styles.termsBody, { color: colors.text }]}>
                      {TERMS_PL}
                    </Text>
                  </ScrollView>

                  <TouchableOpacity onPress={handleOpenPDF} style={{ marginBottom: 10 }}>
                    <Text style={[styles.pdfLinkText, { color: colors.accent }]}>
                      Pobierz regulamin w PDF
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.switchRow}>
                    <Switch value={termsAccepted} onValueChange={setTermsAccepted} />
                    <Text style={[styles.switchText, { color: colors.text }]}>
                      Potwierdzam, że zapoznałem się z regulaminem
                    </Text>
                  </View>

                  <View style={styles.switchRow}>
                    <Switch value={captchaChecked} onValueChange={setCaptchaChecked} />
                    <Text style={[styles.switchText, { color: colors.text }]}>
                      Nie jestem robotem
                    </Text>
                  </View>

                  <TouchableOpacity
                    disabled={!isTermsReady}
                    onPress={handleRegister}
                    activeOpacity={0.85}
                    style={[
                      styles.termsSubmitButton,
                      {
                        backgroundColor: isTermsReady ? colors.accent : "#999999",
                      },
                    ]}
                  >
                    <Text style={styles.termsSubmitText}>Potwierdź i zarejestruj się</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setShowTermsModal(false)} activeOpacity={0.8}>
                    <Text style={[styles.termsCancelText, { color: colors.accent }]}>
                      Anuluj
                    </Text>
                  </TouchableOpacity>
                </View>
              </SafeAreaView>
            </View>
          </Modal>

          {/* Modal „Gratulacje / potwierdź e-mail” */}
          <Modal visible={showCongrats} transparent animationType="fade">
            <View style={styles.overlay}>
              <View
                style={[
                  styles.congratsCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.congratsTitle, { color: colors.text }]}>
                  🎉 Konto zostało utworzone!
                </Text>
                <Text style={[styles.congratsText, { color: colors.textMuted }]}>
                  Na Twój adres e-mail wysłaliśmy link weryfikacyjny.{"\n"}
                  <Text style={{ fontWeight: "800", color: colors.text }}>
                    Zanim się zalogujesz, kliknij w link w wiadomości, aby potwierdzić e-mail.
                  </Text>
                </Text>

                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await signOut(auth);
                    } catch {}
                    setShowCongrats(false);
                    router.replace("/login");
                  }}
                  activeOpacity={0.85}
                  style={[styles.congratsButton, { backgroundColor: colors.accent }]}
                >
                  <Text style={styles.congratsButtonText}>Przejdź do logowania</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Modal: wulgaryzmy */}
          <Modal
            visible={showProfanityModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowProfanityModal(false)}
          >
            <View style={styles.overlay}>
              <View
                style={[
                  styles.congratsCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.congratsTitle, { color: colors.text }]}>
                  🚫 Niedozwolona nazwa użytkownika
                </Text>
                <Text style={[styles.congratsText, { color: colors.textMuted }]}>
                  Wulgaryzmy i obraźliwe określenia są zabronione – zarówno w nazwach
                  użytkowników, jak i w tytułach, opisach oraz innych treściach w aplikacji.
                </Text>
                <Text
                  style={[
                    styles.congratsText,
                    { color: colors.textMuted, marginTop: 10, fontWeight: "700" },
                  ]}
                >
                  Wybierz proszę neutralną, kulturalną nazwę, bez przekleństw ani ich
                  zamaskowanych form (np. „chu*”, „kurw@”, „5pierdalaj” itp.).
                </Text>

                <TouchableOpacity
                  onPress={() => setShowProfanityModal(false)}
                  activeOpacity={0.85}
                  style={[styles.congratsButton, { backgroundColor: colors.accent, marginTop: 14 }]}
                >
                  <Text style={styles.congratsButtonText}>OK, rozumiem</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Modal: e-mail już istnieje */}
          <Modal
            visible={showEmailExistsModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowEmailExistsModal(false)}
          >
            <View style={styles.overlay}>
              <View
                style={[
                  styles.congratsCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.congratsTitle, { color: colors.text }]}>
                  📧 Ten e-mail jest już zajęty
                </Text>
                <Text style={[styles.congratsText, { color: colors.textMuted }]}>
                  Konto z tym adresem e-mail jest już zarejestrowane. Zaloguj się na istniejące
                  konto lub użyj innego adresu e-mail podczas rejestracji.
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    setShowEmailExistsModal(false);
                    if (!emailError) {
                      setEmailError(
                        "Konto z tym adresem e-mail już istnieje. Zaloguj się lub użyj innego adresu."
                      );
                    }
                  }}
                  activeOpacity={0.85}
                  style={[styles.congratsButton, { backgroundColor: colors.accent, marginTop: 14 }]}
                >
                  <Text style={styles.congratsButtonText}>OK, zmienię e-mail</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    safe: {
      flex: 1,
    },

    topAccent: {
      position: "absolute",
      top: -120,
      left: -80,
      width: 260,
      height: 260,
      borderRadius: 260,
      opacity: 0.18,
      backgroundColor: colors.accent,
    },

    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 24,
      alignItems: "center",
    },

    card: {
      width: "100%",
      maxWidth: 420,
      padding: 20,
      borderRadius: 22,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 14,
      elevation: 6,
    },

    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginBottom: 6,
    },
    brandIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },

    title: {
      fontSize: 26,
      fontWeight: "800",
      letterSpacing: 0.2,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 14,
      textAlign: "center",
      marginTop: 2,
      marginBottom: 14,
      fontWeight: "600",
    },

    hintBox: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "rgba(220,38,38,0.35)",
      backgroundColor: "rgba(220,38,38,0.08)",
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    requiredHint: {
      color: ERROR_COLOR,
      fontSize: 12,
      flex: 1,
      fontWeight: "600",
      lineHeight: 16,
    },

    label: {
      fontSize: 12,
      fontWeight: "800",
      marginBottom: 6,
      opacity: 0.95,
      marginTop: 6,
    },

    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === "ios" ? 12 : 10,
      borderRadius: 14,
      marginBottom: 8,
    },
    input: {
      flex: 1,
      fontSize: 15,
      marginLeft: 8,
      paddingVertical: 0,
    },
    icon: {
      marginRight: 2,
    },
    eyeBtn: {
      paddingLeft: 8,
      paddingVertical: 4,
    },

    errorText: {
      color: ERROR_COLOR,
      fontSize: 11,
      marginBottom: 6,
      fontWeight: "700",
    },

    button: {
      marginTop: 12,
      paddingVertical: 13,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.14,
      shadowRadius: 10,
      elevation: 4,
    },
    buttonText: {
      color: "#022c22",
      fontSize: 16,
      fontWeight: "900",
      letterSpacing: 0.2,
    },

    backBtn: {
      marginTop: 10,
      paddingVertical: 8,
    },
    backText: {
      fontSize: 14,
      textAlign: "center",
      fontWeight: "700",
    },

    bottomSpacer: {
      height: 18,
    },

    /* --- MODAL --- */
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      alignItems: "center",
      padding: 16,
    },
    modalSafe: {
      width: "100%",
      maxWidth: 560,
    },

    termsCard: {
      width: "100%",
      maxHeight: "86%",
      borderRadius: 18,
      borderWidth: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 18,
      elevation: 8,
    },
    termsHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 6,
    },
    closeBtn: {
      position: "absolute",
      right: 0,
      top: 0,
      padding: 6,
    },
    termsScroll: {
      flexGrow: 0,
      marginBottom: 8,
      marginTop: 6,
    },
    termsTitle: {
      fontSize: 16,
      fontWeight: "900",
      textAlign: "center",
      paddingHorizontal: 30,
    },
    termsBody: {
      fontSize: 13,
      lineHeight: 18,
    },
    pdfLinkText: {
      fontSize: 13,
      fontWeight: "800",
      textAlign: "center",
      textDecorationLine: "underline",
    },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    switchText: {
      marginLeft: 10,
      fontSize: 13,
      flex: 1,
      fontWeight: "650",
    },
    termsSubmitButton: {
      paddingVertical: 11,
      borderRadius: 14,
      marginTop: 6,
      marginBottom: 8,
      alignItems: "center",
    },
    termsSubmitText: {
      color: "#ffffff",
      fontWeight: "900",
      fontSize: 14,
      letterSpacing: 0.2,
    },
    termsCancelText: {
      textAlign: "center",
      fontSize: 14,
      fontWeight: "900",
      textDecorationLine: "underline",
      marginBottom: 2,
    },

    congratsCard: {
      width: "100%",
      maxWidth: 420,
      borderRadius: 20,
      borderWidth: 1,
      paddingVertical: 20,
      paddingHorizontal: 18,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
    congratsTitle: {
      fontSize: 18,
      fontWeight: "900",
      textAlign: "center",
      marginBottom: 10,
    },
    congratsText: {
      fontSize: 14,
      textAlign: "center",
      opacity: 0.96,
      lineHeight: 20,
      fontWeight: "650",
    },
    congratsButton: {
      marginTop: 14,
      paddingVertical: 12,
      borderRadius: 16,
      alignItems: "center",
    },
    congratsButtonText: {
      color: "#022c22",
      fontWeight: "900",
      fontSize: 16,
      letterSpacing: 0.2,
    },
  });

// app/register.tsx
