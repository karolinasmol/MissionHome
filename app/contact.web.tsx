// app/contact.tsx
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

const SUPPORT_EMAIL = "support@missionhome.app";
const BIZ_EMAIL = "hello@missionhome.app";

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

  const SectionCard = ({
    children,
  }: {
    children: React.ReactNode;
  }) => (
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
        <Text
          style={{
            color: colors.text,
            fontSize: 13,
            fontWeight: "700",
          }}
        >
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
              Kontakt
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.textMuted,
                marginTop: 2,
              }}
            >
              Napisz do nas, jeśli coś nie działa albo masz pomysł na MissionHome.
            </Text>
          </View>
        </View>

        {/* SEKCJA: szybki kontakt */}
        <SectionCard>
          <SectionTitle
            icon="mail-outline"
            title="Szybki kontakt"
            subtitle="Najlepszy sposób, aby złapać nasz zespół w sprawie aplikacji."
          />

          <ContactRow
            icon="help-buoy-outline"
            label="Wsparcie i problemy techniczne"
            value={SUPPORT_EMAIL}
            onPress={() =>
              openEmail(SUPPORT_EMAIL, "MissionHome – wsparcie / problem techniczny")
            }
          />

          <ContactRow
            icon="briefcase-outline"
            label="Współpraca, partnerstwa, media"
            value={BIZ_EMAIL}
            onPress={() =>
              openEmail(BIZ_EMAIL, "MissionHome – współpraca / zapytanie biznesowe")
            }
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
            <PillButton
              icon="mail-open-outline"
              label="Napisz maila do wsparcia"
              onPress={() =>
                openEmail(SUPPORT_EMAIL, "MissionHome – wsparcie / pytanie")
              }
            />
          </View>
        </SectionCard>

        {/* SEKCJA: zgłaszanie błędów i pomysłów */}
        <SectionCard>
          <SectionTitle
            icon="sparkles-outline"
            title="Zgłaszanie błędów i pomysłów"
            subtitle="Twoje zgłoszenia realnie wpływają na rozwój MissionHome."
          />

          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              marginBottom: 10,
            }}
          >
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
              icon="logo-instagram"
              label="Instagram"
              onPress={() => openLink("https://instagram.com")}
            />
            <PillButton
              icon="logo-facebook"
              label="Facebook"
              onPress={() => openLink("https://facebook.com")}
            />
            <PillButton
              icon="logo-linkedin"
              label="LinkedIn"
              onPress={() => openLink("https://linkedin.com")}
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

          <Text
            style={{
              marginTop: 10,
              color: colors.textMuted,
              fontSize: 12,
            }}
          >
            Dbamy o to, aby MissionHome była bezpieczna i przejrzysta. Jeśli masz
            wątpliwości dotyczące danych – śmiało napisz do nas.
          </Text>
        </SectionCard>

        {/* SEKCJA: info o czasie odpowiedzi */}
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
            Zazwyczaj odpowiadamy w ciągu{" "}
            <Text style={{ fontWeight: "700", color: colors.text }}>
              1–3 dni roboczych
            </Text>
            . Dzięki, że rozwijasz MissionHome razem z nami 💛
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ContactScreen;
