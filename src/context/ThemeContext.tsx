// src/context/ThemeContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
  CSSProperties,
} from "react";

/**
 * ✅ Motywy kolorystyczne
 * ❌ usunięte: lavender, pink, custom
 */
export type Theme =
  | "dark"
  | "light"
  | "slate"
  | "midnight"
  | "ocean"
  | "forest"
  | "coffee"
  | "sand"
  | "blue"
  | "green"
  | "mint"
  | "teal"
  | "purple"
  | "rose"
  | "crimson"
  | "orange"
  | "sunset"
  | "yellow"
  | "cyber"
  | "mono"
  | "brown"
  | "arcade";

export type ThemeColors = {
  bg: string;
  card: string;
  text: string;
  textMuted: string;
  accent: string;
  border: string;
};

/**
 * ✅ Wzorki / patterny tła (opcjonalne)
 */
export type BackgroundPattern =
  | "none"
  | "dots"
  | "grid"
  | "diagonal"
  | "zigzag"
  | "waves"
  | "honeycomb"
  | "confetti";

/**
 * ✅ Nazwy (pod UI) — jednosłowne
 */
export const THEME_LABELS: Record<Theme, string> = {
  dark: "dark",
  light: "light",
  slate: "slate",
  midnight: "midnight",
  ocean: "ocean",
  forest: "forest",
  coffee: "coffee",
  sand: "sand",
  blue: "blue",
  green: "green",
  mint: "mint",
  teal: "teal",
  purple: "purple",
  rose: "rose",
  crimson: "crimson",
  orange: "orange",
  sunset: "sunset",
  yellow: "yellow",
  cyber: "cyber",
  mono: "mono",
  brown: "brown",
  arcade: "arcade",
};

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;

  pattern: BackgroundPattern;
  togglePattern: () => void;
  setPattern: (p: BackgroundPattern) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * ✅ Kolejność cyklicznego przełączania (możesz ją zmienić jak chcesz)
 */
const THEMES_CYCLE: Theme[] = [
  "dark",
  "light",
  "slate",
  "midnight",
  "ocean",
  "forest",
  "coffee",
  "sand",
  "blue",
  "green",
  "mint",
  "teal",
  "purple",
  "rose",
  "crimson",
  "orange",
  "sunset",
  "yellow",
  "cyber",
  "mono",
  "brown",
  "arcade",
];

// ✅ eksport listy theme’ów do UI (np. settings)
export const THEMES = THEMES_CYCLE;

const PATTERNS_CYCLE: BackgroundPattern[] = [
  "none",
  "dots",
  "grid",
  "diagonal",
  "zigzag",
  "waves",
  "honeycomb",
  "confetti",
];

// ✅ eksport listy patternów do UI (np. settings)
export const PATTERNS = PATTERNS_CYCLE;

const BASE_COLORS = {
  border: "rgba(0,0,0,0.15)",
} satisfies Partial<ThemeColors>;

/**
 * ✅ Kolory motywów
 */
