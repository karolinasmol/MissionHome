import React, { useMemo } from "react";
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

// ✅ Bezpieczne alpha dla kolorów (HEX i rgb)
const withAlpha = (color: string, alpha: number) => {
  if (!color) return color;

  if (color.startsWith("#")) {
    let hex = color.replace("#", "").trim();
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (hex.length !== 6) return color;

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (color.startsWith("rgb(")) {
    return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  }

  if (color.startsWith("rgba(")) return color;

  return color;
};

const AboutAppScreen = () => {
  const router = useRouter();
  const { colors } = useThemeColors();

  const ui = useMemo(() => {
    return {
      bg: colors.bg,
      card: colors.card,
      border: colors.border,
      text: colors.text,
      muted: colors.textMuted,
      accent: colors.accent,
      accentSoft: withAlpha(colors.accent, 0.14),
      accentSoft2: withAlpha(colors.accent, 0.22),
      shadow: withAlpha("#000000", 0.12),
    };
  }, [colors]);

  const SectionCard = ({
    children,
    highlight,
  }: {
    children: React.ReactNode;
    highlight?: boolean;
  }) => (
    <View
      style={{
        backgroundColor: ui.card,
        borderRadius: 18,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: highlight ? withAlpha(ui.accent, 0.35) : ui.border,
        shadowColor: ui.shadow,
        shadowOpacity: Platform.OS === "ios" ? 0.2 : 0,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: Platform.OS === "android" ? 1 : 0,
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
            width: 28,
            height: 28,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: ui.accentSoft,
            marginRight: 10,
          }}
        >
          <Ionicons name={icon} size={15} color={ui.accent} />
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: ui.text,
              fontSize: 15,
              fontWeight: "800",
            }}
          >
            {title}
          </Text>

          {subtitle ? (
            <Text
              style={{
                marginTop: 4,
                color: ui.muted,
                fontSize: 12,
                lineHeight: 16,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );

  const Bullet = ({
    children,
    icon,
  }: {
    children: React.ReactNode;
    icon?: any;
  }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        marginTop: 6,
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: ui.accentSoft,
          marginRight: 8,
          marginTop: 1,
        }}
      >
        <Ionicons name={icon ?? "checkmark"} size={12} color={ui.accent} />
      </View>

      <Text
        style={{
          flex: 1,
          color: ui.text,
          fontSize: 13,
          lineHeight: 19,
        }}
      >
        {children}
      </Text>
    </View>
  );

  // ✅ Małe akcje (chipy) - nie rozwalają szerokości na web/tablet/mobile
  const ActionChip = ({
    icon,
    label,
    onPress,
    variant = "ghost",
  }: {
    icon: any;
    label: string;
    onPress: () => void;
    variant?: "ghost" | "primary";
  }) => {
    const isPrimary = variant === "primary";
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.9}
        style={{
          borderRadius: 999,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: isPrimary ? withAlpha(ui.accent, 0.45) : ui.border,
          backgroundColor: isPrimary ? ui.accentSoft2 : ui.card,
          flexDirection: "row",
          alignItems: "center",
          marginRight: 10,
          marginTop: 10,
        }}
      >
        <Ionicons
          name={icon}
          size={14}
          color={isPrimary ? ui.accent : ui.text}
          style={{ marginRight: 8 }}
        />
        <Text
          style={{
            color: isPrimary ? ui.accent : ui.text,
            fontSize: 12,
            fontWeight: "800",
            letterSpacing: 0.2,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const InfoRow = ({
    icon,
    title,
    value,
  }: {
    icon: any;
    title: string;
    value: string;
  }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: ui.accentSoft,
          marginRight: 10,
        }}
      >
        <Ionicons name={icon} size={16} color={ui.accent} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: ui.muted, fontSize: 11, fontWeight: "700" }}>
          {title}
        </Text>
        <Text style={{ color: ui.text, fontSize: 13, fontWeight: "800" }}>
          {value}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: Platform.OS === "android" ? 40 : 20,
          paddingBottom: 32,
        }}
      >
        {/* HEADER */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 14,
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
              backgroundColor: ui.card,
              borderWidth: 1,
              borderColor: ui.border,
            }}
          >
            <Ionicons name="chevron-back" size={20} color={ui.text} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "900",
                color: ui.text,
              }}
            >
              O aplikacji
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: ui.muted,
                marginTop: 2,
                lineHeight: 18,
              }}
            >
              MissionHome - domowe centrum dowodzenia, które robi robotę.
            </Text>
          </View>
        </View>

        {/* HERO */}
        <View
          style={{
            borderRadius: 20,
            padding: 16,
            marginBottom: 14,
            borderWidth: 1,
            borderColor: ui.border,
            backgroundColor: ui.card,
            overflow: "hidden",
          }}
        >
          {/* dekoracyjne tło */}
          <View
            style={{
              position: "absolute",
              right: -28,
              top: -28,
              width: 140,
              height: 140,
              borderRadius: 999,
              backgroundColor: ui.accentSoft,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: -30,
              bottom: -40,
              width: 160,
              height: 160,
              borderRadius: 999,
              backgroundColor: withAlpha(ui.accent, 0.10),
            }}
          />

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 16,
                backgroundColor: ui.accentSoft2,
                borderWidth: 1,
                borderColor: withAlpha(ui.accent, 0.35),
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Ionicons name="home-outline" size={22} color={ui.accent} />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: ui.text,
                  fontSize: 16,
                  fontWeight: "900",
                }}
              >
                MissionHome
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  color: ui.muted,
                  fontSize: 12,
                  lineHeight: 16,
                }}
              >
                Kilka słów o tym, czym jest MissionHome i jak pomoże Ci w ogarnianiu domu.
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: withAlpha(ui.accent, 0.12),
                borderWidth: 1,
                borderColor: withAlpha(ui.accent, 0.35),
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "900",
                  color: ui.accent,
                  letterSpacing: 0.4,
                }}
              >
                BETA
              </Text>
            </View>
          </View>

          {/* ✅ WYWALEONE: tagi pod nazwą (Misje+rutyny/EXP/Rodzina/Plan tygodnia) */}

          {/* ✅ Mniejsze przejścia (bez pełnej szerokości) */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginTop: 10,
            }}
          >
            <ActionChip
              icon="help-circle-outline"
              label="FAQ"
              onPress={() => router.push("/faq")}
              variant="ghost"
            />
            <ActionChip
              icon="sparkles-outline"
              label="Premium"
              onPress={() => router.push("/premium")}
              variant="primary"
            />
            <ActionChip
              icon="chatbubble-ellipses-outline"
              label="Kontakt"
              onPress={() => router.push("/contact")}
              variant="ghost"
            />
          </View>
        </View>

        {/* 1. CZYM JEST */}
        <SectionCard>
          <SectionTitle
            icon="rocket-outline"
            title="1. Czym jest MissionHome?"
            subtitle="Domowe centrum dowodzenia, dla Ciebie i rodziny."
          />

          <Text
            style={{
              color: ui.text,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 10,
            }}
          >
            MissionHome to Twoje domowe centrum dowodzenia – takie, które naprawdę
            działa. Zamiast zwykłej listy „to-do” dostajesz system misji, poziomów i
            EXP, który zmienia codzienność w coś, co naprawdę chce się robić.
          </Text>

          <Bullet icon="flash-outline">
            Każde zadanie to misja, a każdy krok daje poczucie progresu.
          </Bullet>
          <Bullet icon="people-outline">
            Wspólne działanie z rodziną tworzy zgraną drużynę.
          </Bullet>
          <Bullet icon="heart-outline">
            Aplikacja wspiera dzień - nie przytłacza i nie dokłada presji.
          </Bullet>

          <View
            style={{
              height: 1,
              backgroundColor: withAlpha(ui.border, 0.9),
              marginTop: 12,
              marginBottom: 12,
            }}
          />

          <Text
            style={{
              color: ui.muted,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            Aplikacja jest w wersji beta, ale najważniejsze elementy już działają:
            misje i osiągnięcia, system EXP, wersja Premium, tworzenie rodziny i
            wspólne wsparcie. MissionHome rozwija się tydzień po tygodniu - po to,
            żeby domowe obowiązki były prostsze, bardziej intuicyjne i mniej stresujące.
          </Text>
        </SectionCard>

        {/* 2. DLA KOGO */}
        <SectionCard>
          <SectionTitle
            icon="people-outline"
            title="2. Dla kogo jest aplikacja?"
            subtitle="Jeśli ogarnianie domu wymyka się spod kontroli - to jest Twoje miejsce."
          />

          <Bullet icon="infinite-outline">
            dla par i rodzin, które chcą jasno dzielić obowiązki, zamiast kłócić się o
            to, kto znowu wynosi śmieci,
          </Bullet>
          <Bullet icon="happy-outline">
            dla rodziców, którzy chcą w prosty sposób wprowadzić dzieci w domowe zadania,
          </Bullet>
          <Bullet icon="compass-outline">
            dla osób, które lubią mieć plan i widzieć realny postęp - także w codziennych
            obowiązkach,
          </Bullet>
          <Bullet icon="sparkles-outline">
            dla tych, którzy potrzebują delikatnej motywacji do sprzątania, zmywania i
            innych „ulubionych” aktywności 😉
          </Bullet>
        </SectionCard>

        {/* 3. CO POTRAFI */}
        <SectionCard highlight>
          <SectionTitle
            icon="checkmark-done-outline"
            title="3. Co potrafi MissionHome teraz?"
            subtitle="Funkcje dostępne w wersji beta."
          />

          <Bullet icon="create-outline">
            Tworzenie zadań domowych jako misji z kategoriami, priorytetem i terminem.
          </Bullet>

          <Bullet icon="sunny-outline">
            Proponowanie misji dnia - przy pierwszym logowaniu danego dnia aplikacja podpowiada
            gotowe zadania do ogarnięcia i pomaga zacząć z energią.
          </Bullet>

          <Bullet icon="person-add-outline">
            Przydzielanie misji domownikom w ramach jednej rodziny – każdy widzi swoje zadania.
          </Bullet>

          <Bullet icon="trending-up-outline">
            Zbieranie EXP i poziomów za wykonane misje - widać progres i kto ile ogarnia.
          </Bullet>

          <Bullet icon="calendar-outline">
            Widok miesiąca, który pozwala na weryfikację zadań domowników.
          </Bullet>

          <Bullet icon="time-outline">
            Widok tygodnia, który pomaga planować sprzątanie i inne domowe sprawy.
          </Bullet>

          <Bullet icon="chatbubble-ellipses-outline">
            Wiadomości w obrębie rodziny + filtr wulgaryzmów (żeby atmosfera była normalna).
          </Bullet>
        </SectionCard>

        {/* 4. ROADMAP */}
        <SectionCard>
          <SectionTitle
            icon="sparkles-outline"
            title="4. Co planujemy dalej?"
            subtitle="Rzeczy, które są na roadmapie i będą dowożone krok po kroku."
          />

          <Bullet icon="analytics-outline">
            bardziej rozbudowane statystyki rodzinne - czytelne podsumowania podziału obowiązków,
          </Bullet>
          <Bullet icon="trophy-outline">
            wspólne cele i mini-nagrody dla domowników, żeby ogarnianie było czymś, co łączy,
          </Bullet>
          <Bullet icon="color-palette-outline">
            pełna personalizacja - kategorie, kolory, powiadomienia i widoki dopasowane do Twojego domu,
          </Bullet>
          <Bullet icon="bag-handle-outline">
            nowe tryby działania, m.in. misje sezonowe i checklisty na wyjazdy.
          </Bullet>
        </SectionCard>

        {/* 5. FEEDBACK */}
        <SectionCard>
          <SectionTitle
            icon="information-circle-outline"
            title="5. Wersja i feedback"
            subtitle="Beta oznacza jedno: Twoja opinia ma realny wpływ."
          />

          <Text
            style={{
              color: ui.text,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 10,
            }}
          >
            MissionHome rozwijamy małymi, regularnymi krokami - dlatego możesz trafić na drobne błędy
            albo elementy, które jeszcze dopieszczamy.
          </Text>

          <Bullet icon="bug-outline">
            Jeśli coś nie działa, wygląda inaczej niż powinno lub masz pomysł na usprawnienie - daj znać przez ekran kontaktu.
          </Bullet>

          <Bullet icon="thumbs-up-outline">
            Twoje uwagi pomagają podejmować lepsze decyzje i budować aplikację pod prawdziwe domy - nie pod „idealne scenariusze”.
          </Bullet>

          <View
            style={{
              height: 1,
              backgroundColor: withAlpha(ui.border, 0.9),
              marginTop: 14,
              marginBottom: 8,
            }}
          />

          <InfoRow icon="layers-outline" title="Wersja aplikacji" value="1.0.0 (beta)" />
        </SectionCard>

        {/* STOPKA */}
        <View style={{ marginTop: 4, alignItems: "center" }}>
          <Text
            style={{
              color: ui.muted,
              fontSize: 12,
              textAlign: "center",
              lineHeight: 18,
            }}
          >
            Dziękujemy, że testujesz MissionHome 💛{"\n"}
            <Text style={{ fontWeight: "800", color: ui.text }}>
              To dzięki Tobie aplikacja robi się coraz lepsza.
            </Text>
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AboutAppScreen;

// app/about-app.web.tsx
