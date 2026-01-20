// app/contact.web.tsx
import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";

// Jeden wspólny mail (wkleisz docelowy później)
const CONTACT_EMAIL = "office.missionhome@gmail.com";

const ContactScreen = () => {
  const router = useRouter();
  const { colors } = useThemeColors();

  const openEmail = (to: string, subject: string) => {
    const encodedSubject = encodeURIComponent(subject);
    const url = `mailto:${to}?subject=${encodedSubject}`;

    Linking.openURL(url).catch(() => {
      Alert.alert(
        "Nie udało się otworzyć poczty",
        `Napisz do nas ręcznie na adres:\n\n${to}`
      );
    });
  };

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert("Ups!", "Nie udało się otworzyć linku.");
    });
  };

  const PillButton = ({
    icon,
    label,
    onPress,
  }: {
    icon: any;
    label: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        marginRight: 8,
        marginTop: 8,
      }}
    >
      <Ionicons name={icon} size={16} color={colors.text} />
      <Text
        style={{
          marginLeft: 8,
          color: colors.text,
          fontSize: 13,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

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
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>
          {title}
        </Text>
      </View>

      {subtitle ? (
        <Text style={{ marginTop: 4, color: colors.textMuted, fontSize: 12 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  const ContactRow = ({
    icon,
    label,
    value,
    onPress,
  }: {
    icon: any;
    label: string;
    value: string;
    onPress?: () => void;
  }) => (
    <TouchableOpacity
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          marginRight: 10,
        }}
      >
        <Ionicons name={icon} size={15} color={colors.text} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
          {label}
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 12,
            marginTop: 2,
          }}
        >
          {value}
        </Text>
      </View>

      {onPress ? (
        <Ionicons
          name="open-outline"
          size={16}
          color={colors.textMuted}
          style={{ marginLeft: 6 }}
        />
      ) : null}
    </TouchableOpacity>
  );

  const TopicCompactRow = ({
    icon,
    title,
    subtitle,
  }: {
    icon: any;
    title: string;
    subtitle: string;
  }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          marginRight: 10,
        }}
      >
        <Ionicons name={icon} size={15} color={colors.text} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
          {title}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
          {subtitle}
        </Text>
      </View>
    </View>
  );

  const Divider = () => (
    <View
      style={{
        height: 1,
        backgroundColor: colors.border,
        opacity: 0.7,
        marginVertical: 10,
      }}
    />
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
            marginBottom: 16,
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
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>
              Kontakt
            </Text>
          </View>
        </View>

        {/* SEKCJA: mail + tematy (kompakt) */}
        <SectionCard>
          <SectionTitle icon="mail-outline" title="Napisz do nas" />

          <ContactRow
            icon="mail-open-outline"
            label="Adres e-mail"
            value={CONTACT_EMAIL}
            onPress={() => openEmail(CONTACT_EMAIL, "MissionHome – kontakt")}
          />

          <Divider />


          <TopicCompactRow
            icon="help-buoy-outline"
            title="Wsparcie i problemy techniczne"
            subtitle="Błędy, problemy z kontem, synchronizacja."
          />
          <TopicCompactRow
            icon="sparkles-outline"
            title="Pomysły i sugestie"
            subtitle="Funkcje, usprawnienia, feedback."
          />
          <TopicCompactRow
            icon="briefcase-outline"
            title="Współpraca / media"
            subtitle="Partnerstwa i zapytania medialne."
          />
          <TopicCompactRow
            icon="shield-checkmark-outline"
            title="Prywatność i dane"
            subtitle="Regulamin, polityka prywatności, dane."
          />
        </SectionCard>

        {/* SEKCJA: zgłaszanie błędów i pomysłów */}
        <SectionCard>
          <SectionTitle
            icon="sparkles-outline"
            title="Zgłaszanie błędów i pomysłów"
            subtitle="Twoje zgłoszenia realnie wpływają na rozwój MissionHome."
          />

          <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }}>
            Najlepiej, jeśli opiszesz krok po kroku co się stało i dodasz, na jakim
            urządzeniu korzystasz z aplikacji.
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <PillButton
              icon="bug-outline"
              label="Zgłoś błąd"
              onPress={() => router.push("/bug")}
            />
            <PillButton
              icon="bulb-outline"
              label="Zgłoś pomysł"
              onPress={() => router.push("/idea")}
            />
          </View>
        </SectionCard>

        {/* SEKCJA: social media */}
        <SectionCard>
          <SectionTitle
            icon="share-social-outline"
            title="Social media"
            subtitle="Śledź aktualności, ciekawostki i zajrzyj za kulisy tworzenia aplikacji."
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <PillButton
              icon="logo-facebook"
              label="Facebook"
              onPress={() => openLink("https://www.facebook.com/profile.php?id=61584695554139")}
            />
            <PillButton
              icon="logo-instagram"
              label="Instagram"
              onPress={() => openLink("https://www.instagram.com/missionhome.pl/")}
            />
            <PillButton
              icon="logo-tiktok"
              label="TikTok"
              onPress={() => openLink("https://www.tiktok.com/@missionhome.pl")}
            />
            <PillButton
              icon="logo-youtube"
              label="YouTube"
              onPress={() => openLink("https://www.youtube.com/@missionhomepl")}
            />
          </View>
        </SectionCard>

        {/* SEKCJA: formalności */}
        <SectionCard>
          <SectionTitle
            icon="document-text-outline"
            title="Formalności i bezpieczeństwo"
            subtitle="Szczegóły dotyczące danych, regulaminu i zasad korzystania z aplikacji."
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <PillButton
              icon="shield-checkmark-outline"
              label="Polityka prywatności"
              onPress={() => router.push("/privacy")}
            />
            <PillButton
              icon="reader-outline"
              label="Regulamin"
              onPress={() => router.push("/rules")}
            />
          </View>

          <Text style={{ marginTop: 10, color: colors.textMuted, fontSize: 12 }}>
            Dbamy o to, aby MissionHome była bezpieczna i przejrzysta. Jeśli masz
            wątpliwości dotyczące danych – śmiało napisz do nas.
          </Text>
        </SectionCard>

        {/* SEKCJA: info o czasie odpowiedzi */}
        <View style={{ marginTop: 4, alignItems: "center" }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center" }}>
            Zazwyczaj odpowiadamy w ciągu{" "}
            <Text style={{ fontWeight: "700", color: colors.text }}>1-3 dni roboczych</Text>. Dziękujemy,
            że rozwijasz MissionHome razem z nami 💛
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ContactScreen;

// app/contact.web.tsx
