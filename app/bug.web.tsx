import React, { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";
import { auth, db } from "../src/firebase/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export default function BugReportWeb() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { width } = useWindowDimensions();

  const isPhone = width < 520;
  const isTablet = width >= 520 && width < 900;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("");
  const [sending, setSending] = useState(false);

  const user = auth.currentUser;

  const canSend =
    title.trim().length > 0 && description.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;

    try {
      setSending(true);

      await addDoc(collection(db as any, "bug_reports"), {
        title: title.trim(),
        description: description.trim(),
        frequency: frequency.trim() || null,
        platform: Platform.OS,
        appVersion: "1.0.0",
        userId: user?.uid || null,
        userEmail: user?.email || null,
        createdAt: serverTimestamp(),
        status: "new",
      });

      window.alert("Dziękujemy! Zgłoszenie zostało wysłane ✅");

      setTitle("");
      setDescription("");
      setFrequency("");

      router.back();
    } catch (e) {
      window.alert("Nie udało się wysłać zgłoszenia.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingVertical: isPhone ? 18 : 24,
          paddingHorizontal: isPhone ? 12 : 20,
          width: "100%",
          maxWidth: 820,
          alignSelf: "center",
        }}
      >
        {/* HEADER */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              padding: 6,
              borderRadius: 10,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <Text
            style={{
              color: colors.text,
              fontSize: isPhone ? 18 : 22,
              fontWeight: "900",
            }}
          >
            Zgłoś błąd
          </Text>
        </View>

        {/* CARD */}
        <View
          style={{
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 18,
            padding: isPhone ? 14 : 20,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontWeight: "800",
              fontSize: isPhone ? 16 : 18,
              marginBottom: 6,
            }}
          >
            Pomóż nam ulepszyć MissionHome 💙
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              marginBottom: 18,
            }}
          >
            Opisz problem możliwie dokładnie — im więcej szczegółów, tym szybciej go naprawimy.
          </Text>

          {/* TEMAT */}
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>
            Temat zgłoszenia
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Np. Aplikacja zawiesza się przy otwieraniu misji"
            placeholderTextColor={colors.textMuted}
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              backgroundColor: "#020617",
              color: colors.text,
              marginBottom: 16,
              fontSize: 14,
            }}
          />

          {/* OPIS */}
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>
            Opis błędu
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={
              "Co dokładnie zrobiłeś/aś?\nCo miało się wydarzyć?\nCo faktycznie się wydarzyło?"
            }
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              backgroundColor: "#020617",
              color: colors.text,
              minHeight: isPhone ? 140 : 180,
              fontSize: 14,
              marginBottom: 16,
            }}
          />

          {/* FREQUENCY */}
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>
            Jak często występuje?
          </Text>
          <TextInput
            value={frequency}
            onChangeText={setFrequency}
            placeholder="Np. za każdym razem / rzadko / po ostatniej aktualizacji"
            placeholderTextColor={colors.textMuted}
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              backgroundColor: "#020617",
              color: colors.text,
              fontSize: 14,
              marginBottom: 24,
            }}
          />

          {/* BUTTONS */}
          <View
            style={{
              flexDirection: isPhone ? "column" : "row",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.textMuted, fontWeight: "700" }}>Anuluj</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSend}
              disabled={!canSend}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 999,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: canSend ? colors.accent : "#1e293b",
                opacity: sending ? 0.7 : 1,
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#022c22" />
              ) : (
                <Ionicons name="send" size={16} color="#022c22" />
              )}
              <Text
                style={{
                  color: canSend ? "#022c22" : "#64748b",
                  fontWeight: "800",
                }}
              >
                {sending ? "Wysyłanie..." : "Wyślij zgłoszenie"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
