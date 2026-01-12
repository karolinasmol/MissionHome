// src/components/WelcomeTutorialModal.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Pressable, Animated, Platform, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  visible: boolean;
  colors?: any; // ✅ może być undefined
  onStart: () => void;
  onSkip: () => void;
};

const FALLBACK_COLORS = {
  bg: "#0b1220",
  card: "#111827",
  text: "#ffffff",
  textMuted: "#94a3b8",
  border: "rgba(255,255,255,0.14)",
  accent: "#22d3ee",
};

export default function WelcomeTutorialModal({ visible, colors, onStart, onSkip }: Props) {
  const { width } = useWindowDimensions();
  const isNarrow = width < 520;

  // ✅ zawsze bezpieczny obiekt kolorów
  const c = useMemo(() => {
    const obj = colors && typeof colors === "object" ? colors : null;

    const bg = typeof obj?.bg === "string" ? obj.bg : FALLBACK_COLORS.bg;
    const card = typeof obj?.card === "string" ? obj.card : FALLBACK_COLORS.card;
    const text = typeof obj?.text === "string" ? obj.text : FALLBACK_COLORS.text;
    const textMuted = typeof obj?.textMuted === "string" ? obj.textMuted : FALLBACK_COLORS.textMuted;
    const border = typeof obj?.border === "string" ? obj.border : FALLBACK_COLORS.border;
    const accent = typeof obj?.accent === "string" ? obj.accent : FALLBACK_COLORS.accent;

    return { bg, card, text, textMuted, border, accent };
  }, [colors]);

  const [mounted, setMounted] = useState<boolean>(visible);

  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  const useNativeDriver = Platform.OS !== "web";

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver }),
      Animated.timing(translateY, { toValue: 18, duration: 160, useNativeDriver }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, fade, translateY, useNativeDriver]);

  const cardShadow = useMemo(
    () =>
      Platform.OS === "web"
        ? ({ boxShadow: "0px 18px 50px rgba(0,0,0,0.45)" } as any)
        : {
            shadowColor: "#000",
            shadowOpacity: 0.28,
            shadowRadius: 22,
            shadowOffset: { width: 0, height: 12 },
            elevation: 10,
          },
    []
  );

  if (!mounted) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 5000,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 16,
      }}
    >
      {/* Backdrop */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(2,6,23,0.62)",
          opacity: fade,
        }}
      />

      {/* (celowo) nie zamykamy po kliknięciu w tło */}
      <Pressable
        onPress={() => {}}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      {/* Karta */}
      <Animated.View
        style={{
          width: "100%",
          maxWidth: 640,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          padding: 18,
          opacity: fade,
          transform: [{ translateY }],
          ...cardShadow,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.accent + "22",
              borderWidth: 1,
              borderColor: c.accent + "55",
              marginRight: 12,
            }}
          >
            <Ionicons name="sparkles-outline" size={18} color={c.accent} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "900", letterSpacing: 0.2 }}>
              Witaj w MissionHome ✨
            </Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2, fontWeight: "700" }}>
              Szybko pokażemy Ci najważniejsze funkcje i możesz zaczynać.
            </Text>
          </View>

          <TouchableOpacity
            onPress={onSkip}
            activeOpacity={0.9}
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: c.border,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: c.bg,
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color={c.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Body */}
        <View style={{ marginTop: 14 }}>
          <View style={{ gap: 10 }}>
            {[
              { icon: "checkmark-circle-outline", text: "Realizuj zadania (także cykliczne) → zdobywasz EXP i odblokowujesz osiągnięcia." },
              { icon: "calendar-outline", text: "Wybierz datę → zobaczysz plan na konkretny dzień." },
              { icon: "flame-outline", text: "Streak rośnie, gdy każdego dnia zrobisz przynajmniej jedno zadanie." },
            ].map((row, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.bg,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 10,
                    marginTop: 1,
                  }}
                >
                  <Ionicons name={row.icon as any} size={16} color={c.textMuted} />
                </View>
                <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18, flex: 1, fontWeight: "700" }}>
                  {row.text}
                </Text>
              </View>
            ))}
          </View>

          <View
            style={{
              marginTop: 14,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 16,
              backgroundColor: c.accent + "14",
              borderWidth: 1,
              borderColor: c.accent + "33",
            }}
          >
            <Text style={{ color: c.text, fontSize: 12, fontWeight: "800", letterSpacing: 0.2 }}>
              MissionHome jest bezpłatne. Wersja Premium umożliwia współpracę z innymi osobami.
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={{ marginTop: 16, flexDirection: isNarrow ? "column" : "row", gap: 10 }}>
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={onStart}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 999,
              backgroundColor: c.accent,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Ionicons name="play" size={16} color="#022c22" />
            <Text style={{ marginLeft: 8, color: "#022c22", fontSize: 13, fontWeight: "900", letterSpacing: 0.2 }}>
              Rozpocznij wprowadzenie
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.92}
            onPress={onSkip}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.bg,
              alignItems: "center",
              justifyContent: "center",
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Text style={{ color: c.text, fontSize: 13, fontWeight: "900", letterSpacing: 0.2 }}>
              Znam już aplikację
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}
// src/components/WelcomeTutorialModal.tsx
