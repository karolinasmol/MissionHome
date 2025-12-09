// app/contact.tsx
import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";

const SUPPORT_EMAIL = "support@missionhome.app";
const BIZ_EMAIL = "hello@missionhome.app";

export default function ContactScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();

  /* =========================
     HELPERS
  ========================== */

  const openEmail = (to: string, subject: string) => {
    const encoded = encodeURIComponent(subject);
    const url = `mailto:${to}?subject=${encoded}`;

    Linking.openURL(url).catch(() => {
      Alert.alert(
        "Nie udało się otworzyć poczty",
        `Spróbuj napisać ręcznie:\n${to}`
      );
    });
  };

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert("Ups!", "Nie udało się otworzyć linku.");
    });
  };

  /* =========================
     COMPONENTS
  ========================== */

  const SectionCard = ({ children }: { children: React.ReactNode }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
      <View style={styles.sectionTitleRow}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: colors.accent + "22" },
          ]}
        >
          <Ionicons name={icon} size={15} color={colors.accent} />
        </View>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>

      {subtitle && (
        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
          {subtitle}
        </Text>
      )}
    </View>
  );

  const PillButton = ({ icon, label, onPress }: any) => (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <Ionicons name={icon} size={16} color={colors.text} />
      <Text style={[styles.pillText, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
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
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      style={styles.row}
    >
      <View
        style={[
          styles.rowIcon,
          {
            backgroundColor: colors.cardSoft || colors.bg,
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name={icon} size={15} color={colors.text} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.rowValue, { color: colors.textMuted }]}>{value}</Text>
      </View>

      {onPress && (
        <Ionicons name="open-outline" size={16} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );

  /* =========================
       RENDER
  ========================== */

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Platform.OS === "android" ? 32 : 20 },
        ]}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.85}
            style={[
              styles.backBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons name="arrow-back" size={18} color={colors.text} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Kontakt
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              Napisz do nas, jeśli coś nie działa albo masz pomysł na MissionHome.
            </Text>
          </View>
        </View>

        {/* SEKCJA – szybki kontakt */}
        <SectionCard>
          <SectionTitle
            icon="mail-outline"
            title="Szybki kontakt"
            subtitle="Najlepszy sposób na szybki kontakt z zespołem."
          />

          <ContactRow
            icon="help-buoy-outline"
            label="Wsparcie i problemy techniczne"
            value={SUPPORT_EMAIL}
            onPress={() =>
              openEmail(SUPPORT_EMAIL, "MissionHome – wsparcie / błąd")
            }
          />

          <ContactRow
            icon="briefcase-outline"
            label="Współpraca i partnerstwa"
            value={BIZ_EMAIL}
            onPress={() =>
              openEmail(BIZ_EMAIL, "MissionHome – zapytanie biznesowe")
            }
          />

          <View style={styles.pillRow}>
            <PillButton
              icon="mail-open-outline"
              label="Napisz do wsparcia"
              onPress={() => openEmail(SUPPORT_EMAIL, "MissionHome – pytanie")}
            />
          </View>
        </SectionCard>

        {/* SEKCJA – zgłaszanie błędów */}
        <SectionCard>
          <SectionTitle
            icon="bug-outline"
            title="Zgłaszanie błędów i pomysłów"
            subtitle="Twoje zgłoszenia pomagają nam ulepszać aplikację."
          />

          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            Opisz krok po kroku co się stało i podaj urządzenie, z którego korzystasz.
          </Text>

          <View style={styles.pillRow}>
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

        {/* SEKCJA – social media */}
        <SectionCard>
          <SectionTitle
            icon="share-social-outline"
            title="Social media"
            subtitle="Aktualności, ciekawostki i kulisy tworzenia aplikacji."
          />

          <View style={styles.pillRow}>
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

        {/* SEKCJA – formalności */}
        <SectionCard>
          <SectionTitle
            icon="shield-checkmark-outline"
            title="Formalności i bezpieczeństwo"
            subtitle="Dane, regulaminy i zasady działania aplikacji."
          />

          <View style={styles.pillRow}>
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

          <Text style={[styles.infoText, { color: colors.textMuted }]}>
            Jeśli masz pytania o bezpieczeństwo danych — napisz do nas.
          </Text>
        </SectionCard>

        {/* SEKCJA – czas odpowiedzi */}
        <View style={{ marginTop: 4, alignItems: "center" }}>
          <Text style={[styles.footerInfo, { color: colors.textMuted }]}>
            Odpowiadamy zwykle w ciągu{" "}
            <Text style={{ fontWeight: "800", color: colors.text }}>
              1–3 dni roboczych
            </Text>
            . Dzięki, że pomagasz rozwijać MissionHome 💛
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* =========================
     STYLES
========================= */

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },

  /* HEADER */
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },

  /* CARDS */
  card: {
    borderWidth: 1,
    padding: 16,
    borderRadius: 18,
    marginBottom: 14,
  },

  /* SECTION TITLE */
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "900",
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 12,
  },

  /* ROWS */
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  rowValue: {
    fontSize: 12,
    marginTop: 2,
  },

  /* PILLS */
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: "800",
  },

  infoText: {
    fontSize: 13,
    marginBottom: 10,
  },

  footerInfo: {
    fontSize: 12,
    textAlign: "center",
  },
});
