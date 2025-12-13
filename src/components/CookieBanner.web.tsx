// src/components/CookieBanner.web.tsx
import React, { useEffect, useState } from "react";
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

const CookieBanner: React.FC = () => {
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

      {/* Okno ustawień */}
      {settingsOpen && (
        <View style={styles.overlay}>
          <Pressable style={styles.backdropClickCatcher} onPress={() => setSettingsOpen(false)} />
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Ustawienia plików cookie</Text>
            <Text style={styles.modalSubtitle}>Twój obecny stan</Text>

            <View style={styles.list}>
              <CategoryRow
                label="Niezbędne"
                description="Wymagane do prawidłowego działania serwisu. Zawsze aktywne."
                active
                locked
                onToggle={() => {}}
              />
              <CategoryRow
                label="Funkcjonalne"
                description="Ułatwiają korzystanie z serwisu (np. preferencje, wygoda)."
                active={consent.functional}
                onToggle={() => toggleCategory("functional")}
              />
              <CategoryRow
                label="Analityczne"
                description="Pomagają nam zrozumieć, jak używasz MissionHome i poprawiać produkt."
                active={consent.analytics}
                onToggle={() => toggleCategory("analytics")}
              />
              <CategoryRow
                label="Marketingowe"
                description="Umożliwiają dopasowanie komunikacji i ofert."
                active={consent.marketing}
                onToggle={() => toggleCategory("marketing")}
              />
            </View>

            <View style={styles.modalButtonsRow}>
              <Pressable
                onPress={handleRejectNonEssential}
                style={({ pressed }) => [
                  styles.button,
                  styles.secondaryButton,
                  styles.modalButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Anulowanie zgody</Text>
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

      {/* Przycisk Cookies (po zapisaniu zgody) */}
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
};

const CategoryRow: React.FC<CategoryRowProps> = ({ label, description, active, locked, onToggle }) => {
  return (
    <Pressable
      onPress={!locked ? onToggle : undefined}
      style={({ pressed }) => [
        styles.categoryRow,
        pressed && !locked && styles.categoryRowPressed,
      ]}
    >
      <View style={styles.categoryTextWrapper}>
        <Text style={styles.categoryLabel}>{label}</Text>
        <Text style={styles.categoryDescription}>{description}</Text>
      </View>

      <View
        style={[
          styles.checkbox,
          active && styles.checkboxActive,
          locked && styles.checkboxLocked,
        ]}
      >
        {active && <Text style={styles.checkboxTick}>✓</Text>}
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

  // ====== MODAL (ciemny) ======
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
    backgroundColor: "rgba(2,6,23,0.72)",
  },
  modal: {
    maxWidth: 520,
    width: "100%",
    backgroundColor: "#020617",
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 30,
    elevation: 10,
    zIndex: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#E5E7EB",
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#CBD5E1",
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
    borderColor: "rgba(148,163,184,0.12)",
    backgroundColor: "rgba(15,23,42,0.55)",
  },
  categoryRowPressed: {
    backgroundColor: "rgba(15,23,42,0.85)",
    borderColor: "rgba(148,163,184,0.18)",
  },
  categoryTextWrapper: {
    flex: 1,
    paddingRight: 10,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#E5E7EB",
    marginBottom: 3,
  },
  categoryDescription: {
    fontSize: 12,
    color: "#94A3B8",
    lineHeight: 16,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    backgroundColor: "rgba(2,6,23,0.4)",
  },
  checkboxActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  checkboxLocked: {
    borderStyle: "dashed",
    opacity: 0.8,
  },
  checkboxTick: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    transform: [{ translateY: -0.5 }],
  },

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
