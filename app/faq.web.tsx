// app/faq.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";

type FaqCategory =
  | "Start"
  | "Misje i punkty"
  | "Rodzina"
  | "Premium"
  | "Funkcje"
  | "Prywatność i bezpieczeństwo"
  | "Wsparcie";

type FaqItem = {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
};

const CATEGORY_ORDER: FaqCategory[] = [
  "Start",
  "Misje i punkty",
  "Rodzina",
  "Premium",
  "Funkcje",
  "Prywatność i bezpieczeństwo",
  "Wsparcie",
];

const CATEGORY_LABEL: Record<FaqCategory, string> = {
  Start: "Start",
  "Misje i punkty": "Misje i punkty",
  Rodzina: "Rodzina",
  Premium: "Premium",
  Funkcje: "Funkcje",
  "Prywatność i bezpieczeństwo": "Prywatność i bezpieczeństwo",
  Wsparcie: "Wsparcie",
};

const FAQ_DATA: FaqItem[] = [
  {
    id: "start-what",
    category: "Start",
    question: "Czym jest MissionHome?",
    answer:
      "MissionHome to aplikacja do ogarniania domowych obowiązków, misji i rutyn. Pomaga podzielić zadania między domowników, śledzić postępy i budować nawyki w przyjemny, “growy” sposób.",
  },
  {
    id: "start-how-work",
    category: "Start",
    question: "Jak zacząć korzystać z MissionHome?",
    answer:
      "Najprościej: (1) utwórz rodzinę, (2) dodaj domowników (zaproszenie), (3) stwórz kilka misji, (4) przypisz je do osób i ustaw częstotliwość. Potem tylko odhaczacie wykonanie i zbieracie punkty.",
  },

  {
    id: "missions-points",
    category: "Misje i punkty",
    question: "Jak działają misje i punkty?",
    answer:
      "Tworzysz misje (zadania), ustawiasz ich częstotliwość i przypisujesz do domowników. Za wykonanie misji przyznawane są punkty, które możecie traktować jak domową walutę nagród albo po prostu jako motywator.",
  },
  {
    id: "missions-assign",
    category: "Misje i punkty",
    question: "Jak przypisać komuś zadanie (misję)?",
    answer:
      "Wejdź w misję (lub stwórz nową) i ustaw osobę odpowiedzialną w polu typu “Wykonawca/Przypisanie”. Jeśli nie widzisz danej osoby na liście, najpierw dodaj ją do rodziny (zaproszenie), a dopiero potem przypisz misję.",
  },
  {
    id: "missions-repeat",
    category: "Misje i punkty",
    question: "Czy misje mogą się powtarzać (rutyny)?",
    answer:
      "Tak. Przy tworzeniu/edycji misji ustawiasz częstotliwość (np. codziennie, co tydzień, w konkretne dni). Dzięki temu MissionHome działa jak plan rutyn, a nie tylko lista “to-do”.",
  },

  {
    id: "family-use",
    category: "Rodzina",
    question: "Czy mogę używać MissionHome z rodziną lub partnerem?",
    answer:
      "Tak! MissionHome jest pomyślane do wspólnego korzystania. Możecie działać w jednej rodzinie, dzielić misje i wspólnie ogarniać dom bez chaosu na czacie.",
  },
  {
    id: "family-create",
    category: "Rodzina",
    question: "Jak stworzyć rodzinę?",
    answer:
      "W aplikacji znajdź sekcję “Rodzina” (lub podobną), wybierz “Utwórz rodzinę”, nadaj jej nazwę i zapisz. Potem możesz zapraszać domowników linkiem/kodem zaproszenia (zależnie od tego, jak masz to zrobione w aplikacji).",
  },
  {
    id: "family-invite",
    category: "Rodzina",
    question: "Jak dodać domownika do rodziny?",
    answer:
      "Wejdź w ekran rodziny i wybierz opcję zaproszenia. Wyślij kod/link drugiej osobie. Po zaakceptowaniu zaproszenia będzie widoczna na liście domowników i da się jej przypisywać misje.",
  },

  {
    id: "premium-buy",
    category: "Premium",
    question: "Jak kupić Premium?",
    answer:
      "Wejdź w ekran “Premium” (najczęściej w Ustawieniach lub w profilu), wybierz plan i potwierdź zakup. Płatność obsługuje App Store (iOS) lub Google Play (Android). Jeśli zmieniasz telefon lub coś nie wskoczyło, użyj opcji “Przywróć zakupy”.",
  },
  {
    id: "premium-what",
    category: "Premium",
    question: "Co daje Premium?",
    answer:
      "Premium odblokowuje dodatkowe możliwości aplikacji. Konkretna lista zawsze jest pokazana na ekranie Premium w aplikacji (tam jest “prawda” na dziś), ale typowo mogą to być: bardziej rozbudowane statystyki, dodatkowe funkcje organizacji/rodziny, elementy motywacyjne (np. osiągnięcia) oraz ulepszenia jakości życia. Jeśli chcesz, podeślę Ci opis Premium z Twojego ekranu i ubiorę go w jeszcze lepszy, klarowny tekst.",
  },
  {
    id: "premium-restore",
    category: "Premium",
    question: "Kupiłem Premium – co jeśli nie działa albo zmieniłem telefon?",
    answer:
      "Najpierw sprawdź, czy jesteś zalogowany na to samo konto sklepu (Apple/Google) i w tej samej aplikacji. Potem użyj opcji “Przywróć zakupy” w ekranie Premium. Jeśli nadal nie działa, zgłoś problem w aplikacji (najlepiej dołączając potwierdzenie zakupu i nazwę konta).",
  },

  {
    id: "features-devices",
    category: "Funkcje",
    question: "Na jakim urządzeniu mogę korzystać z MissionHome?",
    answer:
      "MissionHome działa na telefonach z iOS i Androidem. Zwykle da się też używać na tabletach, jeśli masz zainstalowaną aplikację. Jeśli korzystasz z chmury/konta, dane mogą synchronizować się między urządzeniami po zalogowaniu.",
  },
  {
    id: "features-stats",
    category: "Funkcje",
    question: "Co to są statystyki?",
    answer:
      "Statystyki to podsumowania Waszej aktywności: ile misji wykonaliście, ile punktów wpadło, jak wygląda regularność (np. tydzień do tygodnia), które misje są najczęściej robione, a które najczęściej zalegają. To ma pomagać w motywacji i w realnym ogarnięciu domu, a nie w ocenianiu kogokolwiek.",
  },
  {
    id: "features-achievements",
    category: "Funkcje",
    question: "Co to są osiągnięcia?",
    answer:
      "Osiągnięcia to odznaki/cele za konkretne działania (np. seria wykonanych misji, określona liczba punktów, regularność). Są po to, żeby było fajniej i żeby nagradzać konsekwencję. Nie blokują podstawowych funkcji i nie zmieniają Twoich danych – to warstwa motywacyjna.",
  },

  {
    id: "privacy-security",
    category: "Prywatność i bezpieczeństwo",
    question: "Czy moje dane są bezpieczne?",
    answer:
      "Dbamy o prywatność i bezpieczeństwo danych. Logowanie i przechowywanie danych może działać przez Firebase/chmurę (zależnie od konfiguracji aplikacji). Więcej szczegółów znajdziesz w polityce prywatności dostępnej w aplikacji.",
  },

  {
    id: "support-bug",
    category: "Wsparcie",
    question: "Jak zgłosić pomysł albo błąd?",
    answer:
      "Najlepiej przez ekran Kontakt/Feedback w aplikacji. Przy błędzie podeślij: krótki opis, kroki jak to odtworzyć, co miało się wydarzyć vs co się wydarzyło, oraz (jeśli możesz) zrzut ekranu. Przy pomyśle: opisz problem, który rozwiązuje, i jak wyobrażasz sobie działanie.",
  },
  {
    id: "support-not-working",
    category: "Wsparcie",
    question: "Co zrobić, jeśli coś nie działa?",
    answer:
      "Spróbuj: (1) zamknąć i uruchomić aplikację ponownie, (2) sprawdzić internet, (3) zaktualizować aplikację. Jeśli problem wraca – zgłoś go w aplikacji. Im więcej konkretów (model telefonu, wersja systemu, co klikasz), tym szybciej to ogarniemy.",
  },
  {
    id: "support-development",
    category: "Wsparcie",
    question: "Czy MissionHome będzie rozwijane?",
    answer:
      "Tak. Planujemy dodawać nowe funkcje, ulepszać istniejące ekrany i słuchać opinii użytkowników. Aktualizacje będą pojawiały się stopniowo.",
  },
];