export const THEME_COLORS: Record<Theme, ThemeColors> = {
  dark: {
    bg: "#141b26",
    card: "#1f2937",
    text: "#e6edf3",
    textMuted: "#a3b0c2",
    accent: "#1dd4c7",
    border: "rgba(255,255,255,0.12)",
  },
  light: {
    bg: "#9edbd1",
    card: "#c4eee8",
    text: "#083b39",
    textMuted: "#1b746e",
    accent: "#0fb4a8",
    border: "rgba(0,90,85,0.25)",
  },
  slate: {
    bg: "#2a3441",
    card: "#364253",
    text: "#e9eef6",
    textMuted: "#b6c3d6",
    accent: "#7cc4ff",
    border: "rgba(255,255,255,0.12)",
  },
  midnight: {
    bg: "#0b1020",
    card: "#111a2f",
    text: "#e9eeff",
    textMuted: "#a4b0d6",
    accent: "#6ea8ff",
    border: "rgba(255,255,255,0.12)",
  },
  ocean: {
    bg: "#0e2a2f",
    card: "#123740",
    text: "#e9fbff",
    textMuted: "#a6cbd3",
    accent: "#35e3c6",
    border: "rgba(255,255,255,0.12)",
  },
  forest: {
    bg: "#13261b",
    card: "#1a3324",
    text: "#e9f7ef",
    textMuted: "#a7c9b4",
    accent: "#3de28c",
    border: "rgba(255,255,255,0.12)",
  },
  coffee: {
    bg: "#211a16",
    card: "#2b221d",
    text: "#f4ede7",
    textMuted: "#cbb9ad",
    accent: "#f0b27a",
    border: "rgba(255,255,255,0.12)",
  },
  sand: {
    bg: "#d7c7aa",
    card: "#eadfca",
    text: "#3d2f1e",
    textMuted: "#6b5a42",
    accent: "#b56a2a",
    border: "rgba(80,55,30,0.22)",
  },
  blue: {
    bg: "#84bdf2",
    card: "#b2d7ff",
    text: "#003457",
    textMuted: "#3f6b93",
    accent: "#2b82ff",
    border: "rgba(0,120,255,0.25)",
  },
  green: {
    bg: "#9be69a",
    card: "#c5f6c5",
    text: "#0f4f00",
    textMuted: "#357a33",
    accent: "#2fe96a",
    border: "rgba(0,200,60,0.25)",
  },
  mint: {
    bg: "#7ed9c8",
    card: "#b0f0e6",
    text: "#063a35",
    textMuted: "#1f6f68",
    accent: "#11c6a9",
    border: "rgba(0,90,85,0.22)",
  },
  teal: {
    bg: "#1f4d57",
    card: "#2a616e",
    text: "#e8fbff",
    textMuted: "#b2d6df",
    accent: "#2fe0d1",
    border: "rgba(255,255,255,0.12)",
  },
  purple: {
    bg: "#a58cf2",
    card: "#c6b2ff",
    text: "#24005a",
    textMuted: "#5a458e",
    accent: "#7f46ff",
    border: "rgba(120,0,255,0.25)",
  },
  rose: {
    bg: "#d882a8",
    card: "#f0b0cf",
    text: "#4b0026",
    textMuted: "#7b3b5a",
    accent: "#ff4f8d",
    border: "rgba(255,0,120,0.22)",
  },
  crimson: {
    bg: "#3a0f1c",
    card: "#4c1626",
    text: "#ffe9ee",
    textMuted: "#e0b4bf",
    accent: "#ff3b5c",
    border: "rgba(255,255,255,0.12)",
  },
  orange: {
    bg: "#6b3a12",
    card: "#824717",
    text: "#fff1e6",
    textMuted: "#f0c9ad",
    accent: "#ff8a2a",
    border: "rgba(255,255,255,0.12)",
  },
  sunset: {
    bg: "#2b1636",
    card: "#3a1f4a",
    text: "#fff0fb",
    textMuted: "#e0bfe0",
    accent: "#ff7a45",
    border: "rgba(255,255,255,0.12)",
  },
  yellow: {
    bg: "#f3e289",
    card: "#f7edb2",
    text: "#4f4500",
    textMuted: "#877b2f",
    accent: "#ffcc00",
    border: "rgba(255,200,0,0.3)",
  },
  cyber: {
    bg: "#0a0f0d",
    card: "#0f1714",
    text: "#eafff5",
    textMuted: "#a5c7b6",
    accent: "#34ff6a",
    border: "rgba(52,255,106,0.25)",
  },
  mono: {
    bg: "#101010",
    card: "#1a1a1a",
    text: "#f3f3f3",
    textMuted: "#bdbdbd",
    accent: "#ffffff",
    border: "rgba(255,255,255,0.14)",
  },
  brown: {
    bg: "#32291f",
    card: "#4a3c2f",
    text: "#f2e6d8",
    textMuted: "#c7b299",
    accent: "#b67c5a",
    border: "rgba(210,180,150,0.25)",
  },
  arcade: {
    bg: "#0f172a",
    card: "#141b33",
    text: "#eef2ff",
    textMuted: "#a6b3d6",
    accent: "#22d3ee",
    border: "rgba(251,191,36,0.22)",
  },
};

