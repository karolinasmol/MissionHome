// app/idea.tsx
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
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useThemeColors } from "../src/context/ThemeContext";
import { auth, db } from "../src/firebase/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export default function IdeaScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [benefit, setBenefit] = useState("");
  const [sending, setSending] = useState(false);

  const user = auth.currentUser;

  const canSend =
    title.trim().length > 0 && description.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      setSending(true);

      await addDoc(collection(db as any, "feature_ideas"), {
        title: title.trim(),
        description: description.trim(),
        benefit: benefit.trim() || null,
        platform: Platform.OS,
        appVersion: "1.0.0",
        userId: user?.uid || null,
        userEmail: user?.email || null,
        createdAt: serverTimestamp(),
        status: "new",
      });

      Alert.alert("Dziękujemy!", "Twój pomysł został wysłany 💡");

      setTitle("");
      setDescription("");
      setBenefit("");
      router.back();
    } catch (err: any) {
      console.error("IDEA REPORT ERROR", err);
      const msg =
        err?.message || "Nie udało się wysłać pomysłu. Spróbuj ponownie.";
      Alert.alert("Błąd", msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 40,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={Platform.OS === "ios"}
        >
          {/* HEADER */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingTop: 4,
              paddingBottom: 12,
            }}
          >
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                router.back();
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons
                name={Platform.OS === "ios" ? "chevron-back" : "arrow-back"}
                size={24}
                color={colors.text}
              />
            </TouchableOpacity>

            <Text
              style={{
                flex: 1,
                textAlign: "center",
                marginRight: 36,
                color: colors.text,
                fontSize: 20,
                fontWeight: "600",
              }}
            >
              Zgłoś pomysł
            </Text>
          </View>

          {/* FORM CARD */}
          <View
            style={{
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 18,
              padding: 16,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontWeight: "700",
                fontSize: 16,
                marginBottom: 8,
              }}
            >
              Pomóż nam ulepszyć MissionHome 💡
            </Text>

            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                lineHeight: 18,
                marginBottom: 20,
              }}
            >
              Podziel się swoimi pomysłami na nowe funkcje, poprawki lub
              usprawnienia. Im bardziej konkretny opis, tym łatwiej nam będzie je
              wdrożyć.
            </Text>

            {/* CO JEST MILE WIDZIANE */}
            <View style={{ marginBottom: 18 }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: "700",
                  marginBottom: 6,
                }}
              >
                Jakie pomysły są mile widziane?
              </Text>

              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 12,
                  lineHeight: 18,
                }}
              >
                • nowe funkcje aplikacji {"\n"}
                • zmiany w wyglądzie {"\n"}
                • usprawnienia ułatwiające codzienne korzystanie
              </Text>
            </View>

            {/* TITLE INPUT */}
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Tytuł pomysłu
            </Text>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Np. Widok tygodnia w kalendarzu"
              placeholderTextColor={colors.textSecondary}
              style={{
                marginTop: 6,
                marginBottom: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: colors.inputBackground ?? "#020617",
                color: colors.text,
                fontSize: 14,
              }}
            />

            {/* DESCRIPTION INPUT */}
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Opisz swój pomysł
            </Text>

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={
                "Co dokładnie chcesz dodać lub zmienić?\nJak miałoby działać?\nDla kogo byłaby ta funkcja?"
              }
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              style={{
                marginTop: 6,
                marginBottom: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12,
                backgroundColor: colors.inputBackground ?? "#020617",
                color: colors.text,
                fontSize: 14,
                minHeight: 140,
              }}
            />

            {/* BENEFIT INPUT */}
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Dlaczego to będzie pomocne? (opcjonalnie)
            </Text>

            <TextInput
              value={benefit}
              onChangeText={setBenefit}
              placeholder="Np. ułatwi planowanie tygodnia całej rodzinie..."
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              style={{
                marginTop: 6,
                marginBottom: 20,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12,
                backgroundColor: colors.inputBackground ?? "#020617",
                color: colors.text,
                fontSize: 14,
                minHeight: 80,
              }}
            />

            {/* BUTTONS */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              {/* CANCEL */}
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  router.back();
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontSize: 14,
                  }}
                >
                  Anuluj
                </Text>
              </TouchableOpacity>

              {/* SEND */}
              <TouchableOpacity
                onPress={handleSend}
                disabled={!canSend}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: canSend ? colors.accent : colors.disabled,
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
                    color: "#022c22",
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {sending ? "Wysyłanie..." : "Wyślij pomysł"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
