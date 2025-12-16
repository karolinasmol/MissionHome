// src/components/GuidedTourOverlay.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Platform,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type AnchorRect = { x: number; y: number; width: number; height: number };

export type TourStep = {
  key: string;
  title: string;
  body: string;
  anchorKey: string;

  /**
   * Opcjonalny CTA dla kroku (np. "Otwórz ustawienia").
   * Jeśli podasz actionLabel + dasz onAction w propsach, pokaże się dodatkowy przycisk.
   */
  actionLabel?: string;
  actionIcon?: React.ComponentProps<typeof Ionicons>["name"];

  /**
   * ✅ NOWE (bezpieczne, opcjonalne): gdy nie masz anchorów (np. header poza drzewem tego ekranu),
   * możesz podać "wirtualny" rect w koordynatach OKNA (measureInWindow coords).
   * Overlay sam przeliczy go na swoje współrzędne (odejmie rootOffset).
   */
  virtualAnchor?: AnchorRect | ((dims: { W: number; H: number }) => AnchorRect);
};

type Props = {
  visible: boolean;
  stepIndex: number;
  steps: TourStep[];
  anchors: Record<string, AnchorRect | undefined>;
  accentColor?: string;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;

  /**
   * Opcjonalna akcja kroku (np. nawigacja do Ustawień).
   */
  onAction?: (step: TourStep) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isSettingsLike(step?: TourStep) {
  const k = String(step?.key ?? "").toLowerCase();
  const a = String(step?.anchorKey ?? "").toLowerCase();
  return k === "settings" || a === "settings" || k.includes("setting") || a.includes("setting");
}

function resolveVirtualAnchor(step: TourStep | undefined, dims: { W: number; H: number }): AnchorRect | undefined {
  if (!step) return undefined;

  if (typeof step.virtualAnchor === "function") return step.virtualAnchor(dims);
  if (step.virtualAnchor && typeof step.virtualAnchor === "object") return step.virtualAnchor;

  // ✅ fallback: jeśli to "settings" i brak anchorów -> celuj w prawy górny róg (avatar / menu)
  if (isSettingsLike(step)) {
    const size = Platform.OS === "web" ? 56 : 48;
    const top = Platform.OS === "ios" ? 10 : 8;
    return { x: dims.W - size - 14, y: top, width: size, height: size };
  }

  return undefined;
}

export default function GuidedTourOverlay({
  visible,
  stepIndex,
  steps,
  anchors,
  accentColor = "#22c55e",
  onNext,
  onPrev,
  onClose,
  onAction,
}: Props) {
  const { width: W, height: H } = Dimensions.get("window");

  const step = steps[stepIndex];

  // rect z parenta (window-coords)
  const rawRectFromAnchors = step ? anchors[step.anchorKey] : undefined;

  // rect wirtualny (window-coords)
  const rawVirtualRect = useMemo(() => resolveVirtualAnchor(step, { W, H }), [step, W, H]);

  // używamy anchorów, a jak brak -> wirtualny
  const rawRect: AnchorRect | undefined = rawRectFromAnchors ?? rawVirtualRect;

  const isCheckboxStep = useMemo(() => {
    const k = String(step?.key ?? "").toLowerCase();
    const a = String(step?.anchorKey ?? "").toLowerCase();
    return k === "checkbox" || a === "checkbox" || k.includes("check");
  }, [step?.key, step?.anchorKey]);

  const isSettingsStep = useMemo(() => isSettingsLike(step), [step]);

  // ✅ offset root’a overlayu względem okna (na web często ≠ 0 przez header/layout)
  const rootRef = useRef<View | null>(null);
  const [rootOffset, setRootOffset] = useState({ x: 0, y: 0 });

  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();

    // zmierz offset po wyrenderowaniu
    const t = setTimeout(() => {
      // @ts-ignore
      rootRef.current?.measureInWindow?.((x: number, y: number) => {
        if (typeof x === "number" && typeof y === "number" && !Number.isNaN(x) && !Number.isNaN(y)) {
          setRootOffset({ x, y });
        }
      });
    }, 0);

    return () => clearTimeout(t);
  }, [visible, fade]);

  // ✅ przelicz rect z window-coords na coords overlayu
  const rect: AnchorRect | undefined = useMemo(() => {
    if (!rawRect) return undefined;
    return {
      x: rawRect.x - rootOffset.x,
      y: rawRect.y - rootOffset.y,
      width: rawRect.width,
      height: rawRect.height,
    };
  }, [rawRect, rootOffset.x, rootOffset.y]);

  const ui = useMemo(() => {
    const pad = 12;

    const bubbleW = Math.min(380, W - pad * 2);

    // ✅ szacowana wysokość dymka
    const hasCTA = Boolean(step?.actionLabel && onAction);
    const estimatedBubbleH = isCheckboxStep ? 270 : hasCTA ? 240 : 190;

    // ✅ specjalnie dla settings: dymek w prawym górnym rogu (pod headerem)
    if (isSettingsStep) {
      return {
        bubbleW,
        bubbleX: clamp(W - pad - bubbleW, pad, W - pad - bubbleW),
        bubbleY: clamp(86, pad, H - pad - estimatedBubbleH),
        placement: "bottom" as const,
        arrowX: rect ? rect.x + rect.width / 2 - 10 : W - 64,
        arrowY: rect ? rect.y + rect.height + 2 : 40,
      };
    }

    // default: dymek przy elemencie
    const anchorX = rect?.x ?? pad;
    const bubbleX = clamp(anchorX - 10, pad, W - bubbleW - pad);

    let placement: "top" | "bottom" = "bottom";
    let bubbleY = 0;

    if (rect) {
      const belowY = rect.y + rect.height + 16;
      const aboveY = rect.y - 16;

      // jeśli pod spodem mało miejsca → idź nad
      if (belowY + estimatedBubbleH > H && aboveY - estimatedBubbleH > 0) placement = "top";

      bubbleY = placement === "bottom" ? belowY : Math.max(pad, aboveY - (estimatedBubbleH - 20));
    } else {
      bubbleY = 90;
      placement = "bottom";
    }

    const arrowX = rect ? rect.x + rect.width / 2 - 10 : W / 2 - 10;
    const arrowY = rect
      ? placement === "bottom"
        ? rect.y + rect.height + 2
        : rect.y - 26
      : bubbleY - 26;

    return {
      bubbleW,
      bubbleX,
      bubbleY,
      placement,
      arrowX: clamp(arrowX, pad, W - pad - 20),
      arrowY: clamp(arrowY, pad, H - pad - 20),
    };
  }, [W, H, rect, isCheckboxStep, step?.actionLabel, onAction, isSettingsStep]);

  if (!visible || !step) return null;

  // przykład zadania tylko wtedy, gdy checkbox-step i brak prawdziwego anchor rect z listy zadań
  // (czyli typowo: user nie ma jeszcze żadnych misji)
  const showExampleMission = isCheckboxStep && !rawRectFromAnchors;

  const showCTA = Boolean(step.actionLabel && onAction);

  // ✅ “linia-strzałka” dla settings (bo to zwykle cel poza ekranem / w headerze)
  const renderLineArrow = () => {
    if (!rect) return null;

    const pad = 12;

    const tx = clamp(rect.x + rect.width / 2, pad, W - pad);
    const ty = clamp(rect.y + rect.height / 2, pad, H - pad);

    // start linii: z prawej strony dymka
    const sx = ui.bubbleX + ui.bubbleW - 40;
    const sy = ui.bubbleY + 18;

    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.max(24, Math.sqrt(dx * dx + dy * dy));
    const angleRad = Math.atan2(dy, dx);
    const angleDeg = (angleRad * 180) / Math.PI;

    return (
      <>
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: tx - 12,
            top: ty - 12,
            width: 24,
            height: 24,
            borderRadius: 999,
            backgroundColor: `${accentColor}22`,
            borderWidth: 1,
            borderColor: `${accentColor}77`,
            opacity: fade,
          }}
        />

        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: sx,
            top: sy,
            width: len,
            height: 3,
            borderRadius: 999,
            backgroundColor: accentColor,
            opacity: fade,
            transform: [{ translateX: len / 2 }, { rotate: `${angleDeg}deg` }, { translateX: -len / 2 }],
          }}
        />

        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: tx - 10,
            top: ty - 10,
            opacity: fade,
            transform: [{ rotate: `${angleDeg}deg` }],
          }}
        >
          <Ionicons name="arrow-forward" size={20} color={accentColor} />
        </Animated.View>
      </>
    );
  };

  return (
    <View
      ref={(el) => (rootRef.current = el)}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9990,
      }}
      pointerEvents="box-none"
    >
      {/* półprzezroczyste przyciemnienie */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(2,6,23,0.55)",
          opacity: fade,
        }}
        pointerEvents="auto"
      />

      {/* ✅ podświetlenie elementu (także dla settings – bo mamy virtual rect) */}
      {rect && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: Math.max(6, rect.x - 8),
            top: Math.max(6, rect.y - 8),
            width: rect.width + 16,
            height: rect.height + 16,
            borderRadius: 18,
            borderWidth: 2,
            borderColor: accentColor,
            backgroundColor: "rgba(34,197,94,0.10)",
            opacity: fade,
            ...(Platform.OS === "web"
              ? ({ boxShadow: `0px 14px 40px rgba(0,0,0,0.35)` } as any)
              : {
                  shadowColor: "#000",
                  shadowOpacity: 0.25,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 12 },
                  elevation: 10,
                }),
          }}
        />
      )}

      {/* strzałka: normalna dla kroków, linia dla settings */}
      {!isSettingsStep ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: ui.arrowX,
            top: ui.arrowY,
            opacity: fade,
          }}
        >
          <Ionicons
            name={ui.placement === "bottom" ? "arrow-down" : "arrow-up"}
            size={26}
            color={accentColor}
          />
        </Animated.View>
      ) : (
        renderLineArrow()
      )}

      {/* dymek */}
      <Animated.View
        style={{
          position: "absolute",
          left: ui.bubbleX,
          top: ui.bubbleY,
          width: ui.bubbleW,
          borderRadius: 20,
          padding: 14,
          backgroundColor: "#0b1220",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          opacity: fade,
          ...(Platform.OS === "web"
            ? ({ boxShadow: `0px 18px 60px rgba(0,0,0,0.45)` } as any)
            : {
                shadowColor: "#000",
                shadowOpacity: 0.35,
                shadowRadius: 22,
                shadowOffset: { width: 0, height: 14 },
                elevation: 12,
              }),
        }}
        pointerEvents="auto"
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900" }}>{step.title}</Text>

          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Ionicons name="close" size={18} color="#cbd5e1" />
          </TouchableOpacity>
        </View>

        <Text
          style={{
            color: "#cbd5e1",
            marginTop: 8,
            lineHeight: 18,
            fontSize: 13,
          }}
        >
          {step.body}
        </Text>

        {/* ✅ CTA: np. "Otwórz ustawienia" */}
        {showCTA && (
          <TouchableOpacity
            onPress={() => onAction?.(step)}
            style={{
              marginTop: 12,
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 12,
              backgroundColor: `${accentColor}1A`,
              borderWidth: 1,
              borderColor: `${accentColor}55`,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Ionicons name={step.actionIcon ?? "settings-outline"} size={18} color={accentColor} />
            <Text style={{ color: accentColor, fontWeight: "900" }}>{step.actionLabel}</Text>
          </TouchableOpacity>
        )}

        {/* ✅ PRZYKŁAD: gdy użytkownik nie ma jeszcze żadnych zadań, pokaż mini-kartę */}
        {showExampleMission && (
          <View
            style={{
              marginTop: 12,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              padding: 12,
            }}
          >
            <Text
              style={{
                color: "#94a3b8",
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 0.2,
                marginBottom: 8,
              }}
            >
              Przykładowe zadanie (tak to wygląda)
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  marginRight: 10,
                  justifyContent: "center",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: `${accentColor}66`,
                  backgroundColor: `${accentColor}14`,
                }}
              >
                <Ionicons name="checkmark" size={18} color={accentColor} />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: "#e2e8f0",
                    fontSize: 14,
                    fontWeight: "900",
                    letterSpacing: 0.2,
                  }}
                >
                  Wynieś śmieci
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 6,
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: `${accentColor}18`,
                      borderWidth: 1,
                      borderColor: `${accentColor}55`,
                    }}
                  >
                    <Text
                      style={{
                        color: accentColor,
                        fontSize: 11,
                        fontWeight: "900",
                        letterSpacing: 0.2,
                      }}
                    >
                      Wykonane ✅
                    </Text>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                    }}
                  >
                    <Text
                      style={{
                        color: "#e2e8f0",
                        fontSize: 11,
                        fontWeight: "900",
                        letterSpacing: 0.2,
                      }}
                    >
                      +20 EXP
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <Text
              style={{
                color: "#64748b",
                fontSize: 11,
                marginTop: 10,
                lineHeight: 16,
                fontWeight: "700",
              }}
            >
              Klikasz kółko po lewej → pojawia się ptaszek i dostajesz EXP.
            </Text>
          </View>
        )}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 12,
            gap: 10,
          }}
        >
          <TouchableOpacity
            onPress={onPrev}
            disabled={stepIndex === 0}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.06)",
              opacity: stepIndex === 0 ? 0.5 : 1,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              ...(Platform.OS === "web" ? ({ cursor: stepIndex === 0 ? "default" : "pointer" } as any) : null),
            }}
          >
            <Text style={{ color: "#e2e8f0", fontWeight: "900" }}>Wróć</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onNext}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: accentColor,
              alignItems: "center",
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Text style={{ color: "#022c22", fontWeight: "900" }}>
              {stepIndex === steps.length - 1 ? "Gotowe" : "Dalej"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onClose}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 10,
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Text style={{ color: "#94a3b8", fontWeight: "800" }}>Pomiń</Text>
          </TouchableOpacity>
        </View>

        <Text
          style={{
            color: "#64748b",
            marginTop: 10,
            fontSize: 11,
            fontWeight: "700",
          }}
        >
          Krok {stepIndex + 1} / {steps.length}
        </Text>
      </Animated.View>
    </View>
  );
}
// src/components/GuidedTourOverlay.tsx
