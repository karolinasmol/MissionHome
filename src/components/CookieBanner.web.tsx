// src/components/CookieBanner.web.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type CookieConsent = {
  essential: true; // zawsze true
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
};

const STORAGE_KEY = "mh_cookie_consent";
export const CONSENT_EVENT_NAME = "mh_cookie_consent_changed";

export const DEFAULT_CONSENT: CookieConsent = {
  essential: true,
  functional: false,
  analytics: false,
  marketing: false,
  timestamp: "",
};

function isValidConsent(x: any): x is CookieConsent {
  return (
    x &&
    x.essential === true &&
    typeof x.functional === "boolean" &&
    typeof x.analytics === "boolean" &&
    typeof x.marketing === "boolean" &&
    typeof x.timestamp === "string"
  );
}

export function readConsentFromStorage(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (isValidConsent(parsed)) return parsed;

    // migracja starych zapisów (bez timestamp / inne kształty)
    if (parsed && parsed.essential === true) {
      const migrated: CookieConsent = {
        essential: true,
        functional: !!parsed.functional,
        analytics: !!parsed.analytics,
        marketing: !!parsed.marketing,
        timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : "",
      };
      return migrated;
    }

    return null;
  } catch {
    return null;
  }
}

export function saveConsentToStorage(consent: CookieConsent) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT_NAME, { detail: consent }));
  } catch {
    // no-op
  }
}

/**
 * THEME (TYLKO MODAL):
 * Poprzednio wykrywanie brało głównie prefers-color-scheme => u Ciebie nie działa,
 * bo motyw aplikacji może nie zmieniać klas/atrybutów na <html>.
 *
 * Nowe podejście:
 * - sprawdza theme na <html> i <body> (dataset + classList)
 * - jeśli brak, to bierze realny kolor tła (computed background-color) i liczy jasność
 * - CSS vars czyta z: <html> -> <body> -> #root/#__next
 * - reaguje na zmiany: obserwuje <html>, <body>, root + media query
 */

type ThemeTokens = {
  isDark: boolean;

  modalBg: string;
  modalText: string;
  modalTextMuted: string;
  modalTextSubtle: string;

  border: string;
  borderSubtle: string;
  surface2: string;

  backdrop: string;

  primaryBg: string;
  primaryText: string;

  secondaryBorder: string;
  secondaryText: string;

  checkboxBg: string;
  checkboxBorder: string;
  checkboxActiveBg: string;
  checkboxActiveBorder: string;
};

function safeTrim(x: string | null | undefined) {
  const v = (x ?? "").trim();
  return v.length ? v : null;
}

function getRootCandidate(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (
    document.getElementById("root") ||
    document.getElementById("__next") ||
    document.body ||
    null
  );
}

function getCssVar(names: string[], fallback: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;

  const root = getRootCandidate();
  const els: HTMLElement[] = [document.documentElement, document.body, root].filter(
    (x): x is HTMLElement => !!x
  );

  for (const el of els) {
    const cs = window.getComputedStyle(el);
    for (const n of names) {
      const v = safeTrim(cs.getPropertyValue(n));
      if (v) return v;
    }
  }
  return fallback;
}

function hasClassToken(el: Element, token: string) {
  // ważne: className.includes("dark") potrafi fałszować; tu sprawdzamy token w classList
  return (el as HTMLElement).classList?.contains?.(token) ?? false;
}

function parseRgb(input: string): { r: number; g: number; b: number; a: number } | null {
  // rgb(255, 255, 255) / rgba(255, 255, 255, 0.5)
  const m = input
    .replace(/\s+/g, "")
    .match(/^rgba?\((\d{1,3}),(\d{1,3}),(\d{1,3})(?:,([0-9.]+))?\)$/i);
  if (!m) return null;

  const r = Math.min(255, Math.max(0, Number(m[1])));
  const g = Math.min(255, Math.max(0, Number(m[2])));
  const b = Math.min(255, Math.max(0, Number(m[3])));
  const a = m[4] == null ? 1 : Math.min(1, Math.max(0, Number(m[4])));

  return { r, g, b, a };
}

