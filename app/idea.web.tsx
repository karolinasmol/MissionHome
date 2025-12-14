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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeColors } from "../src/context/ThemeContext";
import { auth, db } from "../src/firebase/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

function isHex6(color: string) {
  return /^#?[0-9a-fA-F]{6}$/.test(color);
}

function normalizeHex6(color: string) {
  return color.startsWith("#") ? color : `#${color}`;
}

function hexToRgb(hex: string) {
  const h = normalizeHex6(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number) {
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function clamp255(n: number) {
  return Math.max(0, Math.min(255, n));
}

function shadeHex(hex: string, amount: number) {
  if (!isHex6(hex)) return hex;
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    clamp255(r + amount),
    clamp255(g + amount),
    clamp255(b + amount)
  );
}

function luminance(hex: string) {
  if (!isHex6(hex)) return 0.5;
  const { r, g, b } = hexToRgb(hex);
  // prosta luminancja (wystarczy do rozróżnienia jasne/ciemne)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export default function IdeaScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [benefit, setBenefit] = useState("");
  const [sending, setSending] = useState(false);

  const user = auth.currentUser;

  const cardStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
  };

  const inputBg = (() => {
    const base = typeof colors.card === "string" ? colors.card : "#111827";
    if (!isHex6(base)) return base;
    const lum = luminance(base);
    // Ciemny motyw: lekko jaśniej (żeby nie było "dziury").
    // Jasny motyw: lekko ciemniej (żeby pole było czytelne).
    return lum < 0.45 ? shadeHex(base, 18) : shadeHex(base, -12);
  })();

  const canSend =
    title.trim().length > 0 && description.trim().length > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;

    try {
      setSending(true);

      await addDoc(collection(db as any, "feature_ideas"), {
        title: title.trim(),
        description: description.trim(),
        benefit: benefit.trim() || null,
        platform: Platform.OS,
        appVersion: "1.0.0", // TODO: podmienić jeśli będziesz trzymać wersję w kodzie
        userId: user?.uid || null,
        userEmail: user?.email || null,
        createdAt: serverTimestamp(),
        status: "new",
      });

      if (Platform.OS === "web") {
        window.alert("Dziękujemy! Pomysł został wysłany 💡");
      } else {
        Alert.alert("Dziękujemy!", "Twój pomysł został wysłany 💡");
      }

      setTitle("");
      setDescription("");
      setBenefit("");
      router.back();
    } catch (err: any) {
      console.error("IDEA REPORT ERROR", err);
      const msg =
        err?.message || "Nie udało się wysłać pomysłu. Spróbuj ponownie.";
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
        keyboardShouldPersistTaps="handled"
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
            Zgłoś pomysł
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
            Pomóż nam ulepszyć MissionHome 💡
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            Podziel się swoimi pomysłami na nowe funkcje, poprawki lub usprawnienia.
            Im bardziej konkretny opis, tym łatwiej nam będzie je wdrożyć.
          </Text>

          {/* JAKIE POMYSŁY */}
          <View style={{ marginBottom: 14 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 12,
                fontWeight: "700",
                marginBottom: 4,
              }}
            >
              Jakie pomysły są mile widziane?
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                lineHeight: 16,
              }}
            >
              • nowe funkcje aplikacji {"\n"}
              • zmiany w wyglądzie {"\n"}
              • usprawnienia, które ułatwią codzienne korzystanie
            </Text>
          </View>

          {/* TYTUŁ POMYSŁU */}
          <Text
            style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}
          >
            Tytuł pomysłu
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Np. Widok tygodnia w kalendarzu"
            placeholderTextColor={colors.textMuted}
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 10,
              backgroundColor: inputBg,
              color: colors.text,
              marginBottom: 12,
              fontSize: 14,
            }}
          />

          {/* OPIS POMYSŁU */}
          <Text
            style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}
          >
            Opisz swój pomysł
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={
              "Co dokładnie chcesz dodać lub zmienić?\nJak miałoby to działać krok po kroku?\nDla kogo byłaby ta funkcja?"
            }
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 10,
              backgroundColor: inputBg,
              color: colors.text,
              minHeight: 140,
              fontSize: 14,
              marginBottom: 12,
            }}
          />

          {/* KORZYŚCI */}
          <Text
            style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}
          >
            Dlaczego to będzie pomocne? (opcjonalnie)
          </Text>
          <TextInput
            value={benefit}
            onChangeText={setBenefit}
            placeholder="Np. ułatwi planowanie tygodnia dla całej rodziny..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 10,
              backgroundColor: inputBg,
              color: colors.text,
              fontSize: 14,
              marginBottom: 18,
              minHeight: 80,
            }}
          />

          {/* PRZYCISKI */}
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
                {sending ? "Wysyłanie..." : "Wyślij pomysł"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// app/idea.tsx