const FaqScreen = () => {
  const router = useRouter();
  const colors = useThemeColors();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const filteredData = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_DATA;

    return FAQ_DATA.filter((item) => {
      const hay = `${item.question} ${item.answer} ${item.category}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<FaqCategory, FaqItem[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);

    for (const item of filteredData) {
      const arr = map.get(item.category) ?? [];
      arr.push(item);
      map.set(item.category, arr);
    }

    // wywalamy puste kategorie
    return CATEGORY_ORDER.filter((cat) => (map.get(cat)?.length ?? 0) > 0).map(
      (cat) => ({
        category: cat,
        items: map.get(cat) ?? [],
      })
    );
  }, [filteredData]);

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: colors.background ?? "#05030A" },
      ]}
    >
      <View style={styles.headerWrapper}>
        <View style={styles.headerInner}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Wróć"
          >
            <Ionicons
              name={Platform.OS === "ios" ? "chevron-back" : "arrow-back"}
              size={22}
              color={colors.text ?? "#FFFFFF"}
            />
          </TouchableOpacity>

          <Text
            style={[styles.headerTitle, { color: colors.text ?? "#FFFFFF" }]}
            numberOfLines={1}
          >
            FAQ
          </Text>

          {/* pusty placeholder dla wyrównania */}
          <View style={{ width: 32 }} />
        </View>
      </View>

      <ScrollView
        style={[
          styles.scroll,
          { backgroundColor: colors.background ?? "#05030A" },
        ]}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={[
            styles.introText,
            { color: colors.textSecondary ?? colors.text ?? "#C6C3D7" },
          ]}
        >
          Najczęściej zadawane pytania o MissionHome.{"\n"}
          Dotknij pytania, aby rozwinąć odpowiedź.
        </Text>

        <View
          style={[
            styles.searchWrapper,
            {
              backgroundColor: colors.card ?? "#110C23",
              borderColor: colors.border ?? "rgba(255,255,255,0.08)",
            },
          ]}
        >
          <Ionicons
            name="search"
            size={18}
            color={colors.textSecondary ?? "#C6C3D7"}
            style={{ marginRight: 8 }}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Szukaj w FAQ…"
            placeholderTextColor={(colors.textSecondary ?? "#C6C3D7") + "AA"}
            style={[
              styles.searchInput,
              { color: colors.text ?? "#FFFFFF" },
            ]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Szukaj w FAQ"
          />
        </View>

        {grouped.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.card ?? "#110C23",
                borderColor: colors.border ?? "rgba(255,255,255,0.08)",
              },
            ]}
          >
            <Text
              style={[
                styles.emptyTitle,
                { color: colors.text ?? "#FFFFFF" },
              ]}
            >
              Brak wyników
            </Text>
            <Text
              style={[
                styles.emptyText,
                { color: colors.textSecondary ?? "#C6C3D7" },
              ]}
            >
              Spróbuj wpisać inne słowo kluczowe (np. „premium”, „rodzina”, „zadanie”).
            </Text>
          </View>
        ) : (
          grouped.map(({ category, items }) => (
            <View key={category} style={styles.section}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.textSecondary ?? "#C6C3D7" },
                ]}
              >
                {CATEGORY_LABEL[category]}
              </Text>

              {items.map((item) => {
                const isExpanded = expandedId === item.id;
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.card,
                      {
                        backgroundColor: colors.card ?? "#110C23",
                        borderColor: colors.border ?? "rgba(255,255,255,0.08)",
                      },
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => handleToggle(item.id)}
                      style={styles.cardHeader}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={item.question}
                      accessibilityHint={
                        isExpanded ? "Zwiń odpowiedź" : "Rozwiń odpowiedź"
                      }
                    >
                      <Text
                        style={[
                          styles.questionText,
                          { color: colors.text ?? "#FFFFFF" },
                        ]}
                      >
                        {item.question}
                      </Text>
                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={colors.textSecondary ?? "#C6C3D7"}
                      />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.answerWrapper}>
                        <Text
                          style={[
                            styles.answerText,
                            { color: colors.textSecondary ?? "#C6C3D7" },
                          ]}
                        >
                          {item.answer}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  headerWrapper: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  introText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    opacity: 0.92,
  },

  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },

  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 10,
    opacity: 0.9,
  },

  card: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    marginRight: 12,
  },
  answerWrapper: {
    marginTop: 8,
  },
  answerText: {
    fontSize: 13,
    lineHeight: 18,
  },

  emptyCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    marginTop: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.9,
  },
});

export default FaqScreen;
