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
        marginBottom: 18,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {children}
    </View>
  );

  const SectionTitle = ({ title }: { title: string }) => (
    <View style={{ marginBottom: 8 }}>
      <Text
        style={{
          color: colors.text,
          fontSize: 16,
          fontWeight: "800",
        }}
      >
        {title}
      </Text>
    </View>
  );

  const P = ({ children }: { children: React.ReactNode }) => (
    <Text
      style={{
        color: colors.text,
        fontSize: 13,
        lineHeight: 20,
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
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
              Regulamin
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                marginTop: 2,
              }}
            >
              Pełny regulamin korzystania z aplikacji MissionHome.
            </Text>
          </View>
        </View>

        {/* §1 INFORMACJE OGÓLNE */}
        <SectionCard>
          <SectionTitle title="§1. Informacje ogólne" />

          <P>
            1. Niniejszy regulamin („Regulamin”) określa zasady korzystania z aplikacji mobilnej
            MissionHome („Aplikacja”), świadczonej drogą elektroniczną przez przedsiębiorcę
            prowadzącego jednoosobową działalność gospodarczą pod nazwą MissionHome, z siedzibą
            w Gdańsku (adres do uzupełnienia), NIP xxx, adres kontaktowy: xxx („Usługodawca”).
          </P>

          <P>
            2. Aplikacja umożliwia organizację zadań domowych, planowanie obowiązków, współpracę
            w rodzinnych grupach użytkowników oraz korzystanie z systemu misji,
            poziomów i punktów doświadczenia (EXP).
          </P>

          <P>
            3. Aplikacja dostępna jest za pośrednictwem sklepów Google Play i Apple App Store.
          </P>

          <P>
            4. Korzystając z Aplikacji, Użytkownik akceptuje Regulamin oraz Politykę Prywatności i Cookies.
          </P>

          <P>
            5. Usługodawca jest administratorem danych osobowych Użytkowników w rozumieniu RODO.
         </P>
        </SectionCard>

        {/* §2 DEFINICJE */}
        <SectionCard>
          <SectionTitle title="§2. Definicje" />

          <P>
            <Text style={{ fontWeight: "700" }}>1. Aplikacja</Text> - oprogramowanie
            mobilne MissionHome udostępniane Użytkownikom.
          </P>

          <P>
            <Text style={{ fontWeight: "700" }}>2. Użytkownik</Text> - osoba
            fizyczna korzystająca z Aplikacji.
          </P>

          <P>
            <Text style={{ fontWeight: "700" }}>3. Konto</Text> - indywidualny
            profil Użytkownika tworzony w ramach Aplikacji.
          </P>

          <P>
            <Text style={{ fontWeight: "700" }}>4. Usługi</Text> - funkcje
            dostępne w Aplikacji, zarówno bezpłatne, jak i płatne (Premium).
          </P>

          <P>
            <Text style={{ fontWeight: "700" }}>5. Subskrypcja</Text> - płatna
            usługa Premium odnawiana automatycznie co miesiąc lub rok, zakupiona
            za pośrednictwem Google Play lub Apple App Store.
          </P>

          <P>
            <Text style={{ fontWeight: "700" }}>6. Rodzina</Text> - grupa
            Użytkowników współdzielących funkcje Aplikacji w ramach Subskrypcji.
          </P>

          <P>
            <Text style={{ fontWeight: "700" }}>7. Treści Użytkownika</Text> -
            wszelkie treści dodawane w Aplikacji przez Użytkownika, takie jak
            zadania, wpisy, opisy, zdjęcia, komentarze.
          </P>

          <P>
            <Text style={{ fontWeight: "700" }}>8. Usługi Zewnętrzne</Text> -
            usługi firm trzecich wykorzystywane przez Aplikację, w szczególności Firebase
            (Google LLC) oraz Stripe (Stripe Payments Europe, Ltd.).
          </P>

          <P>
           <Text style={{ fontWeight: "700" }}>9. Dane Techniczne</Text> -
            dane zbierane automatycznie, w tym adres IP, identyfikatory urządzeń, dane o błędach,
            statystyki użycia Aplikacji.
          </P>
        </SectionCard>

        {/* §3 WARUNKI TECHNICZNE KORZYSTANIA */}
        <SectionCard>
          <SectionTitle title="§3. Warunki techniczne korzystania" />

          <P>
            1. Do korzystania z Aplikacji wymagane jest urządzenie mobilne z
            systemem Android lub iOS oraz aktywne połączenie z Internetem.
          </P>

          <P>
            2. Usługodawca nie ponosi odpowiedzialności za niesprawność urządzenia
            Użytkownika ani brak dostępu do Internetu.
          </P>

          <P>
            3. Aplikacja może ulegać aktualizacjom, które mogą wpływać na sposób jej
            działania lub dostępne funkcje.
          </P>

          <P>
            4. Aplikacja może wymagać pobrania aktualizacji. Brak instalacji aktualizacji może
            skutkować ograniczeniem działania Aplikacji..
          </P>

          <P>
            5. Usługodawca nie ponosi odpowiedzialności za przerwy spowodowane działaniem
            siły wyższej, awarią dostawców usług, problemami po stronie Firebase, Stripe, Google lub Apple.
          </P>
        </SectionCard>
        {/* §4 ZAWARCIE I ROZWIĄZANIE UMOWY */}
        <SectionCard>
          <SectionTitle title="§4. Zawarcie i rozwiązanie umowy" />

          <P>
            1. Umowa o świadczenie usług drogą elektroniczną zostaje zawarta
            z chwilą rozpoczęcia korzystania z Aplikacji przez Użytkownika,
            w tym instalacji lub założenia Konta.
          </P>

          <P>
            2. Umowa o świadczenie usługi Premium (Subskrypcji) zostaje zawarta
            z chwilą zakupu Subskrypcji za pośrednictwem Google Play lub
            Apple App Store, zgodnie z regulaminami tych platform.
          </P>

          <P>
            3. Użytkownik może zakończyć korzystanie z Aplikacji poprzez jej odinstalowanie lub
            usunięcie Konta, co równoznaczne jest z rozwiązaniem umowy o świadczenie usług bezpłatnych.
          </P>

          <P>
            4. Usługodawca może rozwiązać umowę lub zablokować Konto Użytkownika,
            jeśli ten:
            - narusza Regulamin,
            - działa na szkodę innych Użytkowników lub Usługodawcy,
            - próbuje obejść system płatności Premium,
            - wykorzystuje Aplikację niezgodnie z jej przeznaczeniem.
          </P>

          <P>
            5. Użytkownik może usunąć Konto w ustawieniach Aplikacji.
            Usunięcie Konta jest nieodwracalne.
          </P>

          <P>
            6. Usługodawca może odmówić założenia Konta lub je usunąć w przypadku podania
            fałszywych danych lub naruszenia prawa.
          </P>
        </SectionCard>

        {/* §5 KONTO UŻYTKOWNIKA */}
        <SectionCard>
          <SectionTitle title="§5. Konto użytkownika" />

          <P>
            1. Użytkownik jest zobowiązany do podania prawdziwych, aktualnych
            danych podczas zakładania Konta, jeśli są wymagane.
          </P>

          <P>
            2. Użytkownik odpowiada za bezpieczeństwo danych logowania
            i nie powinien ich udostępniać osobom trzecim.
          </P>

          <P>
            3. Użytkownik ponosi odpowiedzialność za wszelkie działania
            wykonywane za pomocą jego Konta.
          </P>

          <P>
            4. Usługodawca może czasowo zawiesić lub trwale usunąć Konto
            naruszające Regulamin lub prawo.
          </P>

          <P>
            5. Użytkownik ma możliwość eksportu danych, jeśli funkcja ta jest dostępna.
          </P>

          <P>
            6. W przypadku utraty dostępu do Konta Użytkownik korzysta z procedury odzyskiwania
            dostępu oferowanej przez Firebase Authentication.
          </P>
        </SectionCard>

        {/* §6 FUNKCJE APLIKACJI */}
        <SectionCard>
          <SectionTitle title="§6. Funkcje Aplikacji" />

          <P>
            1. Aplikacja umożliwia korzystanie z funkcji takich jak:
            - tworzenie zadań i obowiązków,
            - planowanie misji i celów,
            - otrzymywanie propozycji codziennych zadań,
            - zdobywanie punktów doświadczenia (EXP),
            - rywalizacja w rankingach,
            - tworzenie Rodzin i zarządzanie ich członkami
            - konwersacje tekstowe z członkami Rodziny.
          </P>

          <P>
            2. Usługodawca może rozwijać, modyfikować lub usuwać funkcje Aplikacji,
            jeśli wymaga tego bezpieczeństwo, prawo lub względy techniczne.
          </P>

          <P>
            3. Niektóre funkcje są dostępne wyłącznie dla Użytkowników Premium.
          </P>

          <P>
            4. Usługodawca może oferować testowe funkcje Premium.
          </P>

          <P>
            5. Funkcje analityczne Aplikacji mogą wykorzystywać Firebase Analytics.
          </P>
        </SectionCard>

        {/* §7 FUNKCJE PREMIUM / SUBSKRYPCJE */}
        <SectionCard>
          <SectionTitle title="§7. Subskrypcja Premium" />

          <P>
            1. Funkcje Premium dostępne są w modelu Subskrypcji miesięcznej
            lub rocznej, odnawianej automatycznie, chyba że Użytkownik
            dezaktywuje automatyczne odnowienie na swoim koncie Google Play
            lub App Store.
          </P>

          <P>
            2. Przed zakupem Użytkownik otrzymuje jasną informację o:
            - cenie Subskrypcji,
            - okresie rozliczeniowym,
            - zasadach odnowienia,
          </P>

          <P>
            3. Płatności przetwarzane są wyłącznie przez Stripe, Google lub Apple.
            Usługodawca nie gromadzi ani nie przetwarza danych kart płatniczych.
          </P>

          <P>
            4. Zwroty płatności są realizowane wyłącznie przez Google Play, Apple App Store
            lub Stripe zgodnie z ich regulaminami.
          </P>

          <P>
            5. Brak opłacenia Subskrypcji po okresie rozliczeniowym powoduje
            automatyczny powrót do wersji bezpłatnej Aplikacji.
          </P>

          <P>
            6. Funkcje Premium mogą obejmować m.in.:
            - możliwość tworzenia zadań i misji wspólnie z członkami Rodziny,
            - możliwość tworzenia wiadomości rodzinnych,
            - priorytetową obsługę wsparcia.
          </P>

          <P>
             7. W przypadku Subskrypcji Stripe, zarządzanie odbywa się przez Stripe Customer Portal.
          </P>

          <P>
             8. Subskrypcja odnawia się automatycznie do czasu jej anulowania.
          </P>

          <P>
             9. Usługodawca może zmienić zakres funkcji Premium, informując o istotnych zmianach.
          </P>

          <P>
             10. Zmiana ceny Subskrypcji jest komunikowana zgodnie z zasadami Google, Apple lub Stripe.
          </P>

        </SectionCard>
        {/* §8 PRAWO ODSTĄPIENIA */}
        <SectionCard>
          <SectionTitle title="§8. Prawo odstąpienia od umowy" />

          <P>
            1. Użytkownik ma prawo odstąpić od zakupu Subskrypcji zgodnie z zasadami platformy,
            przez którą dokonano zakupu.
          </P>

          <P>
            2. Usługodawca nie posiada możliwości ręcznej realizacji zwrotów
            ani anulowania zakupów.
          </P>

          <P>
            3. Jeżeli Użytkownik wyraził zgodę na natychmiastowe rozpoczęcie
            świadczenia usługi cyfrowej Premium, może utracić prawo odstąpienia,
            zgodnie z art. 38 ustawy o prawach konsumenta.
          </P>
        </SectionCard>

        {/* §9 TREŚCI UŻYTKOWNIKA */}
        <SectionCard>
          <SectionTitle title="§9. Treści tworzone przez Użytkownika" />

          <P>
            1. Użytkownik ponosi pełną odpowiedzialność za treści, które
            tworzy, zapisuje lub publikuje w Aplikacji, w tym m.in. zadania,
            wpisy, komentarze i zdjęcia.
          </P>

          <P>
            2. Zabrania się publikowania treści:
            - naruszających prawo,
            - obraźliwych,
            - naruszających prywatność lub dobra osobiste innych osób,
            - zawierających dane wrażliwe,
            - o charakterze spamowym.
          </P>

          <P>
            3. Usługodawca ma prawo usuwać treści niezgodne z Regulaminem lub
            obowiązującym prawem.
          </P>

          <P>
            4. Użytkownik udziela Usługodawcy niewyłącznej licencji na
            przetwarzanie treści w zakresie niezbędnym do prawidłowego działania
            Aplikacji.
          </P>
        </SectionCard>

        {/* §10 RODZINY */}
        <SectionCard>
          <SectionTitle title="§10. Funkcje rodzinne i współdzielenie danych" />

          <P>
            1. Użytkownik, który dołącza do Rodziny lub ją tworzy, akceptuje,
            że inni członkowie Rodziny mogą widzieć jego aktywność, m.in.:
            wykonane zadania, zdobyte punkty, statystyki i udział w misjach.
          </P>

          <P>
            2. Użytkownik może w dowolnym momencie opuścić Rodzinę, chyba że
            pełni rolę administratora i musi najpierw przekazać tę rolę innej
            osobie.
          </P>

          <P>
            3. Niektóre funkcje Rodziny — np. wiadomości, statystyki grupowe,
            wspólne misje — mogą wymagać aktywnej Subskrypcji Premium.
          </P>
        </SectionCard>

        {/* §11 ODPOWIEDZIALNOŚĆ USŁUGODAWCY */}
        <SectionCard>
          <SectionTitle title="§11. Odpowiedzialność Usługodawcy" />

          <P>
            1. Aplikacja jest dostarczana w modelu „tak jak jest”
            („as is”), bez gwarancji nieprzerwanego działania.
          </P>

          <P>
            2. Usługodawca dokłada starań, aby Aplikacja była bezpieczna
            i wolna od błędów, jednak nie gwarantuje pełnej niezawodności.
          </P>

          <P>
            3. Usługodawca nie ponosi odpowiedzialności za:
            - skutki błędnego korzystania z Aplikacji,
            - spory pomiędzy członkami Rodziny,
            - utratę danych wynikającą z przyczyn technicznych,
            - szkody wynikłe z działania siły wyższej lub awarii dostawców usług.
          </P>

          <P>
            4. Usługodawca może czasowo ograniczyć dostęp do Aplikacji
            z przyczyn technicznych, bezpieczeństwa lub aktualizacji.
          </P>
        </SectionCard>

        {/* §12 REKLAMACJE */}
        <SectionCard>
          <SectionTitle title="§12. Postępowanie reklamacyjne" />

          <P>
            1. Reklamacje dotyczące działania Aplikacji należy zgłaszać na adres
            e-mail: xxx
          </P>

          <P>
            2. Usługodawca rozpatruje reklamacje w terminie do 14 dni roboczych
            od daty ich otrzymania.
          </P>

          <P>
            3. Reklamacje dotyczące płatności, odnowienia Subskrypcji lub zwrotów
            są obsługiwane wyłącznie przez Google Play i Apple App Store.
          </P>

          <P>
            4. Usługodawca nie ma możliwości wpływu na decyzje sklepów
            dotyczące zwrotów.
          </P>
        </SectionCard>

        {/* §13 DANE OSOBOWE */}
        <SectionCard>
          <SectionTitle title="§13. Dane osobowe i prywatność" />

          <P>
            1. Dane osobowe Użytkowników przetwarzane są zgodnie z obowiązującymi
            przepisami prawa, w tym z Rozporządzeniem Parlamentu Europejskiego
            i Rady (UE) 2016/679 (RODO).
          </P>

          <P>
            2. Szczegółowe zasady przetwarzania danych określa Polityka
            Prywatności dostępna w Aplikacji.
          </P>

          <P>
            3. Użytkownikowi przysługuje prawo dostępu, sprostowania, usunięcia,
            ograniczenia przetwarzania, przenoszenia danych oraz wniesienia
            sprzeciwu zgodnie z RODO.
          </P>

          <P>
            4. Użytkownik ma również prawo wniesienia skargi do Prezesa Urzędu
            Ochrony Danych Osobowych.
          </P>
        </SectionCard>
        {/* §14 WŁASNOŚĆ INTELEKTUALNA */}
        <SectionCard>
          <SectionTitle title="§14. Własność intelektualna" />

          <P>
            1. Wszelkie prawa własności intelektualnej do Aplikacji, w tym:
            kodu źródłowego, interfejsu, grafiki, nazwy aplikacji, opisów,
            mechanik działania oraz materiałów audiowizualnych przysługują
            Usługodawcy.
          </P>

          <P>
            2. Zabrania się kopiowania, modyfikowania, dekompilacji,
            dystrybucji lub odsprzedaży Aplikacji bez pisemnej zgody
            Usługodawcy.
          </P>

          <P>
            3. Użytkownik może korzystać z Aplikacji wyłącznie na własne
            potrzeby, zgodnie z Regulaminem i obowiązującymi przepisami prawa.
          </P>
        </SectionCard>

        {/* §15 ZMIANY REGULAMINU */}
        <SectionCard>
          <SectionTitle title="§15. Zmiany Regulaminu" />

          <P>
            1. Usługodawca może wprowadzać zmiany Regulaminu z ważnych przyczyn,
            w szczególności:
            - zmian prawa,
            - zmian funkcjonalnych Aplikacji,
            - zmian organizacyjnych,
            - konieczności poprawy bezpieczeństwa.
          </P>

          <P>
            2. O istotnych zmianach Użytkownik zostanie poinformowany w Aplikacji
            lub poprzez inne środki komunikacji.
          </P>

          <P>
            3. Dalsze korzystanie z Aplikacji po wejściu zmian w życie oznacza
            akceptację nowej treści Regulaminu.
          </P>
        </SectionCard>

        {/* §16 POSTANOWIENIA KOŃCOWE */}
        <SectionCard>
          <SectionTitle title="§16. Postanowienia końcowe" />

          <P>
            1. W sprawach nieuregulowanych w Regulaminie zastosowanie mają
            przepisy prawa polskiego, w szczególności:
            - Kodeks cywilny,
            - Ustawa o świadczeniu usług drogą elektroniczną,
            - Ustawa o prawach konsumenta,
            - Rozporządzenie RODO.
          </P>

          <P>
            2. Wszelkie spory pomiędzy Użytkownikiem a Usługodawcą będą
            rozstrzygane przez sąd właściwy zgodnie z przepisami prawa.
          </P>

          <P>
            3. Regulamin obowiązuje od dnia publikacji w Aplikacji.
          </P>
        </SectionCard>

        {/* FOOTER */}
        <View style={{ marginTop: 8, alignItems: "center" }}>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            Ostatnia aktualizacja:{" "}
            <Text style={{ fontWeight: "700", color: colors.text }}>
              2025-12-01
            </Text>
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

export default RulesScreen;