/**
 * ✅ WAŻNE: export mapy kolorów do UI (podglądy w settings)
 */
export const THEME_COLORS_MAP: Record<Theme, ThemeColors> = THEME_COLORS;

const LS_THEME_KEY = "missionhome_theme";
const LS_PATTERN_KEY = "missionhome_pattern";

function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEMES_CYCLE as string[]).includes(v);
}
function isPattern(v: unknown): v is BackgroundPattern {
  return typeof v === "string" && (PATTERNS_CYCLE as string[]).includes(v);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [pattern, setPatternState] = useState<BackgroundPattern>("none");

  // refs do porównań w sync (bez zależności i bez “pętli”)
  const themeRef = useRef<Theme>("dark");
  const patternRef = useRef<BackgroundPattern>("none");

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);

  // ✅ wczytanie ustawień z localStorage (jeśli jest)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const t = window.localStorage.getItem(LS_THEME_KEY);
    if (isTheme(t)) setThemeState(t);

    const p = window.localStorage.getItem(LS_PATTERN_KEY);
    if (isPattern(p)) setPatternState(p);
  }, []);

  // ✅ setTheme / setPattern = jedyne miejsce, które ZAPISUJE do localStorage
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_THEME_KEY, t);
    }
  }, []);

  const setPattern = useCallback((p: BackgroundPattern) => {
    setPatternState(p);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_PATTERN_KEY, p);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const currentIndex = THEMES_CYCLE.indexOf(prev);
      const nextIndex = (currentIndex + 1) % THEMES_CYCLE.length;
      const next = THEMES_CYCLE[nextIndex];

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LS_THEME_KEY, next);
      }
      return next;
    });
  }, []);

  const togglePattern = useCallback(() => {
    setPatternState((prev) => {
      const currentIndex = PATTERNS_CYCLE.indexOf(prev);
      const nextIndex = (currentIndex + 1) % PATTERNS_CYCLE.length;
      const next = PATTERNS_CYCLE[nextIndex];

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LS_PATTERN_KEY, next);
      }
      return next;
    });
  }, []);

  /**
   * ✅ SYNC z localStorage:
   * - storage event działa między kartami
   * - w tej samej karcie storage NIE odpala -> dajemy lekki polling
   *
   * WAŻNE: ten efekt TYLKO CZYTA localStorage i aktualizuje stan.
   * Nie zapisuje z powrotem, więc nie ma “dyskoteki”.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromStorage = () => {
      const t = window.localStorage.getItem(LS_THEME_KEY);
      if (isTheme(t) && t !== themeRef.current) {
        setThemeState(t);
      }

      const p = window.localStorage.getItem(LS_PATTERN_KEY);
      if (isPattern(p) && p !== patternRef.current) {
        setPatternState(p);
      }
    };

    // start
    syncFromStorage();

    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_THEME_KEY || e.key === LS_PATTERN_KEY) {
        syncFromStorage();
      }
    };

    window.addEventListener("storage", onStorage);

    // gwarancja dla tej samej karty (ale bez zapisu => brak pętli)
    const id = window.setInterval(syncFromStorage, 250);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(id);
    };
  }, []);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme,
      setTheme,
      pattern,
      togglePattern,
      setPattern,
    }),
    [theme, toggleTheme, setTheme, pattern, togglePattern, setPattern]
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

function getActiveThemeColors(theme: Theme): ThemeColors {
  return THEME_COLORS[theme];
}

/**
 * ✅ Patterny tła – zwracamy style, które możesz wrzucić np. na wrappera aplikacji.
 * Uwaga: nie nadpisujemy backgroundColor – to weź z colors.bg (albo w tym hooku).
 */
