import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Platform, Animated, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type AnchorRect = { x: number; y: number; width: number; height: number };

export type ThemeColors = {
  accent: string;
  bg: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
};

export type TourStep = {
  key: string;
  title: string;
  body: string;

  /**
   * Opcjonalny CTA dla kroku (np. "Otwórz ustawienia").
   * Jeśli podasz actionLabel + dasz onAction w propsach, pokaże się dodatkowy przycisk.
   */
  actionLabel?: string;
  actionIcon?: React.ComponentProps<typeof Ionicons>["name"];

  /**
   * ✅ Opcjonalne: gdy nie masz node/ref (np. header poza drzewem tego ekranu),
   * możesz podać "wirtualny" rect w koordynatach OKNA (measureInWindow coords).
   * Overlay sam przeliczy go na swoje współrzędne (odejmie screenOffset).
   */
  virtualAnchor?: AnchorRect | ((dims: { W: number; H: number }) => AnchorRect);

  /**
   * ✅ NOWE: krok końcowy bez highlighta (modal + confetti).
   * Jeśli true, overlay wyświetli centrum ekranu i pominie mierzenie targetu.
   */
  isFinal?: boolean;
};

type Props = {
  visible: boolean;
  stepIndex: number;
  steps: TourStep[];

  /**
   * ✅ Jeśli tutorial jest podzielony na segmenty (np. Home = kroki 1-4,
   * a CustomHeader = 5-14), to:
   * - totalSteps = 14/15
   * - stepIndexOffset = 0 dla Home, 4 dla CustomHeader (bo 0->5)
   */
  totalSteps?: number;
  stepIndexOffset?: number;

  /**
   * Zwraca node/ref dla kroku (na podstawie step.key).
   * Parent (np. HomeScreen) mapuje key -> ref.
   */
  getNodeForStep: (key: TourStep["key"]) => any;

  /**
   * Zwraca node/ref kontenera ekranu (np. screenRef), aby odjąć offset.
   * Jeśli nie podasz, overlay spróbuje działać bez offsetu.
   */
  getScreenNode?: () => any;

  /**
   * Gdy UI się zmienia (scroll, lista zadań, zmiana dnia),
   * podbij token, a overlay przeliczy highlight.
   */
  refreshToken?: any;

  colors: ThemeColors;

  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;

  /**
   * Opcjonalna akcja kroku (np. nawigacja do Ustawień).
   */
  onAction?: (step: TourStep) => void;
};

// ✅ WEB-only: wyłączamy native driver na stałe (usuwa warning na web)
const USE_NATIVE_DRIVER = false;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function unwrapNode(node: any) {
  return node?.current ?? node;
}

function isHTMLElement(node: any): node is HTMLElement {
  const n = unwrapNode(node);
  return !!n && typeof (n as any).getBoundingClientRect === "function";
}

function rectLooksValid(r: AnchorRect | null) {
  if (!r) return false;
  if (![r.x, r.y, r.width, r.height].every((v) => typeof v === "number" && Number.isFinite(v))) return false;
  // ✅ odfiltruj “puste” recty (RN/RNW potrafią dać 0x0 tuż po re-renderze)
  if (r.width < 2 || r.height < 2) return false;
  return true;
}

