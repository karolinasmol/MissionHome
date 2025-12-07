import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";

const AboutAppScreen = () => {
  const router = useRouter();
  const { colors } = useThemeColors();

  const SectionCard = ({ children }: { children: React.ReactNode }) => (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {children}
    </View>
  );

  const SectionTitle = ({
    icon,
    title,
    subtitle,
  }: {
    icon: any;
    title: string;
    subtitle?: string;
  }) => (
    <View style={{ marginBottom: subtitle ? 10 : 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.accent + "22",
            marginRight: 8,
          }}
        >
          <Ionicons name={icon} size={15} color={colors.accent} />
        </View>
        <Text
          style={{
            color: colors.text,
            fontSize: 15,
            fontWeight: "800",
          }}
        >
          {title}
        </Text>
      </View>
      {subtitle ? (
        <Text
          style={{
            marginTop: 4,
            color: colors.textMuted,
            fontSize: 12,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  const Bullet = ({ children }: { children: React.ReactNode }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        marginTop: 4,
      }}
    >
      <Text
        style={{
          marginTop: 5,
          marginRight: 6,
          fontSize: 10,
          color: colors.accent,
        }}
      >
        ●
      </Text>
      <Text
        style={{
          flex: 1,
          color: colors.text,
          fontSize: 13,
          lineHeight: 19,
        }}
      >
        {children}
      </Text>
    </View>
  );

  const Tag = ({ label }: { label: string }) => (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        marginRight: 6,
        marginTop: 6,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "600",
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.bg,
      }}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: Platform.OS === "android" ? 40 : 20,
          paddingBottom: 32,
        }}
      >
        {/* HEADER */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: colors.text,
              }}
            >
              O aplikacji
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                marginTop: 2,
              }}
            >
              Kilka słów o tym, czym jest MissionHome i jak pomoże Ci w ogarnianiu domu.
            </Text>
          </View>
        </View>

        {/* 1. CZYM JEST MISSIONHOME */}
        <SectionCard>
          <SectionTitle
            icon="rocket-outline"
            title="1. Czym jest MissionHome?"
            subtitle="Domowe centrum dowodzenia, dla Ciebie i rodziny."
          />

          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 6,
            }}
          >
            MissionHome to Twoje domowe centrum dowodzenia – takie, które naprawdę działa.
            To aplikacja stworzona po to, żeby codzienność była lżejsza, bardziej ogarnięta i…
            wreszcie Twoja. Zamiast zwykłej listy zadań dostajesz system misji, poziomów i EXP,
            który zmienia codzienność w coś, co naprawdę chce się robić. Każde zadanie to misja,
            każdy krok daje poczucie progresu, a wspólne działanie z rodziną tworzy zgraną drużynę.
            MissionHome wspiera Twój dzień – nie przytłacza, nie zmusza i nie dodaje presji.
          </Text>

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            Aplikacja jest w wersji beta, ale jej najważniejsze elementy już działają: misje i
            osiągnięcia, system EXP, wersja Premium, tworzenie rodziny i wspólne wsparcie,
            lekka i przyjazna forma. MissionHome rozwija się z każdym tygodniem – po to, by
            codzienne obowiązki były prostsze, bardziej intuicyjne i mniej stresujące.
          </Text>
        </SectionCard>

        {/* 2. DLA KOGO JEST APLIKACJA */}
        <SectionCard>
          <SectionTitle
            icon="people-outline"
            title="2. Dla kogo jest aplikacja?"
            subtitle="Jeśli czujesz, że ogarnianie domu wymyka się spod kontroli – spróbuj MissionHome."
          />

          <Bullet>
            dla par i rodzin, które chcą jasno dzielić się obowiązkami, zamiast kłócić się o to, kto znowu wynosi śmieci,
          </Bullet>
          <Bullet>
            dla rodziców, którzy chcą w prosty sposób wprowadzić dzieci w domowe zadania,
          </Bullet>
          <Bullet>
            dla osób, które lubią mieć plan i widzieć realny postęp – także w codziennych obowiązkach,
          </Bullet>
          <Bullet>
            dla tych, którzy potrzebują delikatnej motywacji do sprzątania, zmywania i innych „ulubionych” aktywności 😉
          </Bullet>
        </SectionCard>

        {/* 3. CO POTRAFI TERAZ */}
        <SectionCard>
          <SectionTitle
            icon="checkmark-done-outline"
            title="3. Co potrafi MissionHome w tej chwili?"
            subtitle="Funkcje dostępne w wersji beta."
          />

          <Bullet>
            Tworzenie zadań domowych jako misji z kategoriami, priorytetem i terminem.
          </Bullet>
          <Bullet>
          Proponowanie misji dnia — codzienne powiadomienie, które przy pierwszym logowaniu danego
          dnia podpowiada gotowe zadania do ogarnięcia i pomaga zacząć dzień z energią.
          </Bullet>
          <Bullet>
            Przydzielanie misji domownikom w ramach jednej rodziny – każdy widzi swoje zadania.
          </Bullet>
          <Bullet>
            Zbieranie EXP i poziomów za wykonane misje, dzięki czemu widać, kto ile ogarnia.
          </Bullet>
          <Bullet>
            Widok miesiąca, który pozwala na weryfikację zadań domowników.
          </Bullet>
          <Bullet>
            Widok tygodnia, który pomaga zaplanować sprzątanie i inne domowe sprawy.
          </Bullet>
          <Bullet>
            Wysyłanie wiadomości w obrębie członków rodziny, z filtrem wulgaryzmów.
          </Bullet>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginTop: 8,
            }}
          >

          </View>
        </SectionCard>

        {/* 4. PLANY NA PRZYSZŁOŚĆ */}
        <SectionCard>
          <SectionTitle
            icon="sparkles-outline"
            title="4. Co planujemy dalej?"
            subtitle="Rzeczy, które mamy w roadmapie."
          />

          <Bullet>
            bardziej rozbudowane statystyki rodzinne – czytelne podsumowania, które pokażą,
            jak wygląda podział obowiązków,
          </Bullet>
          <Bullet>
            wspólne cele i mini-nagrody dla domowników, żeby ogarnianie było czymś,
            co naprawdę łączy,
          </Bullet>
          <Bullet>
            pełna personalizacja aplikacji – własne kategorie, kolory, powiadomienia i widoki dopasowane do stylu Twojego domu,
          </Bullet>
          <Bullet>
            nowe tryby działania, m.in. misje sezonowe czy checklisty na wyjazdy.
          </Bullet>
        </SectionCard>

        {/* 5. WERSJA, STATUS I FEEDBACK */}
        <SectionCard>
          <SectionTitle
            icon="information-circle-outline"
            title="5. Wersja aplikacji i feedback"
            subtitle="Beta oznacza, że Twoja opinia naprawdę ma znaczenie."
          />

          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 6,
            }}
          >
            MissionHome rozwijamy małymi, regularnymi krokami - dlatego możesz natrafić
            na drobne błędy lub funkcje, które wciąż dopracowujemy.
          </Text>

          <Bullet>
            Jeśli coś nie działa, wygląda inaczej niż powinno lub masz pomysł na usprawnienie -
            daj nam znać przez ekran kontaktu.
          </Bullet>
          <Bullet>
            Twoje uwagi pomagają nam podejmować lepsze decyzje i tworzyć aplikację,
            która odpowiada na potrzeby prawdziwych domów.
          </Bullet>
        </SectionCard>

        {/* STOPKA INFO */}
        <View
          style={{
            marginTop: 4,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            Wersja aplikacji:{" "}
            <Text style={{ fontWeight: "700", color: colors.text }}>
              1.0.0 (beta)
            </Text>
            {"\n"}
            Dziękujemy, że testujesz MissionHome 💛 – pomagasz ją budować.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AboutAppScreen;

// app/about-app.tsx
