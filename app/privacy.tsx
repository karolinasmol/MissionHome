// app/privacy.tsx
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

const PrivacyScreen = () => {
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
              Polityka prywatności
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                marginTop: 2,
              }}
            >
              Jak MissionHome dba o Twoje dane i bezpieczeństwo korzystania z
              aplikacji.
            </Text>
          </View>
        </View>

        {/* OGÓLNE INFO */}
        <SectionCard>
          <SectionTitle
            icon="shield-checkmark-outline"
            title="1. Informacje ogólne"
            subtitle="Krótko o tym, kto odpowiada za Twoje dane w MissionHome."
          />

          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 8,
            }}
          >
            Ta polityka opisuje, w jaki sposób przetwarzamy dane użytkowników
            aplikacji MissionHome. Dbamy o to, żeby ilość zbieranych danych
            była minimalna, a sposób ich wykorzystania – przejrzysty.
          </Text>

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            Ten ekran ma charakter informacyjny i nie stanowi jeszcze pełnego,
            prawniczego dokumentu. Docelowa treść polityki może zostać
            uzupełniona i zaktualizowana.
          </Text>
        </SectionCard>

        {/* JAKIE DANE */}
        <SectionCard>
          <SectionTitle
            icon="person-circle-outline"
            title="2. Jakie dane przetwarzamy?"
          />

          <Bullet>
            Dane konta potrzebne do logowania – np. adres e-mail, hasło (w
            formie zaszyfrowanej) oraz identyfikator użytkownika w systemie
            logowania.
          </Bullet>
          <Bullet>
            Dane profilowe dobrowolnie podane przez Ciebie – np. nazwa profilu,
            avatar, nazwa rodziny/domowników.
          </Bullet>
          <Bullet>
            Dane związane z korzystaniem z aplikacji – zapisane zadania,
            konfiguracja rodziny, ustawienia powiadomień, poziom i zdobyty EXP.
          </Bullet>
          <Bullet>
            Podstawowe dane techniczne – np. typ urządzenia, wersja aplikacji;
            wykorzystujemy je głównie do diagnozowania błędów i poprawy
            działania MissionHome.
          </Bullet>
        </SectionCard>

        {/* W JAKIM CELU */}
        <SectionCard>
          <SectionTitle
            icon="sparkles-outline"
            title="3. W jakim celu wykorzystujemy Twoje dane?"
          />

          <Bullet>Umożliwienie działania aplikacji i logowania do konta.</Bullet>
          <Bullet>
            Zapisywanie Twoich zadań, postępów i ustawień w różnych
            urządzeniach (synchronizacja przez chmurę).
          </Bullet>
          <Bullet>
            Utrzymanie bezpieczeństwa – zapobieganie nadużyciom, próbom
            włamania oraz przywracanie danych w razie awarii.
          </Bullet>
          <Bullet>
            Rozwój MissionHome – anonimowe statystyki pomagają lepiej zrozumieć,
            które funkcje są używane i co warto ulepszyć.
          </Bullet>
        </SectionCard>

        {/* PODSTAWA PRAWNA / OKRES */}
        <SectionCard>
          <SectionTitle
            icon="scale-outline"
            title="4. Podstawa przetwarzania i czas przechowywania"
          />

          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 6,
            }}
          >
            Dane przetwarzamy przede wszystkim w celu realizacji usługi, czyli
            umożliwienia Ci korzystania z aplikacji MissionHome.
          </Text>

          <Bullet>
            Dane konta przechowujemy tak długo, jak korzystasz z aplikacji.
          </Bullet>
          <Bullet>
            Po usunięciu konta część danych może być przechowywana jeszcze
            przez ograniczony czas – np. w kopiach zapasowych lub w celach
            rozliczeniowych / bezpieczeństwa.
          </Bullet>
        </SectionCard>

        {/* TWOJE PRAWA */}
        <SectionCard>
          <SectionTitle
            icon="key-outline"
            title="5. Twoje prawa"
            subtitle="Niezależnie od prawniczych szczegółów – to są praktyczne rzeczy, które możesz zrobić."
          />

          <Bullet>
            Masz prawo wglądu w dane, które są z Tobą powiązane w aplikacji.
          </Bullet>
          <Bullet>
            Możesz poprosić o poprawienie danych, jeśli są nieaktualne lub
            błędne (np. adres e-mail).
          </Bullet>
          <Bullet>
            Możesz poprosić o usunięcie konta i powiązanych z nim danych –
            część z nich może zostać zanonimizowana lub zachowana tylko w
            niezbędnym zakresie.
          </Bullet>
          <Bullet>
            Możesz sprzeciwić się wykorzystaniu danych do określonych celów –
            np. do komunikacji marketingowej, jeśli kiedyś taka się pojawi.
          </Bullet>

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              marginTop: 10,
            }}
          >
            Jeśli chcesz skorzystać ze swoich praw, najlepiej napisz do nas
            poprzez zakładkę{" "}
            <LinkLike label="Kontakt" onPress={() => router.push("/contact")} />.
          </Text>
        </SectionCard>

        {/* PRZEKAZYWANIE DANYCH / PODMIOTY */}
        <SectionCard>
          <SectionTitle
            icon="cloud-outline"
            title="6. Gdzie przechowujemy Twoje dane?"
          />

          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 6,
            }}
          >
            MissionHome korzysta z zewnętrznych usług chmurowych (np. rozwiązań
            typu Firebase) do przechowywania danych i obsługi logowania.
          </Text>

          <Bullet>
            Dostawcy infrastruktury mają własne, wysokie standardy bezpieczeństwa
            oraz certyfikacje.
          </Bullet>
          <Bullet>
            Dane mogą być przechowywane na serwerach znajdujących się w różnych
            krajach, przy zachowaniu standardów ochrony danych wymaganych
            przez prawo.
          </Bullet>
        </SectionCard>

        {/* ZMIANY */}
        <SectionCard>
          <SectionTitle
            icon="refresh-outline"
            title="7. Zmiany tej polityki"
          />

          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              lineHeight: 19,
              marginBottom: 4,
            }}
          >
            MissionHome rozwija się razem z Tobą – dlatego polityka prywatności
            może się zmieniać wraz z nowymi funkcjami aplikacji.
          </Text>

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
            }}
          >
            Gdy wprowadzimy istotne zmiany, poinformujemy Cię o tym wewnątrz
            aplikacji lub w inny wyraźny sposób.
          </Text>
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
            Ten tekst może być punktem wyjścia do pełnej, prawniczej wersji
            polityki prywatności.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default PrivacyScreen;