async function measureRect(node: any): Promise<AnchorRect | null> {
  return new Promise((resolve) => {
    try {
      const n = unwrapNode(node);
      if (!n) return resolve(null);

      // ✅ WEB: DOM
      if (isHTMLElement(n)) {
        const r = (n as any).getBoundingClientRect();
        const out = { x: r.left, y: r.top, width: r.width, height: r.height };
        return resolve(rectLooksValid(out) ? out : null);
      }

      // ✅ RN: measureInWindow
      if ((n as any).measureInWindow) {
        (n as any).measureInWindow((x: number, y: number, width: number, height: number) => {
          const out = { x, y, width, height };
          resolve(rectLooksValid(out) ? out : null);
        });
        return;
      }

      resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function isSettingsLike(step?: TourStep) {
  const k = String(step?.key ?? "").toLowerCase();
  return k === "settings" || k.includes("setting");
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

/**
 * ✅ Proste "confetti" bez bibliotek: kilka ikonek w tle z losową pozycją i delikatnym bujaniem.
 * Bezpieczne dla RN/RNW.
 */
function ConfettiBackdrop({
  W,
  H,
  accent,
  fade,
}: {
  W: number;
  H: number;
  accent: string;
  fade: Animated.Value;
}) {
  const items = useMemo(() => {
    const count = Math.min(28, Math.max(18, Math.floor(W / 45)));
    const icons: React.ComponentProps<typeof Ionicons>["name"][] = [
      "sparkles",
      "star",
      "ribbon",
      "heart",
      "happy",
      "flash",
      "trophy",
    ];

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    return new Array(count).fill(0).map((_, i) => ({
      id: `c${i}`,
      x: rand(10, Math.max(20, W - 30)),
      y: rand(10, Math.max(20, H - 30)),
      s: rand(10, 18),
      o: rand(0.12, 0.28),
      r: rand(-18, 18),
      icon: icons[i % icons.length],
      phase: rand(0, 1),
    }));
  }, [W, H]);

  const wiggle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    wiggle.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggle, { toValue: 1, duration: 1400, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(wiggle, { toValue: 0, duration: 1400, useNativeDriver: USE_NATIVE_DRIVER }),
      ])
    );
    loop.start();
    return () => {
      try {
        loop.stop();
      } catch {}
    };
  }, [wiggle]);

  const dy = wiggle.interpolate({ inputRange: [0, 1], outputRange: [0, 10] });
  const opacity = (Animated as any).multiply ? (Animated as any).multiply(fade, 1) : fade;

  return (
    <>
      {items.map((it) => (
        <Animated.View
          key={it.id}
          style={{
            ...({ pointerEvents: "none" } as any),
            position: "absolute",
            left: it.x,
            top: it.y,
            opacity: opacity,
            transform: [{ translateY: dy }, { rotate: `${it.r}deg` }],
          }}
        >
          <Ionicons name={it.icon as any} size={it.s} color={accent} />
        </Animated.View>
      ))}
    </>
  );
}

export default function GuidedTourOverlay({
  visible,
  stepIndex,
  steps,
  totalSteps,
  stepIndexOffset,
  getNodeForStep,
  getScreenNode,
  refreshToken,
  colors,
  onNext,
  onPrev,
  onClose,
  onAction,
}: Props) {
  const { width: W, height: H } = useWindowDimensions();

  const fade = useRef(new Animated.Value(0)).current;

  // ✅ puls ramki (glow/oddech)
  const pulse = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const step = steps[stepIndex];

  // ✅ POPRAWIONA NUMERACJA: X/Y może być globalne (np. 15/15), a nie lokalne
  const offset = Number(stepIndexOffset ?? 0);
  const displayCurrent = offset + stepIndex + 1;
  const displayTotal = Number(totalSteps ?? steps.length);

  // ✅ krok 15 = ostatni globalny krok -> traktujemy jako FINAL (confetti + centrum + bez highlighta)
  const isLastDisplayStep = displayCurrent >= displayTotal;
  const isFinalStep = !!step?.isFinal || isLastDisplayStep;

  const [target, setTarget] = useState<AnchorRect | null>(null);
  const [bubbleH, setBubbleH] = useState(0);

  const isCheckboxStep = useMemo(() => {
    const k = String(step?.key ?? "").toLowerCase();
    return k === "checkbox" || k.includes("check");
  }, [step?.key]);

  const isSettingsStep = useMemo(() => isSettingsLike(step), [step]);

  const refresh = useCallback(async () => {
    if (!visible || !step) return;

    // ✅ FINAL: nie mierzymy nic, modal jest w centrum
    if (isFinalStep) {
      setTarget(null);
      return;
    }

    // mały debounce – RNW + DOM potrafią zwrócić 0x0 tuż po re-renderze
    await new Promise((r) => setTimeout(r, 60));

    const isWeb = Platform.OS === "web";

    // ✅ WEB: overlay jest fixed do viewportu => NIE odejmujemy screenRect
    const screenNode = unwrapNode(getScreenNode?.());
    const screenRect = !isWeb ? await measureRect(screenNode) : null;
    const offX = screenRect?.x ?? 0;
    const offY = screenRect?.y ?? 0;

    const node = unwrapNode(getNodeForStep(step.key));
    const rectFromNode = await measureRect(node);

    const virtualRect = resolveVirtualAnchor(step, { W, H });
    const raw = rectFromNode ?? (virtualRect && rectLooksValid(virtualRect) ? virtualRect : null);

    if (!raw) {
      setTarget({
        x: W / 2 - 120,
        y: H / 2 - 40,
        width: 240,
        height: 80,
      });
      return;
    }

    setTarget({
      x: raw.x - offX,
      y: raw.y - offY,
      width: raw.width,
      height: raw.height,
    });
  }, [visible, step, getNodeForStep, getScreenNode, W, H, isFinalStep]);

  // ✅ lekkie throttlowanie odświeżeń (scroll/resize)
  const pendingRef = useRef(false);
  const scheduleRefresh = useCallback(() => {
    if (!visible) return;
    if (pendingRef.current) return;
    pendingRef.current = true;

    const run = () => {
      pendingRef.current = false;
      refresh();
    };

    // @ts-ignore
    if (typeof requestAnimationFrame === "function") {
      // @ts-ignore
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }, [visible, refresh]);

  useEffect(() => {
    if (!visible) return;

    setTarget(null);
    setBubbleH(0);

    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 180,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();

    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    refresh();
  }, [stepIndex, visible, refresh]);

  useEffect(() => {
    if (!visible) return;
    refresh();
  }, [refreshToken, visible, refresh]);

  useEffect(() => {
    if (!visible) return;
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined") return;

    const on = () => scheduleRefresh();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);

    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
    };
  }, [visible, scheduleRefresh]);

  // ✅ start/stop pulsu razem z overlay (tylko gdy nie-final)
  useEffect(() => {
    try {
      pulseLoopRef.current?.stop();
    } catch {}
    pulseLoopRef.current = null;

    if (!visible || isFinalStep) {
      pulse.setValue(0);
      return;
    }

    pulse.setValue(0);

    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 950, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0, duration: 950, useNativeDriver: USE_NATIVE_DRIVER }),
      ])
    );

    pulseLoopRef.current = anim;
    anim.start();

    return () => {
      try {
        anim.stop();
      } catch {}
    };
  }, [visible, pulse, isFinalStep]);

  if (!visible || !step) return null;

  const pad = 12;

  // ✅ FINAL: bubble wyśrodkowany, bez highlighta/strzałki
  const bubbleWFinal = clamp(Math.min(460, W - pad * 2), 280, 520);
  const bubbleLeftFinal = clamp(W / 2 - bubbleWFinal / 2, pad, W - pad - bubbleWFinal);
  const bubbleTopFinal = clamp(H / 2 - Math.max(210, bubbleH / 2), 90, H - pad - Math.max(260, bubbleH));

  // ---- NORMAL MODE (z highlightem) ----
  const safeTarget: AnchorRect =
    target ?? ({
      x: W / 2 - 120,
      y: H / 2 - 40,
      width: 240,
      height: 80,
    } as AnchorRect);

  const hlPad = 8;

  const hlX = clamp(safeTarget.x - hlPad, pad, W - pad);
  const hlY = clamp(safeTarget.y - hlPad, pad, H - pad);
  const hlW = clamp(safeTarget.width + hlPad * 2, 64, W - pad * 2);
  const hlH = clamp(safeTarget.height + hlPad * 2, 48, H - pad * 2);

  const bubbleW = clamp(Math.min(420, W - pad * 2), 260, 520);

  const preferBelow = hlY + hlH + 12 + bubbleH < H - pad;
  const bubbleTop = preferBelow ? hlY + hlH + 12 : Math.max(pad, hlY - 12 - bubbleH);
  const bubbleLeft = clamp(hlX + hlW / 2 - bubbleW / 2, pad, W - pad - bubbleW);

  const arrowSize = 10;
  const arrowTop = preferBelow ? bubbleTop - arrowSize / 2 : bubbleTop + bubbleH - arrowSize / 2;
  const arrowLeft = clamp(hlX + hlW / 2 - arrowSize / 2, pad, W - pad - arrowSize);

  const showCTA = Boolean(step.actionLabel && onAction);

  const hasRealNodeForStep = !!unwrapNode(getNodeForStep(step.key));
  const showExampleMission = isCheckboxStep && !hasRealNodeForStep;

  const canGoPrev = stepIndex > 0;

  // ✅ pulse style helpers
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.68] });
  const glowOpacityFinal = (Animated as any).multiply ? (Animated as any).multiply(fade, glowOpacity) : fade;

  const renderLineArrow = () => {
    if (!isSettingsStep) return null;

    const tx = clamp(hlX + hlW / 2, pad, W - pad);
    const ty = clamp(hlY + hlH / 2, pad, H - pad);

    const sx = bubbleLeft + bubbleW - 40;
    const sy = bubbleTop + 18;

    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.max(24, Math.sqrt(dx * dx + dy * dy));
    const angleRad = Math.atan2(dy, dx);
    const angleDeg = (angleRad * 180) / Math.PI;

    return (
      <>
        <Animated.View
          style={{
            ...({ pointerEvents: "none" } as any),
            position: "absolute",
            left: tx - 12,
            top: ty - 12,
            width: 24,
            height: 24,
            borderRadius: 999,
            backgroundColor: `${colors.accent}22`,
            borderWidth: 1,
            borderColor: `${colors.accent}77`,
            opacity: fade,
          }}
        />

        <Animated.View
          style={{
            ...({ pointerEvents: "none" } as any),
            position: "absolute",
            left: sx,
            top: sy,
            width: len,
            height: 3,
            borderRadius: 999,
            backgroundColor: colors.accent,
            opacity: fade,
            transform: [{ translateX: len / 2 }, { rotate: `${angleDeg}deg` }, { translateX: -len / 2 }],
          }}
        />

        <Animated.View
          style={{
            ...({ pointerEvents: "none" } as any),
            position: "absolute",
            left: tx - 10,
            top: ty - 10,
            opacity: fade,
            transform: [{ rotate: `${angleDeg}deg` }],
          }}
        >
          <Ionicons name="arrow-forward" size={20} color={colors.accent} />
        </Animated.View>
      </>
    );
  };

  const bubbleStyleBase = (left: number, top: number, width: number) => ({
    position: "absolute" as const,
    left,
    top,
    width,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 14,
    opacity: fade,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0px 18px 60px rgba(0,0,0,0.45)" } as any)
      : {
          shadowColor: "#000",
          shadowOpacity: 0.28,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 12 },
          elevation: 10,
        }),
  });

  return (
    <View
      style={{
        position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 12000,
        ...(Platform.OS !== "web" ? ({ elevation: 12000 } as any) : null),
      }}
    >
      {/* półprzezroczyste przyciemnienie */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(2,6,23,0.72)",
          opacity: fade,
        }}
        pointerEvents="auto"
      />

      {/* ✅ CONFETTI na kroku 15/15 (globalnie) */}
      {isFinalStep ? <ConfettiBackdrop W={W} H={H} accent={colors.accent} fade={fade} /> : null}

      {/* ✅ PULS GLOW + highlight (pomijamy w FINAL) */}
      {!isFinalStep ? (
        <>
          <Animated.View
            style={{
              ...({ pointerEvents: "none" } as any),
              position: "absolute",
              left: hlX,
              top: hlY,
              width: hlW,
              height: hlH,
              borderRadius: 20,
              borderWidth: 2,
              borderColor: colors.accent,
              backgroundColor: `${colors.accent}10`,
              opacity: glowOpacityFinal,
              transform: [{ scale: glowScale }],
              ...(Platform.OS === "web"
                ? ({ boxShadow: `0px 0px 0px 1px ${colors.accent}22, 0px 18px 60px rgba(0,0,0,0.20)` } as any)
                : {
                    shadowColor: colors.accent,
                    shadowOpacity: 0.22,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 10 },
                    elevation: 8,
                  }),
            }}
          />

          <Animated.View
            style={{
              ...({ pointerEvents: "none" } as any),
              position: "absolute",
              left: hlX,
              top: hlY,
              width: hlW,
              height: hlH,
              borderRadius: 18,
              borderWidth: 2,
              borderColor: colors.accent,
              backgroundColor: "rgba(255,255,255,0.03)",
              opacity: fade,
            }}
          />

          {/* arrow: normalna dla kroków, linia dla settings */}
          {!isSettingsStep ? (
            <Animated.View
              style={{
                ...({ pointerEvents: "none" } as any),
                position: "absolute",
                left: arrowLeft,
                top: arrowTop,
                width: arrowSize,
                height: arrowSize,
                backgroundColor: colors.card,
                borderLeftWidth: 1,
                borderTopWidth: 1,
                borderColor: colors.border,
                transform: [{ rotate: preferBelow ? "45deg" : "225deg" }],
                opacity: fade,
              }}
            />
          ) : (
            renderLineArrow()
          )}
        </>
      ) : null}

      {/* bubble */}
      <Animated.View
        style={
          isFinalStep
            ? bubbleStyleBase(bubbleLeftFinal, bubbleTopFinal, bubbleWFinal)
            : bubbleStyleBase(bubbleLeft, bubbleTop, bubbleW)
        }
        pointerEvents="auto"
        onLayout={(e) => setBubbleH(e.nativeEvent.layout.height)}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.accent + "22",
              borderWidth: 1,
              borderColor: colors.accent + "55",
              marginRight: 10,
            }}
          >
            <Ionicons name={isFinalStep ? "sparkles" : "navigate-outline"} size={16} color={colors.accent} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "900", fontSize: 14 }}>{step.title}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2, fontWeight: "800" }}>
              Krok {displayCurrent}/{displayTotal}
            </Text>
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
              alignItems: "center",
              justifyContent: "center",
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 10, lineHeight: 18, fontWeight: "700" }}>
          {step.body}
        </Text>

        {/* CTA (w final raczej niepotrzebne, ale zostawiamy kompatybilnie) */}
        {showCTA && !isFinalStep && (
          <TouchableOpacity
            onPress={() => onAction?.(step)}
            style={{
              marginTop: 12,
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 12,
              backgroundColor: colors.accent + "1A",
              borderWidth: 1,
              borderColor: colors.accent + "55",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Ionicons name={step.actionIcon ?? "settings-outline"} size={18} color={colors.accent} />
            <Text style={{ color: colors.accent, fontWeight: "900" }}>{step.actionLabel}</Text>
          </TouchableOpacity>
        )}

        {/* Example mission */}
        {showExampleMission && !isFinalStep && (
          <View
            style={{
              marginTop: 12,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
              padding: 12,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.2, marginBottom: 8 }}>
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
                  borderColor: `${colors.accent}66`,
                  backgroundColor: `${colors.accent}14`,
                }}
              >
                <Ionicons name="checkmark" size={18} color={colors.accent} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 }}>Wynieś śmieci</Text>

                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 8, flexWrap: "wrap" }}>
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: `${colors.accent}18`,
                      borderWidth: 1,
                      borderColor: `${colors.accent}55`,
                    }}
                  >
                    <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 0.2 }}>Wykonane ✅</Text>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.2 }}>+20 EXP</Text>
                  </View>
                </View>
              </View>
            </View>

            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 10, lineHeight: 16, fontWeight: "700" }}>
              Klikasz kółko po lewej → pojawia się ptaszek i dostajesz EXP.
            </Text>
          </View>
        )}

        {/* Controls */}
        <View style={{ flexDirection: "row", gap: canGoPrev ? 10 : 0, marginTop: 12 }}>
          {canGoPrev ? (
            <TouchableOpacity
              onPress={onPrev}
              style={{
                flex: 1,
                paddingVertical: 11,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bg,
                alignItems: "center",
                justifyContent: "center",
                ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
              }}
            >
              <Text style={{ color: colors.text, fontWeight: "900", fontSize: 13 }}>Wstecz</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={onNext}
            style={{
              flex: 1,
              paddingVertical: 11,
              borderRadius: 999,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
              ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
            }}
          >
            <Text style={{ color: "#022c22", fontWeight: "900", fontSize: 13 }}>
              {isFinalStep ? "Zaczynamy!" : "Dalej"}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={onClose}
          style={{
            marginTop: 10,
            paddingVertical: 10,
            alignItems: "center",
            ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null),
          }}
        >
          <Text style={{ color: colors.textMuted, fontWeight: "800" }}>Pomiń</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// src/components/GuidedTourOverlay.tsx
