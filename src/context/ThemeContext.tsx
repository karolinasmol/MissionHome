// src/context/ThemeContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from "react";

export type Theme =
  | "light"
  | "dark"
  | "pink"
  | "yellow"
  | "brown"
  | "purple"
  | "blue"
  | "green";

export type ThemeColors = {
  bg: string;
  card: string;
  text: string;
  textMuted: string;
  accent: string;
  border: string;
};

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEMES_CYCLE: Theme[] = [
  "dark",
  "light",
  "pink",
  "yellow",
  "brown",
  "purple",
  "blue",
  "green",
];

// ✅ eksport listy theme’ów do UI (np. settings)
export const THEMES = THEMES_CYCLE;

const BASE_COLORS = {
  border: "rgba(0,0,0,0.15)",
} satisfies Partial<ThemeColors>;

const THEME_COLORS: Record<Theme, ThemeColors> = {
  dark: {
    bg: "#1a2433",
    card: "#273244",
    text: "#e6edf3",
    textMuted: "#9caabd",
    accent: "#1dd4c7",
    border: "rgba(255,255,255,0.12)",
  },
  light: {
    bg: "#b6eee5",
    card: "#d9f7f3",
    text: "#083b39",
    textMuted: "#1b746e",
    accent: "#1ab8ad",
    border: "rgba(0,90,85,0.25)",
  },
  pink: {
    bg: "#ffb6d5",
    card: "#ffd1e8",
    text: "#6b0039",
    textMuted: "#9e4a6f",
    accent: "#ff4fa3",
    border: "rgba(255,0,150,0.25)",
  },
  yellow: {
    bg: "#fff4b0",
    card: "#fff8cc",
    text: "#5d5200",
    textMuted: "#9d8f3c",
    accent: "#ffd500",
    border: "rgba(255,200,0,0.3)",
  },
  brown: {
    bg: "#42372b",
    card: "#5a4a3a",
    text: "#f2e6d8",
    textMuted: "#c7b299",
    accent: "#c38b66",
    border: "rgba(210,180,150,0.25)",
  },
  purple: {
    bg: "#bda6ff",
    card: "#d8c9ff",
    text: "#2c006b",
    textMuted: "#614a99",
    accent: "#8d4fff",
    border: "rgba(120,0,255,0.25)",
  },
  blue: {
    bg: "#a3d0ff",
    card: "#c7e2ff",
    text: "#003d6b",
    textMuted: "#4a79a1",
    accent: "#2f8dff",
    border: "rgba(0,120,255,0.25)",
  },
  green: {
    bg: "#b6ffb3",
    card: "#d7ffd6",
    text: "#0f5f00",
    textMuted: "#3f8b3a",
    accent: "#3cff2f",
    border: "rgba(0,200,60,0.25)",
  },
};

// ✅ eksport mapy kolorów do UI (podglądy w settings)
export const THEME_COLORS_MAP = THEME_COLORS;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const currentIndex = THEMES_CYCLE.indexOf(prev);
      const nextIndex = (currentIndex + 1) % THEMES_CYCLE.length;
      return THEMES_CYCLE[nextIndex];
    });
  }, []);

  const value = useMemo(
    () => ({ theme, toggleTheme, setTheme }),
    [theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// --- helpers do isDark (luminancja bg) ---
function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (!(h.length === 3 || h.length === 6)) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function relativeLuminance(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1; // jak nie umiemy policzyć, traktuj jako jasne
  const srgb = [rgb.r, rgb.g, rgb.b].map((v) => v / 255);
  const lin = srgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  // WCAG
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function useThemeColors() {
  const { theme } = useTheme();

  const colors = useMemo(() => {
    return { ...BASE_COLORS, ...THEME_COLORS[theme] } as ThemeColors;
  }, [theme]);

  // ✅ lepsze niż `theme === "dark"`
  const isDark = useMemo(() => {
    // jak bg jest ciemne (luminancja niska) => dark UI
    const L = clamp01(relativeLuminance(colors.bg));
    return L < 0.42;
  }, [colors.bg]);

  return { isDark, colors };
}

// src/context/ThemeContext.tsx