function relLuminance({ r, g, b }: { r: number; g: number; b: number }) {
  // sRGB -> luminance
  const srgb = [r, g, b].map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function getBgColorCandidate(): string | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;

  const candidates: (HTMLElement | null)[] = [document.body, document.documentElement, getRootCandidate()];
  for (const el of candidates) {
    if (!el) continue;
    const bg = safeTrim(window.getComputedStyle(el).backgroundColor);
    if (!bg) continue;

    const rgb = parseRgb(bg);
    if (!rgb) continue;

    // jeśli transparent, szukamy dalej
    if (rgb.a === 0) continue;

    return bg;
  }
  return null;
}

function detectIsDark(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  const html = document.documentElement;
  const body = document.body;

  const htmlTheme = html.getAttribute("data-theme") || html.getAttribute("data-color-scheme");
  const bodyTheme = body?.getAttribute("data-theme") || body?.getAttribute("data-color-scheme");

  const pickTheme = (t: string | null) => {
    if (!t) return null;
    const v = t.toLowerCase();
    if (v.includes("dark")) return true;
    if (v.includes("light")) return false;
    return null;
  };

  const byAttr = pickTheme(htmlTheme) ?? pickTheme(bodyTheme);
  if (byAttr !== null) return byAttr;

  if (hasClassToken(html, "dark") || hasClassToken(body, "dark")) return true;
  if (hasClassToken(html, "light") || hasClassToken(body, "light")) return false;

  // color-scheme CSS (czasem ustawiane przez appkę)
  const csHtml = window.getComputedStyle(html).colorScheme?.toLowerCase?.() ?? "";
  const csBody = body ? window.getComputedStyle(body).colorScheme?.toLowerCase?.() ?? "" : "";
  const cs = `${csHtml} ${csBody}`;
  if (cs.includes("dark")) return true;
  if (cs.includes("light")) return false;

  // realny kolor tła (najpewniejsze)
  const bg = getBgColorCandidate();
  if (bg) {
    const rgb = parseRgb(bg);
    if (rgb) {
      const lum = relLuminance(rgb);
      // próg: < 0.5 traktujemy jako dark
      return lum < 0.5;
    }
  }

  // ostatecznie system
  return !!window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
}

function computeModalThemeTokens(): ThemeTokens {
  const isDark = detectIsDark();

  const dark = {
    modalBg: "#020617",
    modalText: "#E5E7EB",
    modalTextMuted: "#CBD5E1",
    modalTextSubtle: "#94A3B8",
    border: "rgba(148,163,184,0.18)",
    borderSubtle: "rgba(148,163,184,0.12)",
    surface2: "rgba(15,23,42,0.55)",
    backdrop: "rgba(2,6,23,0.72)",
    primaryBg: "#2563EB",
    primaryText: "#FFFFFF",
    secondaryBorder: "rgba(229,231,235,0.9)",
    secondaryText: "#E5E7EB",
    checkboxBg: "rgba(2,6,23,0.4)",
    checkboxBorder: "rgba(148,163,184,0.35)",
  };

  const light = {
    modalBg: "#FFFFFF",
    modalText: "#111827",
    modalTextMuted: "#374151",
    modalTextSubtle: "#6B7280",
    border: "rgba(17,24,39,0.12)",
    borderSubtle: "rgba(17,24,39,0.10)",
    surface2: "rgba(15,23,42,0.04)",
    backdrop: "rgba(17,24,39,0.45)",
    primaryBg: "#2563EB",
    primaryText: "#FFFFFF",
    secondaryBorder: "rgba(17,24,39,0.22)",
    secondaryText: "#111827",
    checkboxBg: "rgba(17,24,39,0.04)",
    checkboxBorder: "rgba(17,24,39,0.22)",
  };

  const d = isDark ? dark : light;

  // Czytamy vars, ale tylko jako nadpisanie (fallbacki z d są kluczowe)
  const modalBg = getCssVar(["--card", "--surface", "--background"], d.modalBg);
  const modalText = getCssVar(["--foreground"], d.modalText);
  const border = getCssVar(["--border"], d.border);

  const primaryBg = getCssVar(["--primary"], d.primaryBg);
  const primaryText = getCssVar(["--primary-foreground"], d.primaryText);

  const surface2 = getCssVar(["--muted"], d.surface2);
  const subtle = getCssVar(["--muted-foreground"], d.modalTextSubtle);

  return {
    isDark,

    modalBg,
    modalText,
    modalTextMuted: d.modalTextMuted,
    modalTextSubtle: subtle,

    border,
    borderSubtle: d.borderSubtle,
    surface2,

    backdrop: d.backdrop,

    primaryBg,
    primaryText,

    secondaryBorder: d.secondaryBorder,
    secondaryText: d.secondaryText,

    checkboxBg: d.checkboxBg,
    checkboxBorder: d.checkboxBorder,
    checkboxActiveBg: primaryBg,
    checkboxActiveBorder: primaryBg,
  };
}