function getPatternStyle(
  pattern: BackgroundPattern,
  isDark: boolean,
  colors: ThemeColors
): Pick<CSSProperties, "backgroundImage" | "backgroundSize" | "backgroundPosition"> {
  if (pattern === "none") {
    return {
      backgroundImage: "none",
      backgroundSize: undefined,
      backgroundPosition: undefined,
    };
  }

  const inkA = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const inkB = isDark ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.035)";
  const accent = colors.accent;

  switch (pattern) {
    case "dots":
      return {
        backgroundImage: `radial-gradient(${inkA} 1px, transparent 1px)`,
        backgroundSize: "18px 18px",
        backgroundPosition: "0 0",
      };

    case "grid":
      return {
        backgroundImage: `
          linear-gradient(${inkA} 1px, transparent 1px),
          linear-gradient(90deg, ${inkA} 1px, transparent 1px)
        `,
        backgroundSize: "22px 22px",
        backgroundPosition: "0 0, 0 0",
      };

    case "diagonal":
      return {
        backgroundImage: `repeating-linear-gradient(
          45deg,
          ${inkB},
          ${inkB} 10px,
          transparent 10px,
          transparent 20px
        )`,
        backgroundSize: "auto",
        backgroundPosition: "0 0",
      };

    case "zigzag":
      return {
        backgroundImage: `
          linear-gradient(135deg, ${inkA} 25%, transparent 25%),
          linear-gradient(225deg, ${inkA} 25%, transparent 25%),
          linear-gradient(45deg, ${inkA} 25%, transparent 25%),
          linear-gradient(315deg, ${inkA} 25%, transparent 25%)
        `,
        backgroundSize: "28px 28px",
        backgroundPosition: "0 0, 0 14px, 14px -14px, -14px 0px",
      };

    case "waves":
      return {
        backgroundImage: `
          radial-gradient(circle at 20% 10%, ${inkB} 0 10px, transparent 11px),
          radial-gradient(circle at 80% 30%, ${inkB} 0 10px, transparent 11px),
          radial-gradient(circle at 30% 80%, ${inkB} 0 12px, transparent 13px),
          radial-gradient(circle at 70% 90%, ${inkB} 0 12px, transparent 13px)
        `,
        backgroundSize: "120px 120px",
        backgroundPosition: "0 0",
      };

    case "honeycomb":
      return {
        backgroundImage: `
          linear-gradient(30deg, ${inkA} 12%, transparent 12.5%, transparent 87%, ${inkA} 87.5%, ${inkA}),
          linear-gradient(150deg, ${inkA} 12%, transparent 12.5%, transparent 87%, ${inkA} 87.5%, ${inkA}),
          linear-gradient(90deg, ${inkA} 12%, transparent 12.5%, transparent 87%, ${inkA} 87.5%, ${inkA})
        `,
        backgroundSize: "44px 76px",
        backgroundPosition: "0 0, 0 0, 0 0",
      };

    case "confetti":
      return {
        backgroundImage: `
          radial-gradient(${accent}22 2px, transparent 3px),
          radial-gradient(${inkA} 2px, transparent 3px),
          radial-gradient(${inkB} 2px, transparent 3px)
        `,
        backgroundSize: "46px 46px, 36px 36px, 28px 28px",
        backgroundPosition: "0 0, 14px 10px, 22px 18px",
      };
  }
}

export function useThemeColors() {
  const { theme } = useTheme();

  const colors = useMemo(() => {
    const active = getActiveThemeColors(theme);
    return { ...BASE_COLORS, ...active } as ThemeColors;
  }, [theme]);

  const isDark = useMemo(() => {
    const L = clamp01(relativeLuminance(colors.bg));
    return L < 0.42;
  }, [colors.bg]);

  return { isDark, colors };
}

/**
 * ✅ Hook do łatwego podpięcia tła (kolor + wzorek)
 */
export function useThemeBackground() {
  const { pattern } = useTheme();
  const { isDark, colors } = useThemeColors();

  const backgroundStyle = useMemo<CSSProperties>(() => {
    const p = getPatternStyle(pattern, isDark, colors);
    return {
      backgroundColor: colors.bg,
      ...p,
    };
  }, [pattern, isDark, colors]);

  return { backgroundStyle, pattern };
}

// src/context/ThemeContext.tsx
