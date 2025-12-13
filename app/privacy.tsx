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

const SectionCard = ({ children }: { children: React.ReactNode }) => {
  const { colors } = useThemeColors();

  return (
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
};

const SectionTitle = ({
  icon,
  title,
  subtitle,
}: {
  icon: any;
  title: string;
  subtitle?: string;
}) => {
  const { colors } = useThemeColors();

  return (
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
};

const Bullet = ({ children }: { children: React.ReactNode }) => {
  const { colors } = useThemeColors();

  return (
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
};

const PrivacyScreen = () => {
  const router = useRouter();
  const { colors } = useThemeColors();

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
            Niniejsza Polityka Prywatności i Cookies („Polityka”) określa zasady
            przetwarzania danych osobowych użytkowników systemu MissionHome
            („System”), dostępnego w formie aplikacji internetowej (webowej)
            oraz aplikacji mobilnej na urządzenia z systemem iOS i Android
            („Aplikacja”).
            {"\n"}
            Administratorem danych osobowych jest przedsiębiorca prowadzący
            jednoosobową działalność gospodarczą pod nazwą MissionHome, z
            siedzibą w Gdańsku (adres do uzupełnienia), NIP xxx, adres e-mail do
            kontaktu w sprawach ochrony danych osobowych: xxx („Administrator”).
            {"\n\n"}
            Administrator przetwarza dane osobowe zgodnie z Rozporządzeniem
            Parlamentu Europejskiego i Rady (UE) 2016/679 (RODO), przepisami
            dotyczącymi ochrony prywatności w łączności elektronicznej
            (cookies) oraz wytycznymi Apple App Store i Google Play.
            {"\n"}
            Korzystanie z Aplikacji jest równoznaczne z akceptacją zasad
            opisanych w niniejszym dokumencie.
          </Text>
        </SectionCard>

        {/* 2. ZAKRES */}
        <SectionCard>
          <SectionTitle
            icon="person-circle-outline"
            title="2. Zakres przetwarzanych danych osobowych"
          />

          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>
            Administrator może przetwarzać następujące kategorie danych
            osobowych:
          </Text>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Dane konta użytkownika:</Text>{" "}
            adres e-mail, zaszyfrowane hasło, identyfikator konta, data
            utworzenia konta, data ostatniego logowania.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Dane profilowe:</Text> nazwa
            profilu, avatar, konfiguracja rodziny lub domowników, role i
            uprawnienia.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Treści użytkownika:</Text>{" "}
            zadania, cele, opisy, ustawienia, kategorie, punkty EXP, poziomy,
            statystyki aktywności, historia wykonanych czynności.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Dane techniczne:</Text> typ
            urządzenia, system operacyjny, wersja aplikacji lub przeglądarki,
            identyfikator instalacji, identyfikatory aplikacyjne, strefa
            czasowa, język urządzenia, dane diagnostyczne oraz informacje o
            błędach.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>
              Dane logowania i bezpieczeństwa:
            </Text>{" "}
            adres IP (w logach bezpieczeństwa), informacje o próbach logowania,
            tokeny autoryzacyjne.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>
              Dane dotyczące Subskrypcji Premium:
            </Text>{" "}
            identyfikator transakcji, status subskrypcji, historia odnowień,
            daty obowiązywania, typ planu.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Dane komunikacyjne:</Text> treść
            zgłoszeń do obsługi użytkownika oraz prowadzona korespondencja.
          </Bullet>
        </SectionCard>

        {/* 3. CELE */}
        <SectionCard>
          <SectionTitle
            icon="sparkles-outline"
            title="3. Cele przetwarzania danych osobowych"
          />

          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>
            Dane osobowe przetwarzane są w następujących celach:
          </Text>

          <Bullet>założenie i prowadzenie konta użytkownika.</Bullet>
          <Bullet>
            świadczenie usług drogą elektroniczną i zapewnienie pełnej
            funkcjonalności Systemu.
          </Bullet>
          <Bullet>synchronizacja danych pomiędzy urządzeniami.</Bullet>
          <Bullet>realizacja, obsługa i weryfikacja Subskrypcji Premium.</Bullet>
          <Bullet>
            zapewnienie bezpieczeństwa Systemu oraz zapobieganie nadużyciom.
          </Bullet>
          <Bullet>
            analiza błędów i poprawa wydajności oraz stabilności Systemu.
          </Bullet>
          <Bullet>
            realizacja obowiązków prawnych, w szczególności księgowych i
            podatkowych.
          </Bullet>
          <Bullet>kontakt z użytkownikiem i obsługa zgłoszeń.</Bullet>
          <Bullet>
            przesyłanie informacji o nowych funkcjach lub materiałach
            edukacyjnych - wyłącznie po uzyskaniu odrębnej zgody.
          </Bullet>
        </SectionCard>

        {/* 4. PODSTAWA */}
        <SectionCard>
          <SectionTitle icon="scale-outline" title="4. Podstawy prawne przetwarzania" />

          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>
            Dane osobowe przetwarzane są na podstawie:
          </Text>

          <Bullet>
            art. 6 ust. 1 lit. b RODO – wykonanie umowy o świadczenie usług drogą
            elektroniczną,
          </Bullet>
          <Bullet>
            art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora
            (bezpieczeństwo, rozwój Systemu, obsługa błędów),
          </Bullet>
          <Bullet>
            art. 6 ust. 1 lit. c RODO – wypełnienie obowiązków prawnych,
          </Bullet>
          <Bullet>art. 6 ust. 1 lit. a RODO – zgoda użytkownika.</Bullet>
        </SectionCard>

        {/* 5. Subskrypcje Premium i płatności */}
        <SectionCard>
          <SectionTitle
            icon="star-outline"
            title="5. Subskrypcje Premium i płatności"
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
            Operatorzy płatności przetwarzą dane płatnicze jako niezależni
            administratorzy danych. Administrator otrzymuje wyłącznie informacje
            niezbędne do potwierdzenia zakupu oraz statusu Subskrypcji Premium.
          </Bullet>
          <Bullet>
            W przypadku problemów z płatnością obowiązują procedury Apple/Google.
          </Bullet>
          <Bullet>
            Dane dotyczące Premium mogą być przechowywane dla celów rozliczeniowych
            przez okres wymagany prawem.
          </Bullet>
        </SectionCard>

        {/* 6. COOKIES */}
        <SectionCard>
          <SectionTitle icon="globe-outline" title="6. Cookies i podobne technologie" />

          <Bullet>
            System MissionHome wykorzystuje pliki cookies oraz podobne technologie,
            w szczególności localStorage i sessionStorage, głównie w wersji webowej.
          </Bullet>

          <Bullet>Stosowane są następujące kategorie cookies:</Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Cookies niezbędne:</Text>{" "}
            zapewniające prawidłowe funkcjonowanie Systemu.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Cookies funkcjonalne:</Text>{" "}
            zapamiętujące preferencje i ustawienia użytkownika.
          </Bullet>

          <Bullet>
            <Text style={{ fontWeight: "700" }}>Cookies analityczne:</Text>{" "}
            umożliwiające analizę korzystania z Systemu (np. Firebase Analytics).
          </Bullet>

          <Bullet>
            Cookies analityczne są wykorzystywane wyłącznie po uzyskaniu zgody
            użytkownika. Zgoda może zostać cofnięta w dowolnym momencie za pomocą
            banera cookies lub ustawień przeglądarki.
          </Bullet>

          <Bullet>
            Aplikacje mobilne mogą wykorzystywać identyfikatory aplikacyjne oraz
            dane diagnostyczne zgodnie z zasadami iOS i Android.
          </Bullet>
        </SectionCard>

        {/* 7. KOMU */}
        <SectionCard>
          <SectionTitle icon="cloud-outline" title="7. Odbiorcy danych osobowych" />

          <Bullet>
            Dostawcom usług chmurowych i infrastrukturalnych (Firebase / Google Cloud).
          </Bullet>
          <Bullet>Operatorom płatności (Apple, Google, Stripe).</Bullet>
          <Bullet>
            Podmiotom świadczącym usługi analityczne w formie anonimowej lub
            zanonimizowanej.
          </Bullet>
          <Bullet>
            Organom publicznym – wyłącznie w zakresie wymaganym przepisami prawa.
          </Bullet>
          <Bullet>
            Wszyscy odbiorcy danych przetwarzają je na podstawie odpowiednich umów
            lub obowiązujących przepisów prawa.
          </Bullet>
        </SectionCard>

        {/* 8. TRANSFER */}
        <SectionCard>
          <SectionTitle
            icon="earth-outline"
            title="8. Transfer danych poza Europejski Obszar Gospodarczy"
          />

          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>
            Dane osobowe mogą być przetwarzane poza Europejskim Obszarem Gospodarczym.
            W takich przypadkach Administrator stosuje odpowiednie zabezpieczenia,
            w szczególności standardowe klauzule umowne zatwierdzone przez Komisję
            Europejską.
          </Text>
        </SectionCard>

        {/* 9. OKRES */}
        <SectionCard>
          <SectionTitle icon="time-outline" title="9. Okres przechowywania danych" />

          <Bullet>Dane konta użytkownika – przez okres korzystania z Systemu.</Bullet>
          <Bullet>
            Dane po usunięciu konta – usuwane lub anonimizowane; kopie zapasowe mogą
            być przechowywane do 30 dni.
          </Bullet>
          <Bullet>
            Dane rozliczeniowe – przez okres wymagany przepisami prawa.
          </Bullet>
          <Bullet>
            Dane techniczne i bezpieczeństwa – przez okres niezbędny do zapewnienia
            bezpieczeństwa Systemu.
          </Bullet>
        </SectionCard>

        {/* 10. PRAWA */}
        <SectionCard>
          <SectionTitle icon="key-outline" title="10. Prawa użytkownika" />

          <Bullet>Prawo dostępu do danych osobowych.</Bullet>
          <Bullet>Prawo do ich sprostowania.</Bullet>
          <Bullet>Prawo do usunięcia danych.</Bullet>
          <Bullet>Prawo do ograniczenia przetwarzania.</Bullet>
          <Bullet>Prawo do przenoszenia danych.</Bullet>
          <Bullet>Prawo do wniesienia sprzeciwu.</Bullet>
          <Bullet>Prawo do cofnięcia zgody w dowolnym momencie.</Bullet>

          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>
            Użytkownik ma również prawo wniesienia skargi do Prezesa Urzędu Ochrony
            Danych Osobowych.
          </Text>
        </SectionCard>

        {/* 11. BEZPIECZEŃSTWO */}
        <SectionCard>
          <SectionTitle icon="lock-closed-outline" title="11. Bezpieczeństwo danych osobowych" />

          <Bullet>Szyfrowanie transmisji danych.</Bullet>
          <Bullet>Mechanizmy uwierzytelniania Firebase Authentication.</Bullet>
          <Bullet>Ograniczenie dostępu do danych wyłącznie do upoważnionych osób.</Bullet>
          <Bullet>Monitorowanie logowań i prób naruszeń bezpieczeństwa.</Bullet>
          <Bullet>Regularne tworzenie kopii zapasowych.</Bullet>
        </SectionCard>

        {/* 12. DZIECI */}
        <SectionCard>
          <SectionTitle icon="happy-outline" title="12. Korzystanie z Systemu przez dzieci" />

          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>
            System MissionHome nie jest przeznaczony dla dzieci poniżej 13 roku życia.
            Administrator nie przetwarza świadomie danych takich osób. W przypadku
            uzyskania informacji o przetwarzaniu danych dziecka poniżej 13 roku życia
            dane zostaną niezwłocznie usunięte.
          </Text>
        </SectionCard>

        {/* 13. ZMIANY */}
        <SectionCard>
          <SectionTitle icon="refresh-outline" title="13. Zmiany Polityki Prywatności i Cookies" />

          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>
            Administrator może aktualizować niniejszą Politykę w związku z rozwojem
            Systemu lub zmianami przepisów prawa. O istotnych zmianach użytkownicy
            zostaną poinformowani w Systemie.
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
            <Text style={{ fontWeight: "700", color: colors.text }}>2025-12-13</Text>
            .
            {"\n"}
            Pełna, rozszerzona wersja polityki prywatności przekazana do weryfikacji
            prawnej.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default PrivacyScreen;

// app/privacy.tsx
