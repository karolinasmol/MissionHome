// app/idea.web.tsx
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
  Modal,
  Pressable,
  useWindowDimensions,
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
  return rgbToHex(clamp255(r + amount), clamp255(g + amount), clamp255(b + amount));
}

function luminance(hex: string) {
  if (!isHex6(hex)) return 0.5;
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

type ModalKind = "success" | "error";

export default function IdeaScreen() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { width } = useWindowDimensions();

  const isPhone = width < 520;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [benefit, setBenefit] = useState("");
  const [sending, setSending] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState<ModalKind>("success");
  const [modalTitle, setModalTitle] = useState("Dziękujemy!");
  const [modalMsg, setModalMsg] = useState("Twój pomysł został wysłany 💡");

  const user = auth.currentUser;

  const cardStyle = {
    backgroundColor: colors.card,
    borderColor: colors.border,
  };

  const inputBg = useMemo(() => {
    const base = typeof colors.card === "string" ? colors.card : "#111827";
    if (!isHex6(base)) return base;
    const lum = luminance(base);
    return lum < 0.45 ? shadeHex(base, 18) : shadeHex(base, -12);
  }, [colors.card]);

  const modalCardBg = useMemo(() => {
    const base = typeof colors.card === "string" ? colors.card : "#111827";
    if (!isHex6(base)) return base;
    const lum = luminance(base);
    return lum < 0.45 ? shadeHex(base, 10) : shadeHex(base, -6);
  }, [colors.card]);

  // ====== ŁADNIEJSZY PRZYCISK NA JASNYCH MOTYWACH (jak w bug.tsx) ======
  const bgBase = typeof colors.bg === "string" ? colors.bg : "#ffffff";
  const isLightTheme = isHex6(bgBase) ? luminance(bgBase) > 0.62 : true;

  const pickOnColor = (bgHex: string) => {
    if (!isHex6(bgHex)) return isLightTheme ? "#0f172a" : "#e2e8f0";
    return luminance(bgHex) > 0.62 ? "#0f172a" : "#ecfeff";
  };

  const enabledBg = typeof colors.accent === "string" ? colors.accent : "#22c55e";
  const enabledFg = pickOnColor(enabledBg);

  const disabledBg = isLightTheme ? "#e2e8f0" : "#1e293b";
  const disabledFg = isLightTheme ? "#334155" : "#64748b";
  const disabledBorder = isLightTheme ? "#cbd5e1" : colors.border;

  const enabledBorder = isHex6(enabledBg)
    ? isLightTheme
      ? shadeHex(enabledBg, -22)
      : shadeHex(enabledBg, 18)
    : colors.border;
  // =====================================================================

  const canSend = title.trim().length > 0 && description.trim().length > 0 && !sending;

  const openModal = (kind: ModalKind, t: string, m: string) => {
    setModalKind(kind);
    setModalTitle(t);
    setModalMsg(m);
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  const handleModalPrimary = () => {
    if (modalKind === "success") {
      setTitle("");
      setDescription("");
      setBenefit("");
      closeModal();
      router.back();
      return;
    }
    closeModal();
  };

  const handleSend = async () => {
    if (!canSend) return;

    if (!user?.uid) {
      openModal("error", "Zaloguj się", "Musisz być zalogowany, aby wysłać pomysł.");
      return;
    }

    try {
      setSending(true);

      await addDoc(collection(db as any, "feature_ideas"), {
        title: title.trim(),
        description: description.trim(),
        benefit: benefit.trim() || null,
        platform: Platform.OS,
        appVersion: "1.0.0",
        userId: user.uid,
        userEmail: user.email || null,
        createdAt: serverTimestamp(),
        status: "new",
      });

      openModal("success", "Dziękujemy!", "Twój pomysł został wysłany 💡");
    } catch (err: any) {
      console.error("IDEA REPORT ERROR", err);
      const msg = err?.message || "Nie udało się wysłać pomysłu. Spróbuj ponownie.";
      openModal("error", "Błąd", msg);
    } finally {
      setSending(false);
    }
  };

  const modalIcon = modalKind === "success" ? "checkmark-circle" : "alert-circle";
  const modalAccent = modalKind === "success" ? colors.accent : "#ef4444";
  const modalPrimaryText = modalKind === "success" ? "OK, wracam" : "OK";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* MODAL */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={closeModal}>
        <Pressable
          onPress={closeModal}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 18,
              backgroundColor: modalCardBg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Ionicons name={modalIcon as any} size={22} color={modalAccent} />
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>
                {modalTitle}
              </Text>

              <View style={{ flex: 1 }} />

              <TouchableOpacity
                onPress={closeModal}
                style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 }}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text
              style={{
                color: colors.textMuted,
                fontSize: 13,
                lineHeight: 18,
                marginTop: 10,
              }}
            >
              {modalMsg}
            </Text>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 14,
              }}
            >
              {modalKind === "error" ? (
                <TouchableOpacity
                  onPress={closeModal}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>Zamknij</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={handleModalPrimary}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: modalAccent,
                }}
              >
                <Text style={{ color: "#022c22", fontSize: 14, fontWeight: "800" }}>
                  {modalPrimaryText}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        contentContainerStyle={{
          paddingVertical: 18,
          paddingHorizontal: 16,
          paddingBottom: 32,
          width: "100%",
          maxWidth: 900,
          alignSelf: "center",
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* HEADER */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 18,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ padding: 6, borderRadius: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <Text
            style={{
              color: colors.text,
              fontSize: isPhone ? 20 : 22,
              fontWeight: "900",
              flex: 1, // wypycha guzik na prawo
            }}
          >
            Zgłoś pomysł
          </Text>

          {/* PRZEJŚCIE: Zgłoś błąd */}
          <TouchableOpacity
            onPress={() => router.push("/bug")}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: inputBg,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name="bug-outline" size={18} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }}>
              Zgłoś błąd
            </Text>
          </TouchableOpacity>
        </View>

        {/* FORM CARD */}
        <View
          style={{
            ...cardStyle,
            borderWidth: 1,
            borderRadius: 18,
            padding: isPhone ? 14 : 16,
            shadowColor: "#000",
            shadowOpacity: 0.10,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 2,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontWeight: "800",
              fontSize: isPhone ? 15 : 16,
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
            Podziel się swoimi pomysłami na nowe funkcje, poprawki lub usprawnienia. Im bardziej
            konkretny opis, tym łatwiej nam będzie je wdrożyć.
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
              • nowe funkcje aplikacji {"\n"}• zmiany w wyglądzie {"\n"}• usprawnienia, które
              ułatwią codzienne korzystanie
            </Text>
          </View>

          {/* TYTUŁ */}
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>
            Tytuł pomysłu
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Np. Widok tygodnia w kalendarzu"
            placeholderTextColor={colors.textMuted}
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              backgroundColor: inputBg,
              color: colors.text,
              marginBottom: 12,
              fontSize: 14,
            }}
          />

          {/* OPIS */}
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>
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
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              backgroundColor: inputBg,
              color: colors.text,
              minHeight: 140,
              fontSize: 14,
              marginBottom: 12,
            }}
          />

          {/* KORZYŚCI */}
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>
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
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
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

                backgroundColor: canSend ? enabledBg : disabledBg,
                borderWidth: 1,
                borderColor: canSend ? enabledBorder : disabledBorder,

                opacity: sending ? 0.75 : 1,

                shadowColor: "#000",
                shadowOpacity: canSend ? 0.14 : 0.06,
                shadowRadius: canSend ? 10 : 6,
                shadowOffset: { width: 0, height: canSend ? 4 : 2 },

                elevation: canSend ? 3 : 1,
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color={canSend ? enabledFg : disabledFg} />
              ) : (
                <Ionicons name="send" size={16} color={canSend ? enabledFg : disabledFg} />
              )}
              <Text
                style={{
                  color: canSend ? enabledFg : disabledFg,
                  fontSize: 14,
                  fontWeight: "800",
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
