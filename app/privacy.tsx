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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
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
              Jak MissionHome dba o Twoje dane i bezpieczeństwo korzystania.
            </Text>
          </View>
        </View>

        {/* 1. OGÓLNE INFORMACJE */}
        <SectionCard>
          <SectionTitle
            icon="shield-checkmark-outline"
            title="1. Informacje ogólne"
            subtitle="Kto odpowiada za Twoje dane i dlaczego są one przetwarzane."
          />

          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>
            Niniejsza Polityka Prywatności opisuje zasady przetwarzania danych
            osobowych użytkowników aplikacji MissionHome („Aplikacja”).
            Przetwarzamy wyłącznie taką ilość danych, jaka jest niezbędna do
            świadczenia usług, rozwoju funkcjonalności oraz zapewniania
            bezpieczeństwa.
            {"\n\n"}
            Korzystanie z Aplikacji jest równoznaczne z akceptacją zasad
            opisanych w niniejszym dokumencie. Polityka ma charakter pełny i
            stanowi opis praktyk zgodnych z wymaganiami RODO oraz zasadami
            Apple App Store i Google Play.
          </Text>
        </SectionCard>

        {/* 2. JAKIE DANE PRZETWARZAMY */}
        <SectionCard>
          <SectionTitle icon="person-circle-outline" title="2. Jakie dane przetwarzamy?" />

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Dane konta użytkownika:</Text>{" "}
            adres e-mail, zaszyfrowane hasło, identyfikator konta, data
            utworzenia konta, data ostatniego logowania.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Dane profilowe:</Text> nazwa
            profilu, avatar, konfiguracja rodziny/domowników, role i uprawnienia
            w ramach rodziny.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Treści zapisane w Aplikacji:</Text>{" "}
            stworzone zadania, ustawienia, kategorie, punkty EXP, poziomy,
            statystyki aktywności, historia wykonanych czynności.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Dane techniczne:</Text> typ
            urządzenia, system operacyjny, wersja aplikacji, identyfikator
            instalacji, strefa czasowa, język urządzenia, informacje o błędach
            oraz dane diagnostyczne.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Dane logowania i bezpieczeństwa:</Text>{" "}
            adres IP (w logach bezpieczeństwa), informacje o próbach logowania,
            tokeny autoryzacyjne.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Dane płatności Premium:</Text>{" "}
            identyfikator transakcji, status subskrypcji, historia odnowień,
            daty ważności, typ planu, informacje przekazane przez Google Play
            lub Apple App Store.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Dane komunikacji:</Text> treść
            zgłoszeń wysłanych do obsługi i odpowiedzi udzielonych użytkownikowi.
          </Bullet>
        </SectionCard>

        {/* 3. CELE */}
        <SectionCard>
          <SectionTitle icon="sparkles-outline" title="3. W jakich celach przetwarzamy dane?" />

          <Bullet>Umożliwienie założenia konta i logowania do Aplikacji.</Bullet>
          <Bullet>
            Zapewnienie pełnej funkcjonalności Aplikacji, w tym synchronizacji
            danych pomiędzy urządzeniami.
          </Bullet>
          <Bullet>
            Obsługa i weryfikacja subskrypcji Premium oraz wykrywanie
            nieautoryzowanych prób korzystania.
          </Bullet>
          <Bullet>
            Analiza błędów, ulepszanie wydajności i stabilności Aplikacji.
          </Bullet>
          <Bullet>
            Zapewnianie bezpieczeństwa, identyfikacja nadużyć, ochrona kont
            użytkowników przed nieautoryzowanym dostępem.
          </Bullet>
          <Bullet>
            W celach podatkowych i rozliczeniowych związanych z Premium.
          </Bullet>
          <Bullet>
            Kontakt z użytkownikiem, w tym odpowiadanie na zgłoszenia.
          </Bullet>
          <Bullet>
            Jeśli użytkownik wyrazi zgodę – przesyłanie informacji o nowych
            funkcjach lub materiałach edukacyjnych.
          </Bullet>
        </SectionCard>

        {/* 4. PODSTAWA */}
        <SectionCard>
          <SectionTitle
            icon="scale-outline"
            title="4. Podstawy prawne przetwarzania"
          />

          <Bullet>
            Art. 6 ust. 1 lit. b RODO – wykonanie umowy polegającej na
            umożliwieniu korzystania z Aplikacji.
          </Bullet>
          <Bullet>
            Art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes, w
            szczególności zapewnienie bezpieczeństwa, rozwój Aplikacji, obsługa
            błędów.
          </Bullet>
          <Bullet>
            Art. 6 ust. 1 lit. c RODO – obowiązki prawne (np. podatkowe dotyczące
            subskrypcji Premium).
          </Bullet>
          <Bullet>
            Art. 6 ust. 1 lit. a RODO – zgoda (np. na powiadomienia o nowościach,
            jeśli zostaną wprowadzone).
          </Bullet>
        </SectionCard>

        {/* 5. PREMIUM */}
        <SectionCard>
          <SectionTitle
            icon="star-outline"
            title="5. Subskrypcje Premium"
            subtitle="Jak przetwarzamy dane związane z płatnościami?"
          />

          <Bullet>
            Płatności są realizowane wyłącznie przez Apple App Store i Google
            Play Store – zgodnie z ich regulaminami.
          </Bullet>
          <Bullet>
            MissionHome otrzymuje wyłącznie informacje niezbędne do
            potwierdzenia zakupu: identyfikator transakcji, status subskrypcji,
            daty obowiązywania.
          </Bullet>
          <Bullet>
            Nigdy nie przetwarzamy numerów kart, danych bankowych ani danych
            płatniczych użytkowników.
          </Bullet>
          <Bullet>
            W przypadku problemów z płatnością obowiązują procedury Apple/Google.
          </Bullet>
          <Bullet>
            Dane dotyczące Premium mogą być przechowywane dla celów
            rozliczeniowych przez okres wymagany prawem.
          </Bullet>
        </SectionCard>

        {/* 6. KOMU */}
        <SectionCard>
          <SectionTitle
            icon="cloud-outline"
            title="6. Komu udostępniamy dane?"
          />

          <Bullet>
            Dostawcom usług chmurowych (np. Firebase/Google Cloud), którzy
            świadczą usługi przetwarzania danych na podstawie umowy powierzenia.
          </Bullet>
          <Bullet>
            Apple i Google – w zakresie niezbędnym do obsługi płatności oraz
            zgodnie z zasadami App Store / Google Play.
          </Bullet>
          <Bullet>
            Narzędziom analitycznym – wyłącznie w formie anonimowej lub
            zanonimizowanej.
          </Bullet>
          <Bullet>
            Organom publicznym – wyłącznie jeśli wynika to z obowiązku prawnego.
          </Bullet>
        </SectionCard>

        {/* 7. MIEJSCE */}
        <SectionCard>
          <SectionTitle icon="earth-outline" title="7. Gdzie przetwarzane są dane?" />

          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>
            Dane mogą być przetwarzane na terenie Europejskiego Obszaru
            Gospodarczego oraz poza nim. Jeśli dane trafiają poza EOG,
            zapewniane są odpowiednie zabezpieczenia zgodne z RODO, np.
            standardowe klauzule umowne.
          </Text>
        </SectionCard>

        {/* 8. CZAS */}
        <SectionCard>
          <SectionTitle icon="time-outline" title="8. Jak długo przechowujemy dane?" />

          <Bullet>
            Dane konta – przez cały okres korzystania z Aplikacji.
          </Bullet>
          <Bullet>
            Po usunięciu konta dane są usuwane lub anonimizowane, a kopie
            zapasowe mogą istnieć do 30 dni.
          </Bullet>
          <Bullet>
            Dane rozliczeniowe – zgodnie z obowiązkami podatkowymi (np. 5 lat).
          </Bullet>
          <Bullet>
            Dane techniczne – zgodnie z potrzebą monitorowania bezpieczeństwa.
          </Bullet>
        </SectionCard>

        {/* 9. PRAWA */}
        <SectionCard>
          <SectionTitle icon="key-outline" title="9. Twoje prawa" />

          <Bullet>Dostęp do danych i ich kopii.</Bullet>
          <Bullet>Poprawianie danych nieprawidłowych.</Bullet>
          <Bullet>Usunięcie danych (prawo do bycia zapomnianym).</Bullet>
          <Bullet>Ograniczenie przetwarzania.</Bullet>
          <Bullet>Przenoszenie danych.</Bullet>
          <Bullet>Sprzeciw wobec przetwarzania.</Bullet>

          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>
            Aby skorzystać ze swoich praw, odwiedź zakładkę{" "}
            <LinkLike label="Kontakt" onPress={() => router.push("/contact")} />.
          </Text>
        </SectionCard>

        {/* 10. BEZPIECZEŃSTWO */}
        <SectionCard>
          <SectionTitle icon="lock-closed-outline" title="10. Jak chronimy Twoje dane?" />

          <Bullet>Szyfrowanie danych przesyłanych między urządzeniem a serwerem.</Bullet>
          <Bullet>Regularne kopie zapasowe danych.</Bullet>
          <Bullet>Ograniczenie dostępu do danych tylko do uprawnionych osób.</Bullet>
          <Bullet>Zabezpieczenia anty-botowe i system wykrywania nadużyć.</Bullet>
          <Bullet>Monitorowanie logowań i prób nieautoryzowanego dostępu.</Bullet>
        </SectionCard>

        {/* 11. DZIECI */}
        <SectionCard>
          <SectionTitle icon="happy-outline" title="11. Korzystanie przez dzieci" />

          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>
            MissionHome nie jest przeznaczone dla dzieci poniżej 13 roku życia.
            Nie zbieramy świadomie danych dzieci w tym wieku. Jeśli poweźmiemy
            informację, że takie dane zostały zebrane – usuwamy je.
          </Text>
        </SectionCard>

        {/* 12. ZMIANY */}
        <SectionCard>
          <SectionTitle icon="refresh-outline" title="12. Zmiany w polityce prywatności" />

          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>
            Polityka może ulec zmianie wraz z rozwojem Aplikacji oraz zmianami
            prawa. O istotnych aktualizacjach poinformujemy w Aplikacji.
          </Text>
        </SectionCard>

        {/* FOOTER */}
        <View style={{ marginTop: 4, alignItems: "center" }}>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            Ostatnia aktualizacja:{" "}
            <Text style={{ fontWeight: "700", color: colors.text }}>
              2025-12-05
            </Text>
            .
            {"\n"}
            Pełna, rozszerzona wersja polityki prywatności przekazana do weryfikacji prawnej.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default PrivacyScreen;
