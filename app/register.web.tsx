// app/register.tsx
import React, { useState } from "react";
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

const TERMS_PL = `Regulamin
Pełny regulamin korzystania z aplikacji MissionHome.

§1. Informacje ogólne

1. Niniejszy regulamin („Regulamin”) określa zasady korzystania z systemu MissionHome („System”), dostępnego w formie aplikacji mobilnej oraz aplikacji internetowej, świadczonego drogą elektroniczną przez przedsiębiorcę prowadzącego jednoosobową działalność gospodarczą pod nazwą MissionHome, z siedzibą w Gdańsku (adres do uzupełnienia), NIP xxx, adres kontaktowy: xxx („Usługodawca”).
2. System MissionHome umożliwia organizację zadań domowych, planowanie obowiązków, współpracę w rodzinnych grupach użytkowników oraz korzystanie z systemu misji, poziomów i punktów doświadczenia (EXP).
3. System dostępny jest w szczególności:
a) jako aplikacja internetowa dostępna za pośrednictwem przeglądarki internetowej,
b) jako aplikacja mobilna na urządzenia z systemem Android oraz iOS, dystrybuowana m.in. poprzez Google Play oraz Apple App Store.
4. Korzystając z Aplikacji, Użytkownik akceptuje Regulamin oraz Politykę Prywatności i Cookies.
5. Usługodawca jest administratorem danych osobowych Użytkowników w rozumieniu RODO.

§2. Definicje

1. Aplikacja - system MissionHome dostępny w formie aplikacji mobilnej oraz aplikacji internetowej (webowej).
2. Użytkownik - osoba fizyczna korzystająca z Aplikacji.
3. Konto - indywidualny profil Użytkownika tworzony w ramach Aplikacji.
4. Usługi - funkcje dostępne w Aplikacji, zarówno bezpłatne, jak i płatne (Premium).
5. Subskrypcja - płatna usługa Premium odnawiana automatycznie co miesiąc lub rok, zakupiona za pośrednictwem Google Play lub Apple App Store.
6. Rodzina - grupa Użytkowników współdzielących funkcje Aplikacji w ramach Subskrypcji.
7. Treści Użytkownika - wszelkie treści dodawane w Aplikacji przez Użytkownika, takie jak zadania, wpisy, opisy, zdjęcia, komentarze.
8. Usługi Zewnętrzne - usługi firm trzecich wykorzystywane przez Aplikację, w szczególności Firebase (Google LLC) oraz Stripe (Stripe Payments Europe, Ltd.).
9. Dane Techniczne - dane zbierane automatycznie, w tym adres IP, identyfikatory urządzeń, dane o błędach, statystyki użycia Aplikacji.

§3. Warunki techniczne korzystania

1. Do korzystania z Systemu wymagane jest urządzenie z dostępem do Internetu oraz aktualna wersja przeglądarki internetowej lub urządzenie mobilne z systemem Android albo iOS.
2. Usługodawca nie ponosi odpowiedzialności za niesprawność urządzenia Użytkownika ani brak dostępu do Internetu.
3. Aplikacja może ulegać aktualizacjom, które mogą wpływać na sposób jej działania lub dostępne funkcje.
4. Aplikacja może wymagać pobrania aktualizacji. Brak instalacji aktualizacji może skutkować ograniczeniem działania Aplikacji..
5. Usługodawca nie ponosi odpowiedzialności za przerwy spowodowane działaniem siły wyższej, awarią dostawców usług, problemami po stronie Firebase, Stripe, Google lub Apple.

§4. Zawarcie i rozwiązanie umowy

1. Umowa o świadczenie usług drogą elektroniczną zostaje zawarta z chwilą rozpoczęcia korzystania z Aplikacji przez Użytkownika, w tym instalacji lub założenia Konta.
2. Umowa o świadczenie usługi Premium (Subskrypcji) zostaje zawarta z chwilą zakupu Subskrypcji za pośrednictwem Google Play lub Apple App Store, zgodnie z regulaminami tych platform.
3. Użytkownik może zakończyć korzystanie z Aplikacji poprzez jej odinstalowanie lub usunięcie Konta, co równoznaczne jest z rozwiązaniem umowy o świadczenie usług bezpłatnych.
4. Usługodawca może rozwiązać umowę lub zablokować Konto Użytkownika, jeśli ten:
- narusza Regulamin,
- działa na szkodę innych Użytkowników lub Usługodawcy,
- próbuje obejść system płatności Premium,
- wykorzystuje Aplikację niezgodnie z jej przeznaczeniem.
5. Użytkownik może usunąć Konto w ustawieniach Aplikacji. Usunięcie Konta jest nieodwracalne.
6. Usługodawca może odmówić założenia Konta lub je usunąć w przypadku podania fałszywych danych lub naruszenia prawa.

§5. Konto użytkownika

1. Użytkownik jest zobowiązany do podania prawdziwych, aktualnych danych podczas zakładania Konta, jeśli są wymagane.
2. Użytkownik odpowiada za bezpieczeństwo danych logowania i nie powinien ich udostępniać osobom trzecim.
3. Użytkownik ponosi odpowiedzialność za wszelkie działania wykonywane za pomocą jego Konta.
4. Usługodawca może czasowo zawiesić lub trwale usunąć Konto naruszające Regulamin lub prawo.
5. Użytkownik ma możliwość eksportu danych, jeśli funkcja ta jest dostępna.
6. W przypadku utraty dostępu do Konta Użytkownik korzysta z procedury odzyskiwania dostępu oferowanej przez Firebase Authentication.

§6. Funkcje Aplikacji

1. Aplikacja umożliwia korzystanie z funkcji takich jak: tworzenie zadań i obowiązków, planowanie misji i celów, otrzymywanie propozycji codziennych zadań, zdobywanie punktów doświadczenia (EXP), rywalizacja w rankingach, tworzenie Rodzin i zarządzanie ich członkami, konwersacje tekstowe z członkami Rodziny.
2. Usługodawca może rozwijać, modyfikować lub usuwać funkcje Aplikacji, jeśli wymaga tego bezpieczeństwo, prawo lub względy techniczne.
3. Niektóre funkcje są dostępne wyłącznie dla Użytkowników Premium.
4. Usługodawca może oferować testowe funkcje Premium.
5. Funkcje analityczne Aplikacji mogą wykorzystywać Firebase Analytics.

§7. Subskrypcja Premium

1. Funkcje Premium dostępne są w modelu Subskrypcji miesięcznej lub rocznej, odnawianej automatycznie, chyba że Użytkownik dezaktywuje automatyczne odnowienie na swoim koncie Google Play lub App Store.
2. Przed zakupem Użytkownik otrzymuje jasną informację o:
- cenie Subskrypcji,
- okresie rozliczeniowym,
- zasadach odnowienia,
3. Płatności przetwarzane są wyłącznie przez Stripe, Google lub Apple. Usługodawca nie gromadzi ani nie przetwarza danych kart płatniczych.
4. Zwroty płatności są realizowane wyłącznie przez Google Play, Apple App Store lub Stripe zgodnie z ich regulaminami.
5. Brak opłacenia Subskrypcji po okresie rozliczeniowym powoduje automatyczny powrót do wersji bezpłatnej Aplikacji.
6. Funkcje Premium mogą obejmować m.in.:
- możliwość tworzenia zadań i misji wspólnie z członkami Rodziny,
- możliwość tworzenia wiadomości rodzinnych,
- priorytetową obsługę wsparcia.
7. W przypadku Subskrypcji Stripe, zarządzanie odbywa się przez Stripe Customer Portal.
8. Subskrypcja odnawia się automatycznie do czasu jej anulowania.
9. Usługodawca może zmienić zakres funkcji Premium, informując o istotnych zmianach.
10. Zmiana ceny Subskrypcji jest komunikowana zgodnie z zasadami Google, Apple lub Stripe.
11. Zakup Subskrypcji Premium jest przypisany do Konta Użytkownika i obowiązuje wyłącznie w ramach platformy, za pośrednictwem której został dokonany zakup, zgodnie z zasadami Google Play, Apple App Store lub Stripe.

§8. Prawo odstąpienia od umowy

1. Użytkownik ma prawo odstąpić od zakupu Subskrypcji zgodnie z zasadami platformy, przez którą dokonano zakupu.
2. Usługodawca nie posiada możliwości ręcznej realizacji zwrotów ani anulowania zakupów.
3. Jeżeli Użytkownik wyraził zgodę na natychmiastowe rozpoczęcie świadczenia usługi cyfrowej Premium, może utracić prawo odstąpienia.
4. W przypadku Stripe prawo konsumenta do odstąpienia jest realizowane zgodnie z polityką Stripe.
5. Prawo odstąpienia nie dotyczy automatycznych odnowień, o ile Użytkownik mógł je wcześniej anulować.

§9. Treści tworzone przez Użytkownika

1. Użytkownik ponosi pełną odpowiedzialność za treści, które tworzy, zapisuje lub publikuje w Aplikacji, w tym m.in. zadania, wpisy, komentarze i zdjęcia.
2. Zabrania się publikowania treści niezgodnych z prawem, obraźliwych, naruszających prywatność, zawierających dane wrażliwe lub spam.
3. Usługodawca ma prawo usuwać treści niezgodne z Regulaminem lub obowiązującym prawem.
4. Użytkownik udziela Usługodawcy niewyłącznej licencji na przetwarzanie treści w zakresie niezbędnym do prawidłowego działania Aplikacji.
5. Treści Użytkownika mogą być przechowywane na serwerach Firebase.
6. Użytkownik zobowiązuje się nie publikować danych szczególnych kategorii.
7. Usługodawca może przetwarzać treści Użytkownika w celu backupu, analizy awarii lub migracji danych.

§10. Funkcje rodzinne i współdzielenie danych

1. Użytkownik, który dołącza do Rodziny lub ją tworzy, akceptuje, że inni członkowie Rodziny mogą widzieć jego aktywność, m.in.: wykonane zadania, zdobyte punkty, statystyki i udział w misjach.
2. Użytkownik może w dowolnym momencie opuścić Rodzinę, chyba że pełni rolę administratora i musi najpierw przekazać tę rolę innej osobie.
3. Funkcje Rodziny - np. tworzenie Rodziny, wiadomości, statystyki grupowe, wspólne misje — mogą wymagać aktywnej Subskrypcji Premium.
4. Usługodawca nie odpowiada za relacje między członkami Rodziny.
5. Funkcje Rodzin mogą wymagać udostępniania statystyk i postępów.

§11. Odpowiedzialność Usługodawcy

1. Aplikacja jest dostarczana w modelu „tak jak jest” („as is”), bez gwarancji nieprzerwanego działania.
2. Usługodawca dokłada starań, aby Aplikacja była bezpieczna i wolna od błędów, jednak nie gwarantuje pełnej niezawodności.
3. Usługodawca nie ponosi odpowiedzialności za niewłaściwe korzystanie z Aplikacji, spory między Użytkownikami, utratę danych wynikającą z błędów technicznych ani szkody powstałe wskutek działania siły wyższej.
4. Usługodawca może czasowo ograniczyć dostęp do Aplikacji z przyczyn technicznych, bezpieczeństwa lub aktualizacji.
5. Usługodawca nie odpowiada za utratę danych spowodowaną awarią Firebase lub usług chmurowych.
6. Usługodawca nie gwarantuje pełnej zgodności Aplikacji z każdym urządzeniem.
7. Usługodawca nie odpowiada za nieautoryzowany dostęp wynikający z winy Użytkownika.

§12. Postępowanie reklamacyjne

1. Reklamacje dotyczące działania Aplikacji należy zgłaszać na adres e-mail: xxx
2. Usługodawca rozpatruje reklamacje w terminie do 14 dni roboczych od daty ich otrzymania.
3. Reklamacje dotyczące płatności, odnowienia Subskrypcji lub zwrotów są obsługiwane wyłącznie przez Google Play i Apple App Store.
4. Usługodawca nie ma możliwości wpływu na decyzje sklepów dotyczące zwrotów.
5. Reklamacja powinna zawierać dane umożliwiające identyfikację Konta.

§13. Dane osobowe i prywatność

1. Dane osobowe Użytkowników przetwarzane są zgodnie z obowiązującymi przepisami prawa, w tym z RODO.
2. Szczegółowe zasady przetwarzania określa Polityka Prywatności i Cookies.
3. Użytkownikowi przysługuje prawo dostępu, sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych oraz wniesienia sprzeciwu zgodnie z RODO.
4. Użytkownik ma również prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych.
5. Użytkownik może wnieść skargę do Prezesa UODO.
6. Dane mogą być przechowywane na serwerach poza UE zgodnie z zasadami RODO.
7. Przetwarzane dane mogą obejmować dane logowania, dane o użytkowaniu Aplikacji, dane o zakupach i treści użytkownika.
Usługodawca stosuje środki bezpieczeństwa, w tym szyfrowanie transmisji
i autoryzację Firebase.

§14. Własność intelektualna

1. Wszelkie prawa własności intelektualnej do Aplikacji, w tym: kodu źródłowego, interfejsu, grafiki, nazwy aplikacji, opisów, mechanik działania oraz materiałów audiowizualnych przysługują Usługodawcy.
2. Zabrania się kopiowania, modyfikowania, dekompilacji, dystrybucji lub odsprzedaży Aplikacji bez pisemnej zgody Usługodawcy.
3. Użytkownik może korzystać z Aplikacji wyłącznie na własne potrzeby, zgodnie z Regulaminem i obowiązującymi przepisami prawa.

§15. Zmiany Regulaminu

1. Usługodawca może wprowadzać zmiany Regulaminu z ważnych przyczyn, w szczególności: zmian prawa, zmian funkcjonalnych Aplikacji, zmian organizacyjnych, konieczności poprawy bezpieczeństwa.
2. O istotnych zmianach Użytkownik zostanie poinformowany w Aplikacji lub poprzez inne środki komunikacji.
3. Dalsze korzystanie z Aplikacji po wejściu zmian w życie oznacza akceptację nowej treści Regulaminu.
4. W przypadku zmian wymagających zgody Użytkownika, Usługodawca może poprosić o ponowną akceptację.
5. Użytkownik może zakończyć korzystanie z Aplikacji, jeśli nie akceptuje zmian.

§16. Postanowienia końcowe

1. W sprawach nieuregulowanych w Regulaminie zastosowanie mają przepisy prawa polskiego.
2. Wszelkie spory pomiędzy Użytkownikiem a Usługodawcą będą rozstrzygane przez sąd właściwy zgodnie z przepisami prawa.
3. Regulamin obowiązuje od dnia publikacji w Aplikacji.
4. Regulamin jest dostępny w Aplikacji oraz na stronie internetowej MissionHome.

Ostatnia aktualizacja: 2025-12-12
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

  const styles = getStyles(colors);

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
      const emailQuery = query(
        usersRef,
        where("email", "==", emailLower),
        limit(1)
      );
      const emailSnap = await getDocs(emailQuery);

      if (!emailSnap.empty) {
        setShowTermsModal(false);
        setEmailError("Ten adres e-mail jest już używany.");
        setShowEmailExistsModal(true);
        return;
      }

      // 3) Tworzenie konta w Auth
      const { user } = await createUserWithEmailAndPassword(
        auth,
        emailLower,
        password
      );

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

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>MissionHome</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Utwórz konto
        </Text>

        {showRequiredHint && (
          <Text style={styles.requiredHint}>
            Pola oznaczone gwiazdką (*) są wymagane. Uzupełnij je, aby
            kontynuować.
          </Text>
        )}

        {/* Username */}
        <Text style={[styles.label, { color: colors.textMuted }]}>
          <Text>Nazwa użytkownika</Text>
          <Text style={{ color: ERROR_COLOR }}> *</Text>
        </Text>
        <View style={styles.inputWrapper}>
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
          />
        </View>
        {!!usernameError && (
          <Text style={styles.errorText}>{usernameError}</Text>
        )}

        {/* Email */}
        <Text style={[styles.label, { color: colors.textMuted }]}>
          <Text>Adres e-mail</Text>
          <Text style={{ color: ERROR_COLOR }}> *</Text>
        </Text>
        <View style={styles.inputWrapper}>
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
            keyboardType="email-address"
          />
        </View>
        {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}

        {/* Hasło */}
        <Text style={[styles.label, { color: colors.textMuted }]}>
          <Text>Hasło</Text>
          <Text style={{ color: ERROR_COLOR }}> *</Text>
        </Text>
        <View style={styles.inputWrapper}>
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
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={18}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        </View>
        {!!passwordError && (
          <Text style={styles.errorText}>{passwordError}</Text>
        )}

        {/* Powtórz hasło */}
        <Text style={[styles.label, { color: colors.textMuted }]}>
          <Text>Powtórz hasło</Text>
          <Text style={{ color: ERROR_COLOR }}> *</Text>
        </Text>
        <View style={styles.inputWrapper}>
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
          />
        </View>
        {!!confirmPasswordError && (
          <Text style={styles.errorText}>{confirmPasswordError}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.accent }]}
          onPress={onPressRegister}
        >
          <Text style={styles.buttonText}>Utwórz konto</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/login")}>
          <Text style={[styles.backText, { color: colors.textMuted }]}>
            ← Masz już konto? Zaloguj się
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modal z regulaminem – zmniejszony */}
      <Modal visible={showTermsModal} animationType="fade" transparent>
        <View style={styles.overlay}>
          <View
            style={[
              styles.termsCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.termsTitle, { color: colors.text }]}>
              Regulamin serwisu
            </Text>

            <ScrollView
              style={styles.termsScroll}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <Text style={[styles.termsBody, { color: colors.text }]}>
                {TERMS_PL}
              </Text>
            </ScrollView>

            <TouchableOpacity
              onPress={handleOpenPDF}
              style={{ marginBottom: 10 }}
            >
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
              disabled={!(termsAccepted && captchaChecked)}
              onPress={handleRegister}
              style={[
                styles.termsSubmitButton,
                {
                  backgroundColor:
                    termsAccepted && captchaChecked ? colors.accent : "#999999",
                },
              ]}
            >
              <Text style={styles.termsSubmitText}>
                Potwierdź i zarejestruj się
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowTermsModal(false)}>
              <Text style={[styles.termsCancelText, { color: colors.accent }]}>
                Anuluj
              </Text>
            </TouchableOpacity>
          </View>
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
              <Text style={{ fontWeight: "700" }}>
                Zanim się zalogujesz, kliknij w link w wiadomości, aby
                potwierdzić e-mail.
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
              style={[
                styles.congratsButton,
                { backgroundColor: colors.accent },
              ]}
            >
              <Text style={styles.congratsButtonText}>
                Przejdź do logowania
              </Text>
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
              Wulgaryzmy i obraźliwe określenia są zabronione – zarówno w
              nazwach użytkowników, jak i w tytułach, opisach oraz innych
              treściach w aplikacji.
            </Text>
            <Text
              style={[
                styles.congratsText,
                { color: colors.textMuted, marginTop: 10, fontWeight: "600" },
              ]}
            >
              Wybierz proszę neutralną, kulturalną nazwę, bez przekleństw ani ich
              zamaskowanych form (np. „chu*”, „kurw@”, „5pierdalaj” itp.).
            </Text>

            <TouchableOpacity
              onPress={() => setShowProfanityModal(false)}
              style={[
                styles.congratsButton,
                { backgroundColor: colors.accent, marginTop: 14 },
              ]}
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
              Konto z tym adresem e-mail jest już zarejestrowane. Zaloguj się na
              istniejące konto lub użyj innego adresu e-mail podczas rejestracji.
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
              style={[
                styles.congratsButton,
                { backgroundColor: colors.accent, marginTop: 14 },
              ]}
            >
              <Text style={styles.congratsButtonText}>OK, zmienię e-mail</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    card: {
      width: "100%",
      maxWidth: 380,
      padding: 24,
      borderRadius: 20,
      borderWidth: 1,
    },
    title: {
      fontSize: 28,
      fontWeight: "700",
      textAlign: "center",
    },
    subtitle: {
      fontSize: 14,
      textAlign: "center",
      marginTop: 4,
      marginBottom: 16,
    },
    requiredHint: {
      color: ERROR_COLOR,
      fontSize: 12,
      textAlign: "center",
      marginBottom: 8,
    },
    label: {
      fontSize: 12,
      fontWeight: "700",
      marginBottom: 4,
      opacity: 0.95,
    },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      marginBottom: 8,
      borderColor: colors.border,
    },
    input: {
      flex: 1,
      fontSize: 15,
      marginLeft: 8,
    },
    icon: {
      marginRight: 4,
    },
    errorText: {
      color: ERROR_COLOR,
      fontSize: 11,
      marginBottom: 6,
    },
    button: {
      paddingVertical: 12,
      borderRadius: 999,
      alignItems: "center",
      marginTop: 10,
    },
    buttonText: {
      color: "#022c22",
      fontSize: 16,
      fontWeight: "700",
    },
    backText: {
      marginTop: 10,
      fontSize: 14,
      textAlign: "center",
      fontWeight: "600",
    },

    /* --- ZMNIEJSZONY MODAL REGULAMINU --- */
    termsCard: {
      width: "100%",
      maxWidth: 520,
      maxHeight: "80%",
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    termsScroll: {
      flex: 1,
      marginBottom: 8,
    },
    termsTitle: {
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 8,
      textAlign: "center",
    },
    termsBody: {
      fontSize: 13,
      lineHeight: 18,
    },
    pdfLinkText: {
      fontSize: 13,
      fontWeight: "700",
      textAlign: "center",
      textDecorationLine: "underline",
    },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    switchText: {
      marginLeft: 8,
      fontSize: 13,
      flex: 1,
    },
    termsSubmitButton: {
      paddingVertical: 9,
      borderRadius: 12,
      marginTop: 4,
      marginBottom: 6,
      alignItems: "center",
    },
    termsSubmitText: {
      color: "#ffffff",
      fontWeight: "700",
      fontSize: 14,
    },
    termsCancelText: {
      textAlign: "center",
      fontSize: 14,
      fontWeight: "700",
      textDecorationLine: "underline",
      marginBottom: 4,
    },

    // Overlays / popup
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    congratsCard: {
      width: "100%",
      maxWidth: 420,
      borderRadius: 18,
      borderWidth: 1,
      paddingVertical: 20,
      paddingHorizontal: 18,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 6,
    },
    congratsTitle: {
      fontSize: 18,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 8,
    },
    congratsText: {
      fontSize: 14,
      textAlign: "center",
      opacity: 0.95,
    },
    congratsButton: {
      marginTop: 10,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
    },
    congratsButtonText: {
      color: "#022c22",
      fontWeight: "700",
      fontSize: 16,
    },
  });

// app/register.tsx
