// app/rules.tsx
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

const RulesScreen = () => {
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

  const LinkLike = ({
    label,
    onPress,
  }: {
    label: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Text
        style={{
          color: colors.accent,
          fontSize: 13,
          fontWeight: "700",
          textDecorationLine: "underline",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
              Regulamin
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                marginTop: 2,
              }}
            >
              Zasady korzystania z MissionHome w wersji przyjaznej dla
              normalnych ludzi, nie tylko dla prawników.
            </Text>
          </View>
        </View>

        {/* 1. POSTANOWIENIA OGÓLNE */}
        <SectionCard>
          <SectionTitle
            icon="book-outline"
            title="1. Postanowienia ogólne"
            subtitle="Co właściwie regulujemy w tym miejscu."
          />

          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 6,
            }}
          >
            Niniejszy regulamin określa zasady korzystania z aplikacji
            MissionHome. Akceptując regulamin, zgadzasz się na opisane tutaj
            zasady korzystania z aplikacji.
          </Text>

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            Treść na tym ekranie ma charakter roboczy i może zostać zastąpiona
            pełną wersją regulaminu przygotowaną we współpracy z prawnikiem.
          </Text>
        </SectionCard>

        {/* 2. KORZYSTANIE Z APLIKACJI */}
        <SectionCard>
          <SectionTitle
            icon="home-outline"
            title="2. Korzystanie z aplikacji"
          />

          <Bullet>
            Aplikacja MissionHome służy do organizowania domowych zadań,
            obowiązków i postępów użytkowników – w formie misji, poziomów i EXP.
          </Bullet>
          <Bullet>
            Korzystasz z aplikacji dobrowolnie. Możesz w każdej chwili
            zaprzestać korzystania i usunąć swoje konto.
          </Bullet>
          <Bullet>
            Zobowiązujesz się korzystać z aplikacji w sposób zgodny z prawem,
            regulaminem oraz dobrymi obyczajami – bez nadużyć, spamu i
            wykorzystywania aplikacji do celów niezgodnych z jej przeznaczeniem.
          </Bullet>
        </SectionCard>

        {/* 3. KONTO UŻYTKOWNIKA */}
        <SectionCard>
          <SectionTitle
            icon="person-circle-outline"
            title="3. Konto użytkownika"
          />

          <Bullet>
            Do korzystania z części funkcji konieczne jest utworzenie konta
            (np. poprzez adres e-mail lub inne wspierane metody logowania).
          </Bullet>
          <Bullet>
            Jesteś odpowiedzialna/y za utrzymanie poufności danych logowania i
            nieudostępnianie konta osobom trzecim.
          </Bullet>
          <Bullet>
            Twórcy aplikacji mogą zablokować lub usunąć konto w przypadku
            poważnego naruszenia regulaminu, prób nadużyć lub działań
            zagrażających bezpieczeństwu innych użytkowników.
          </Bullet>
        </SectionCard>

        {/* 4. WERSJA PREMIUM / PŁATNOŚCI (PLACEHOLDER) */}
        <SectionCard>
          <SectionTitle
            icon="star-outline"
            title="4. Subskrypcja i funkcje premium"
            subtitle="Jeśli w przyszłości pojawią się płatne plany."
          />

          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 6,
            }}
          >
            MissionHome może w przyszłości oferować płatne funkcje lub plany
            subskrypcyjne. Szczegółowe zasady (okres rozliczeniowy, cena,
            warunki anulowania) będą widoczne przed dokonaniem płatności i mogą
            zostać uzupełnione w pełnej wersji regulaminu.
          </Text>

          <Bullet>
            Informacje o cenach i warunkach subskrypcji będą prezentowane w
            aplikacji w sposób jasny i zrozumiały.
          </Bullet>
          <Bullet>
            W przypadku płatności realizowanych przez zewnętrznych dostawców
            (np. Google Play, App Store), obowiązują również regulaminy tych
            platform.
          </Bullet>
        </SectionCard>

        {/* 5. OBOWIĄZKI UŻYTKOWNIKA */}
        <SectionCard>
          <SectionTitle
            icon="checkmark-done-outline"
            title="5. Obowiązki użytkownika"
          />

          <Bullet>
            Podajesz prawdziwe dane w zakresie niezbędnym do korzystania z
            aplikacji (np. poprawny adres e-mail do logowania).
          </Bullet>
          <Bullet>
            Nie podejmujesz działań mających na celu zakłócenie działania
            aplikacji, omijanie zabezpieczeń, testowanie luk bezpieczeństwa bez
            wcześniejszej zgody twórców.
          </Bullet>
          <Bullet>
            Nie wykorzystujesz aplikacji do treści bezprawnych, obraźliwych lub
            naruszających dobra osobiste innych osób.
          </Bullet>
        </SectionCard>

        {/* 6. ODPOWIEDZIALNOŚĆ */}
        <SectionCard>
          <SectionTitle
            icon="warning-outline"
            title="6. Odpowiedzialność i ograniczenia"
          />

          <Bullet>
            Twórcy aplikacji dokładają starań, aby MissionHome działała
            stabilnie i bezpiecznie, jednak nie mogą zagwarantować pełnej
            bezawaryjności.
          </Bullet>
          <Bullet>
            Nie ponosimy odpowiedzialności za skutki niewłaściwego korzystania
            z aplikacji (np. za spory domowe o to, kto miał wynieść śmieci 😉).
          </Bullet>
          <Bullet>
            W przypadku awarii lub błędów mogą wystąpić czasowe utrudnienia w
            dostępie do aplikacji lub utrata części danych. Zawsze staramy się
            minimalizować takie sytuacje.
          </Bullet>
        </SectionCard>

        {/* 7. ZMIANY REGULAMINU */}
        <SectionCard>
          <SectionTitle
            icon="refresh-outline"
            title="7. Zmiany regulaminu"
          />

          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 6,
            }}
          >
            Regulamin może być aktualizowany wraz z rozwojem aplikacji i
            wprowadzaniem nowych funkcji.
          </Text>

          <Bullet>
            O istotnych zmianach regulaminu poinformujemy Cię w aplikacji lub
            innym wyraźnym kanałem komunikacji.
          </Bullet>
          <Bullet>
            Dalsze korzystanie z aplikacji po wejściu w życie zmian oznacza ich
            akceptację.
          </Bullet>
        </SectionCard>

        {/* 8. KONTAKT W SPRAWIE REGULAMINU */}
        <SectionCard>
          <SectionTitle
            icon="chatbubble-ellipses-outline"
            title="8. Kontakt w sprawie regulaminu"
          />

          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 6,
            }}
          >
            Jeśli masz wątpliwości dotyczące regulaminu albo chcesz dopytać o
            konkretne zapisy, możesz napisać do nas.
          </Text>

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              marginBottom: 4,
            }}
          >
            Najprościej skontaktować się przez ekran:
          </Text>

          <LinkLike
            label="Przejdź do kontaktu"
            onPress={() => router.push("/contact")}
          />
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
            Ostatnia aktualizacja:{" "}
            <Text style={{ fontWeight: "700", color: colors.text }}>
              2025-11-29
            </Text>
            .{"\n"}
            Ten tekst może zostać zastąpiony pełnym regulaminem przygotowanym
            przez prawnika – layout ekranu jest już gotowy.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default RulesScreen;
