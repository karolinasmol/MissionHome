// app/idea.tsx
import React, { useMemo, useState } from "react";
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
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function pickFirstStringColor(...vals: any[]) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
}

export default function IdeaScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [benefit, setBenefit] = useState("");
  const [sending, setSending] = useState(false);

  const user = auth.currentUser;

  // kompatybilność nazewnictwa (u Ciebie w kodzie przewijają się różne klucze)
  const screenBg =
    pickFirstStringColor((colors as any).bg, (colors as any).background) ??
    "#0b1220";

  const cardBg =
    pickFirstStringColor((colors as any).card) ??
    // awaryjnie: jasna karta na jasnym tle / ciemna na ciemnym
    (isHex6(screenBg) && luminance(screenBg) < 0.45
      ? "rgba(255,255,255,0.06)"
      : "rgba(255,255,255,0.55)");

  const borderColor =
    pickFirstStringColor((colors as any).border) ?? "rgba(148,163,184,0.35)";

  const textColor = pickFirstStringColor((colors as any).text) ?? "#0f172a";

  const textMuted =
    pickFirstStringColor((colors as any).textMuted, (colors as any).textSecondary) ??
    "rgba(15,23,42,0.7)";

  const accent = pickFirstStringColor((colors as any).accent) ?? "#34d399";
  const disabledBg = pickFirstStringColor((colors as any).disabled) ?? "#1e293b";

  const inputBg = useMemo(() => {
    // Baza do inputów: najpierw karta (najbardziej logiczne), potem tło ekranu.
    const base =
      pickFirstStringColor((colors as any).card, (colors as any).bg, (colors as any).background) ??
      "#e2e8f0";

    // Jeśli to nie jest hex, to nie próbujemy shade’ować — ale nadal zwracamy bazę.
    if (!isHex6(base)) return base;

    const lum = luminance(base);
    // Ciemny motyw: lekko jaśniej
    // Jasny motyw: lekko ciemniej
    return lum < 0.45 ? shadeHex(base, 18) : shadeHex(base, -12);
  }, [colors]);

  const onAccent = useMemo(() => {
    if (!isHex6(accent)) return "#022c22";
    return luminance(accent) > 0.6 ? "#022c22" : "#ffffff";
  }, [accent]);

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
    <SafeAreaView style={{ flex: 1, backgroundColor: screenBg }}>
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
                color={textColor}
              />
            </TouchableOpacity>

            <Text
              style={{
                flex: 1,
                textAlign: "center",
                marginRight: 36,
                color: textColor,
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
              backgroundColor: cardBg,
              borderColor: borderColor,
              borderWidth: 1,
              borderRadius: 18,
              padding: 16,
            }}
          >
            <Text
              style={{
                color: textColor,
                fontWeight: "700",
                fontSize: 16,
                marginBottom: 8,
              }}
            >
              Pomóż nam ulepszyć MissionHome 💡
            </Text>

            <Text
              style={{
                color: textMuted,
                fontSize: 13,
                lineHeight: 18,
                marginBottom: 20,
              }}
            >
              Podziel się swoimi pomysłami na nowe funkcje, poprawki lub usprawnienia.
              Im bardziej konkretny opis, tym łatwiej nam będzie je wdrożyć.
            </Text>

            {/* CO JEST MILE WIDZIANE */}
            <View style={{ marginBottom: 18 }}>
              <Text
                style={{
                  color: textColor,
                  fontSize: 13,
                  fontWeight: "700",
                  marginBottom: 6,
                }}
              >
                Jakie pomysły są mile widziane?
              </Text>

              <Text
                style={{
                  color: textMuted,
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
            <Text style={{ color: textMuted, fontSize: 12 }}>Tytuł pomysłu</Text>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Np. Widok tygodnia w kalendarzu"
              placeholderTextColor={textMuted}
              style={{
                marginTop: 6,
                marginBottom: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: borderColor,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: inputBg,
                color: textColor,
                fontSize: 14,
              }}
            />

            {/* DESCRIPTION INPUT */}
            <Text style={{ color: textMuted, fontSize: 12 }}>Opisz swój pomysł</Text>

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={
                "Co dokładnie chcesz dodać lub zmienić?\nJak miałoby działać?\nDla kogo byłaby ta funkcja?"
              }
              placeholderTextColor={textMuted}
              multiline
              textAlignVertical="top"
              style={{
                marginTop: 6,
                marginBottom: 16,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: borderColor,
                padding: 12,
                backgroundColor: inputBg,
                color: textColor,
                fontSize: 14,
                minHeight: 140,
              }}
            />

            {/* BENEFIT INPUT */}
            <Text style={{ color: textMuted, fontSize: 12 }}>
              Dlaczego to będzie pomocne? (opcjonalnie)
            </Text>

            <TextInput
              value={benefit}
              onChangeText={setBenefit}
              placeholder="Np. ułatwi planowanie tygodnia całej rodzinie..."
              placeholderTextColor={textMuted}
              multiline
              textAlignVertical="top"
              style={{
                marginTop: 6,
                marginBottom: 20,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: borderColor,
                padding: 12,
                backgroundColor: inputBg,
                color: textColor,
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
                  borderColor: borderColor,
                }}
              >
                <Text
                  style={{
                    color: textMuted,
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
                  backgroundColor: canSend ? accent : disabledBg,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  opacity: sending ? 0.8 : 1,
                }}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={onAccent} />
                ) : (
                  <Ionicons name="send" size={16} color={onAccent} />
                )}

                <Text
                  style={{
                    color: canSend ? onAccent : textMuted,
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
