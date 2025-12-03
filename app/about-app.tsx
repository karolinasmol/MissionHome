// app/about-app.tsx
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
            MissionHome to aplikacja, która zamienia codzienne obowiązki
            domowe w system misji, poziomów i EXP. Zamiast zwykłej listy zadań
            masz lekką formę, która pomaga odhaczać rzeczy bez
            frustracji i ciągłego „muszę”.
          </Text>

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            Aplikacja jest w wersji beta – wiele elementów jeszcze dopieszczamy,
            ale podstawowe misje, rodzina i poziomy już działają.
          </Text>
        </SectionCard>

        {/* 2. DLA KOGO JEST APLIKACJA */}
        <SectionCard>
          <SectionTitle
            icon="people-outline"
            title="2. Dla kogo jest aplikacja?"
            subtitle="Jeśli czujesz, że ogarnianie domu i bieżących obowiązków wychodzi spod kontroli – koniecznie spróbuj MissionHome."
          />

          <Bullet>
            dla par i rodzin, które chcą uczciwie dzielić się obowiązkami, a nie
            kłócić o to, kto znowu wynosi śmieci,
          </Bullet>
          <Bullet>
          dla rodziców, którzy chcą w przystępny sposób przekazać dzieciom obowiązki,
          </Bullet>
          <Bullet>
            dla osób, które lubią mieć plan i widzieć postęp – także w domowym
            chaosie,
          </Bullet>
          <Bullet>
            dla tych, którzy potrzebują delikatnej motywacji do sprzątania,
            zmywania i innych „ulubionych” aktywności 😉
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
            Tworzenie zadań domowych jako misji z kategoriami, priorytetem i
            terminem.
          </Bullet>
          <Bullet>
            Przydzielanie misji domownikom w ramach jednej rodziny – każdy widzi
            swoje zadania.
          </Bullet>
          <Bullet>
            Zbieranie EXP i poziomów za wykonane misje, dzięki czemu widać, kto
            ile ogarnia.
          </Bullet>
          <Bullet>
          Widok miesiąca, który pozwala na weryfikację zadań domowników.
          </Bullet>
          <Bullet>
            Widok tygodnia, który pomaga zaplanować sprzątanie i inne domowe
            rzeczy tak, żeby nie wszystko spadało na ostatni dzień.
          </Bullet>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginTop: 8,
            }}
          >
            <Tag label="misje zamiast listy" />
            <Tag label="rodzina w jednym miejscu" />
            <Tag label="EXP i poziomy" />
          </View>
        </SectionCard>

        {/* 4. PLANY NA PRZYSZŁOŚĆ */}
        <SectionCard>
          <SectionTitle
            icon="sparkles-outline"
            title="4. Co planujemy dalej?"
            subtitle="Lista rzeczy, które mamy w roadmapie (i w głowie)."
          />

          <Bullet>
            Więcej statystyk i podsumowań dla rodziny – kto co robi, jak często,
            jak wygląda balans obowiązków.
          </Bullet>
          <Bullet>
            Wspólne cele i nagrody za ogarnięte misje, żeby dało się świętować
            nie tylko posprzątane mieszkanie.
          </Bullet>
          <Bullet>
            Lepszą personalizację powiadomień, widoków i kategorii – tak, żeby
            MissionHome dało się dopasować do Twojego domu, a nie odwrotnie.
          </Bullet>
          <Bullet>
            Dodatkowe widoki i tryby (np. szybkie sprzątanie, misje sezonowe,
            checklisty przed wyjazdem).
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
            MissionHome jest aktualnie rozwijana małymi krokami. Możliwe, że
            trafisz na drobne błędy, elementy niedokończone lub funkcje, które
            zmienią się z czasem.
          </Text>

          <Bullet>
            Jeśli coś nie działa, wygląda dziwnie albo masz pomysł, jak
            uprościć życie w aplikacji – daj znać z poziomu ekranu kontaktu.
          </Bullet>
          <Bullet>
            Twoje uwagi pomagają zdecydować, co rozwijać najpierw i które
            pomysły mają największy sens w prawdziwym domu, a nie tylko na
            makietach.
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
            Dzięki, że testujesz MissionHome 💛 – pomagasz ją dopiero
            zbudować.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AboutAppScreen;

// app/about-app.tsx
