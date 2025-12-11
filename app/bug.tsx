import React, { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";
import { auth, db } from "../src/firebase/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export default function BugReportNative() {
  const router = useRouter();
  const { colors } = useThemeColors();

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
        platform: "native",
        appVersion: "1.0.0",
        userId: user?.uid || null,
        userEmail: user?.email || null,
        createdAt: serverTimestamp(),
        status: "new",
      });

      Alert.alert("Dziękujemy!", "Zgłoszenie zostało wysłane.");
      router.back();
    } catch (e) {
      Alert.alert("Błąd", "Nie udało się wysłać zgłoszenia.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 18,
          paddingBottom: 32,
        }}
      >
        {/* HEADER */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 22,
            gap: 10,
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={26} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontSize: 22, fontWeight: "900", color: colors.text }}>
            Zgłoś błąd
          </Text>
        </View>

        {/* CARD */}
        <View
          style={{
            backgroundColor: colors.card,
            padding: 18,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 17,
              fontWeight: "800",
              marginBottom: 6,
            }}
          >
            Pomóż nam ulepszyć MissionHome 💙
          </Text>

          <Text style={{ color: colors.textMuted, marginBottom: 16 }}>
            Opisz dokładnie, co się stało, a zajmiemy się resztą.
          </Text>

          {/* TITLE */}
          <Text style={{ color: colors.textMuted, marginBottom: 4 }}>
            Temat
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Np. nie działa usuwanie zadania"
            placeholderTextColor={colors.textMuted}
            style={{
              backgroundColor: "#020617",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
              marginBottom: 14,
              color: colors.text,
              fontSize: 15,
            }}
          />

          {/* DESCRIPTION */}
          <Text style={{ color: colors.textMuted, marginBottom: 4 }}>
            Opis błędu
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Opisz krok po kroku co się wydarzyło..."
            placeholderTextColor={colors.textMuted}
            style={{
              backgroundColor: "#020617",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
              minHeight: 150,
              marginBottom: 14,
              color: colors.text,
              fontSize: 15,
              textAlignVertical: "top",
            }}
            multiline
          />

          {/* FREQUENCY */}
          <Text style={{ color: colors.textMuted, marginBottom: 4 }}>
            Jak często występuje?
          </Text>
          <TextInput
            value={frequency}
            onChangeText={setFrequency}
            placeholder="Np. za każdym razem"
            placeholderTextColor={colors.textMuted}
            style={{
              backgroundColor: "#020617",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
              marginBottom: 22,
              color: colors.text,
              fontSize: 15,
            }}
          />

          {/* BUTTONS */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 12,
            }}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textMuted, fontWeight: "700" }}>
                Anuluj
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSend}
              disabled={!canSend}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: canSend ? colors.accent : "#1e293b",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                opacity: sending ? 0.7 : 1,
              }}
            >
              {sending ? (
                <ActivityIndicator color="#022c22" />
              ) : (
                <Ionicons name="send" size={18} color="#022c22" />
              )}

              <Text
                style={{
                  color: canSend ? "#022c22" : "#64748b",
                  fontWeight: "800",
                }}
              >
                {sending ? "Wysyłanie..." : "Wyślij swoje zgłoszenie"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
