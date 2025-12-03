// app/faq.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

const FAQ_DATA: FaqItem[] = [
  {
    id: "1",
    question: "Czym jest MissionHome?",
    answer:
      "MissionHome to aplikacja do ogarniania domowych obowiązków, misji i rutyn. Pomaga podzielić zadania między domowników, śledzić postępy i nagradzać się za wykonane misje.",
  },
  {
    id: "2",
    question: "Jak działają misje i punkty?",
    answer:
      "Tworzysz misje (zadania), przypisujesz je do domowników i ustawiasz ich częstotliwość. Za wykonanie misji przyznawane są punkty, które możesz wykorzystać np. jako domową walutę nagród.",
  },
  {
    id: "3",
    question: "Czy mogę używać MissionHome z rodziną lub partnerem?",
    answer:
      "Tak! MissionHome została stworzona z myślą o wspólnym korzystaniu. Możesz zapraszać innych do swojej rodziny w aplikacji, dzielić z nimi misje i wspólnie ogarniać dom.",
  },
  {
    id: "4",
    question: "Czy moje dane są bezpieczne?",
    answer:
      "Dbamy o prywatność i bezpieczeństwo danych. Używamy Firebase do logowania oraz przechowywania danych w chmurze. Więcej szczegółów znajdziesz w polityce prywatności w aplikacji.",
  },
  {
    id: "5",
    question: "Co zrobić, jeśli coś nie działa?",
    answer:
      "Jeśli znajdziesz błąd lub coś działa nie tak, jak powinno, możesz skontaktować się z nami przez ekran Kontakt w aplikacji. Postaramy się pomóc najszybciej, jak to możliwe.",
  },
  {
    id: "6",
    question: "Czy MissionHome będzie rozwijane?",
    answer:
      "Tak! Planujemy dodawać nowe funkcje, ulepszać istniejące ekrany i słuchać opinii użytkowników. Aktualizacje aplikacji będą pojawiały się stopniowo.",
  },
];

const FaqScreen = () => {
  const router = useRouter();
  const colors = useThemeColors();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

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
          >
            <Ionicons
              name={Platform.OS === "ios" ? "chevron-back" : "arrow-back"}
              size={22}
              color={colors.text ?? "#FFFFFF"}
            />
          </TouchableOpacity>
          <Text
            style={[
              styles.headerTitle,
              { color: colors.text ?? "#FFFFFF" },
            ]}
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

        {FAQ_DATA.map((item) => {
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
    marginBottom: 16,
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
});

export default FaqScreen;