function useModalThemeTokens() {
  const [tokens, setTokens] = useState<ThemeTokens>(() => computeModalThemeTokens());

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const update = () => setTokens(computeModalThemeTokens());

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const mqHandler = () => update();

    try {
      mq?.addEventListener?.("change", mqHandler);
    } catch {
      // @ts-expect-error
      mq?.addListener?.(mqHandler);
    }

    const root = getRootCandidate();

    const obs = new MutationObserver(() => update());
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme", "data-color-scheme"],
    });

    const obsBody = new MutationObserver(() => update());
    if (document.body) {
      obsBody.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme", "data-color-scheme"],
      });
    }

    const obsRoot = new MutationObserver(() => update());
    if (root) {
      obsRoot.observe(root, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme", "data-color-scheme"],
      });
    }

    // na wypadek, gdyby motyw zmieniał CSS variables bez atrybutów:
    const interval = window.setInterval(update, 800);

    return () => {
      obs.disconnect();
      obsBody.disconnect();
      obsRoot.disconnect();
      window.clearInterval(interval);

      try {
        mq?.removeEventListener?.("change", mqHandler);
      } catch {
        // @ts-expect-error
        mq?.removeListener?.(mqHandler);
      }
    };
  }, []);

  return tokens;
}

function createModalStyles(t: ThemeTokens) {
  return StyleSheet.create({
    overlay: {
      position: "fixed" as any,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      zIndex: 10000,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    backdropClickCatcher: {
      position: "absolute" as any,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: t.backdrop,
    },
    modal: {
      maxWidth: 520,
      width: "100%",
      backgroundColor: t.modalBg,
      borderRadius: 16,
      paddingHorizontal: 22,
      paddingVertical: 18,
      borderWidth: 1,
      borderColor: t.border,
      shadowColor: "#000000",
      shadowOpacity: t.isDark ? 0.35 : 0.18,
      shadowOffset: { width: 0, height: 16 },
      shadowRadius: 30,
      elevation: 10,
      zIndex: 1,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: t.modalText,
      marginBottom: 6,
    },
    modalSubtitle: {
      fontSize: 13,
      fontWeight: "700",
      color: t.modalTextMuted,
      marginBottom: 12,
    },
    list: {
      gap: 10,
      marginBottom: 16,
    },

    categoryRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.borderSubtle,
      backgroundColor: t.surface2,
    },
    categoryRowPressed: {
      backgroundColor: t.isDark ? "rgba(15,23,42,0.85)" : "rgba(15,23,42,0.07)",
      borderColor: t.border,
    },
    categoryTextWrapper: {
      flex: 1,
      paddingRight: 10,
    },
    categoryLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: t.modalText,
      marginBottom: 3,
    },
    categoryDescription: {
      fontSize: 12,
      color: t.modalTextSubtle,
      lineHeight: 16,
    },

    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.checkboxBorder,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 8,
      backgroundColor: t.checkboxBg,
    },
    checkboxActive: {
      backgroundColor: t.checkboxActiveBg,
      borderColor: t.checkboxActiveBorder,
    },
    checkboxLocked: {
      borderStyle: "dashed",
      opacity: 0.8,
    },
    checkboxTick: {
      color: t.primaryText,
      fontSize: 14,
      fontWeight: "900",
      transform: [{ translateY: -0.5 }],
    },

    // modal-only secondary (nie rusza bannera)
    modalSecondaryButton: {
      backgroundColor: "transparent",
      borderColor: t.secondaryBorder,
    },
    modalSecondaryButtonText: {
      color: t.secondaryText,
      fontSize: 13,
      fontWeight: "500",
    },
  });
}

