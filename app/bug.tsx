// app/bug.tsx
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
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";
import { auth, db } from "../src/firebase/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export default function BugReportScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("");
  const [sending, setSending] = useState(false);

  const user = auth.currentUser;

  const cardStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
  };

  const canSend = title.trim().length > 0 && description.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;

    try {
      setSending(true);

      await addDoc(collection(db as any, "bug_reports"), {
        title: title.trim(),
        description: description.trim(),
        frequency: frequency.trim() || null,
        platform: Platform.OS,
        appVersion: "1.0.0", // TODO: podmienić jeśli będziesz trzymać wersję w kodzie
        userId: user?.uid || null,
        userEmail: user?.email || null,
        createdAt: serverTimestamp(),
        status: "new",
      });

      if (Platform.OS === "web") {
        window.alert("Dziękujemy! Zgłoszenie zostało wysłane ✅");
      } else {
        Alert.alert("Dziękujemy!", "Zgłoszenie zostało wysłane ✅");
      }

      setTitle("");
      setDescription("");
      setFrequency("");
      router.back();
    } catch (err: any) {
      console.error("BUG REPORT ERROR", err);
      const msg =
        err?.message || "Nie udało się wysłać zgłoszenia. Spróbuj ponownie.";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Błąd", msg);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32,
          width: "100%",
          maxWidth: 900,
          alignSelf: Platform.OS === "web" ? "center" : "stretch",
        }}
      >
        {/* HEADER */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ paddingRight: 8, paddingVertical: 4 }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: "800",
            }}
          >
            Zgłoś błąd
          </Text>
        </View>

        {/* FORM CARD */}
        <View
          style={{
            ...cardStyle,
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontWeight: "700",
              fontSize: 15,
              marginBottom: 6,
            }}
          >
            Pomóż nam ulepszyć MissionHome 💙
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            Opisz co dokładnie się stało. Im więcej szczegółów, tym szybciej
            naprawimy problem.
          </Text>

          {/* TEMAT */}
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>
            Temat
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Np. Nie mogę usunąć zadania z listy"
            placeholderTextColor={colors.textMuted}
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 10,
              backgroundColor: "#020617",
              color: colors.text,
              marginBottom: 12,
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
              "Co robiłaś/eś?\nCo dokładnie kliknęłaś/eś?\nCo zobaczyłaś/eś zamiast oczekiwanego efektu?"
            }
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 10,
              backgroundColor: "#020617",
              color: colors.text,
              minHeight: 140,
              fontSize: 14,
              marginBottom: 12,
            }}
          />

          {/* CZĘSTOTLIWOŚĆ */}
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>
            Jak często się zdarza? (opcjonalnie)
          </Text>
          <TextInput
            value={frequency}
            onChangeText={setFrequency}
            placeholder="Np. za każdym razem / raz na jakiś czas"
            placeholderTextColor={colors.textMuted}
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 10,
              backgroundColor: "#020617",
              color: colors.text,
              fontSize: 14,
              marginBottom: 18,
            }}
          />

          {/* PRZYCISK */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 14,
                }}
              >
                Anuluj
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSend}
              disabled={!canSend}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: canSend ? colors.accent : "#1e293b",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                opacity: sending ? 0.8 : 1,
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#022c22" />
              ) : (
                <Ionicons name="send" size={16} color="#022c22" />
              )}
              <Text
                style={{
                  color: canSend ? "#022c22" : "#6b7280",
                  fontSize: 14,
                  fontWeight: "700",
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