const CookieBanner: React.FC = () => {
  // motyw tylko dla modala
  const modalTheme = useModalThemeTokens();
  const modalStyles = useMemo(() => createModalStyles(modalTheme), [modalTheme]);

  const [hasStoredConsent, setHasStoredConsent] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [consent, setConsent] = useState<CookieConsent>(DEFAULT_CONSENT);

  useEffect(() => {
    const stored = readConsentFromStorage();
    if (stored) {
      setHasStoredConsent(true);
      setBannerVisible(false);
      setConsent(stored);
    } else {
      setHasStoredConsent(false);
      setBannerVisible(true);
      setConsent(DEFAULT_CONSENT);
    }
  }, []);

  const internalSaveConsent = (newConsent: CookieConsent) => {
    saveConsentToStorage(newConsent);
    setHasStoredConsent(true);
    setBannerVisible(false);
    setSettingsOpen(false);
    setConsent(newConsent);
  };

  const handleAcceptAll = () => {
    const all: CookieConsent = {
      essential: true,
      functional: true,
      analytics: true,
      marketing: true,
      timestamp: new Date().toISOString(),
    };
    internalSaveConsent(all);
  };

  const handleRejectNonEssential = () => {
    const onlyEssential: CookieConsent = {
      essential: true,
      functional: false,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
    };
    internalSaveConsent(onlyEssential);
  };

  const handleOpenSettingsFromBanner = () => {
    setSettingsOpen(true);
    setConsent((prev) => ({
      ...DEFAULT_CONSENT,
      ...prev,
      essential: true,
    }));
  };

  const handleOpenSettingsFromButton = () => {
    setSettingsOpen(true);
    setBannerVisible(false);

    const stored = readConsentFromStorage();
    setConsent(
      stored
        ? { ...DEFAULT_CONSENT, ...stored, essential: true }
        : { ...DEFAULT_CONSENT, essential: true }
    );
  };

  const toggleCategory = (key: keyof CookieConsent) => {
    if (key === "essential" || key === "timestamp") return;
    setConsent((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveSettings = () => {
    const toSave: CookieConsent = {
      ...consent,
      essential: true,
      timestamp: new Date().toISOString(),
    };
    internalSaveConsent(toSave);
  };

  return (
    <>
      {/* Banner na dole (tylko gdy brak zapisanej zgody) */}
      {bannerVisible && (
        <View style={styles.bannerContainer}>
          <View style={styles.bannerTextWrapper}>
            <Text style={styles.title}>Ustawienia plików cookie</Text>
            <Text style={styles.description}>
              W MissionHome używamy plików cookie, aby serwis działał poprawnie oraz — za Twoją
              zgodą — do analityki, funkcji dodatkowych i marketingu. Możesz zaakceptować wszystkie
              lub dostosować ustawienia.
            </Text>

            <Pressable onPress={() => window.location.assign("/cookies")}>
              <Text style={styles.link}>Polityka cookies</Text>
            </Pressable>
          </View>

          <View style={styles.bannerButtonsRow}>
            <Pressable
              onPress={handleRejectNonEssential}
              style={({ pressed }) => [
                styles.button,
                styles.secondaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Tylko niezbędne</Text>
            </Pressable>

            <Pressable
              onPress={handleOpenSettingsFromBanner}
              style={({ pressed }) => [
                styles.button,
                styles.neutralButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.neutralButtonText}>Dostosuj</Text>
            </Pressable>

            <Pressable
              onPress={handleAcceptAll}
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Akceptuję wszystkie</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Okno ustawień (THEMED) */}
      {settingsOpen && (
        <View style={modalStyles.overlay}>
          <Pressable
            style={modalStyles.backdropClickCatcher}
            onPress={() => setSettingsOpen(false)}
          />
          <View style={modalStyles.modal}>
            <Text style={modalStyles.modalTitle}>Ustawienia plików cookie</Text>
            <Text style={modalStyles.modalSubtitle}>Twój obecny stan</Text>

            <View style={modalStyles.list}>
              <CategoryRow
                label="Niezbędne"
                description="Wymagane do prawidłowego działania serwisu. Zawsze aktywne."
                active
                locked
                onToggle={() => {}}
                modalStyles={modalStyles}
              />
              <CategoryRow
                label="Funkcjonalne"
                description="Ułatwiają korzystanie z serwisu (np. preferencje, wygoda)."
                active={consent.functional}
                onToggle={() => toggleCategory("functional")}
                modalStyles={modalStyles}
              />
              <CategoryRow
                label="Analityczne"
                description="Pomagają nam zrozumieć, jak używasz MissionHome i poprawiać produkt."
                active={consent.analytics}
                onToggle={() => toggleCategory("analytics")}
                modalStyles={modalStyles}
              />
              <CategoryRow
                label="Marketingowe"
                description="Umożliwiają dopasowanie komunikacji i ofert."
                active={consent.marketing}
                onToggle={() => toggleCategory("marketing")}
                modalStyles={modalStyles}
              />
            </View>

            <View style={styles.modalButtonsRow}>
              <Pressable
                onPress={handleRejectNonEssential}
                style={({ pressed }) => [
                  styles.button,
                  styles.modalButton,
                  modalStyles.modalSecondaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={modalStyles.modalSecondaryButtonText}>Anulowanie zgody</Text>
              </Pressable>

              <Pressable
                onPress={handleSaveSettings}
                style={({ pressed }) => [
                  styles.button,
                  styles.primaryButton,
                  styles.modalButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>Zmień swoją zgodę</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Przycisk Cookies (po zapisaniu zgody) - bez zmian */}
      {hasStoredConsent && !settingsOpen && (
        <View style={[styles.cookieButtonWrapper, bannerVisible && styles.cookieWithBanner]}>
          <Pressable
            onPress={handleOpenSettingsFromButton}
            style={({ pressed }) => [styles.cookieButton, pressed && styles.cookieButtonPressed]}
          >
            <Text style={styles.cookieIcon}>🍪</Text>
            <Text style={styles.cookieLabel}>Cookies</Text>
          </Pressable>
        </View>
      )}
    </>
  );
};

type CategoryRowProps = {
  label: string;
  description: string;
  active: boolean;
  locked?: boolean;
  onToggle: () => void;
  modalStyles: ReturnType<typeof createModalStyles>;
};

const CategoryRow: React.FC<CategoryRowProps> = ({
  label,
  description,
  active,
  locked,
  onToggle,
  modalStyles,
}) => {
  return (
    <Pressable
      onPress={!locked ? onToggle : undefined}
      style={({ pressed }) => [
        modalStyles.categoryRow,
        pressed && !locked && modalStyles.categoryRowPressed,
      ]}
    >
      <View style={modalStyles.categoryTextWrapper}>
        <Text style={modalStyles.categoryLabel}>{label}</Text>
        <Text style={modalStyles.categoryDescription}>{description}</Text>
      </View>

      <View
        style={[
          modalStyles.checkbox,
          active && modalStyles.checkboxActive,
          locked && modalStyles.checkboxLocked,
        ]}
      >
        {active && <Text style={modalStyles.checkboxTick}>✓</Text>}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  bannerContainer: {
    position: "fixed" as any,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(15,23,42,0.96)",
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.4)",
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  bannerTextWrapper: {
    flex: 1,
    minWidth: 220,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  description: {
    color: "#E5E7EB",
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    color: "#60A5FA",
    marginTop: 8,
    fontSize: 13,
    textDecorationLine: "underline",
  },
  bannerButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 13,
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderColor: "rgba(229,231,235,0.9)",
  },
  secondaryButtonText: {
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "500",
  },
  neutralButton: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
  },
  neutralButtonText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "500",
  },

  // wspólne dla modala (layout) – kolory są w modalStyles
  modalButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 6,
  },
  modalButton: {
    minWidth: 160,
    justifyContent: "center",
    alignItems: "center",
  },

  cookieButtonWrapper: {
    position: "fixed" as any,
    left: 12,
    bottom: 16,
    zIndex: 9999,
  },
  cookieWithBanner: {
    bottom: 82,
  },
  cookieButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  cookieButtonPressed: {
    opacity: 0.85,
  },
  cookieIcon: {
    fontSize: 14,
  },
  cookieLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#111827",
  },
});

export default CookieBanner;
