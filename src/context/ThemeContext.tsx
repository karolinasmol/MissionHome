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
  useSyncExternalStore,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * ✅ Motywy kolorystyczne
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
 * ✅ Kolejność cyklicznego przełączania
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
 * ✅ export mapy kolorów do UI (podglądy w settings)
 */
export const THEME_COLORS_MAP: Record<Theme, ThemeColors> = THEME_COLORS;

const LS_THEME_KEY = "missionhome_theme";
const LS_PATTERN_KEY = "missionhome_pattern";
const isWeb = Platform.OS === "web";

/* ----------------------- Helpers: storage ----------------------- */

function getWebStorage(): Storage | null {
  // ✅ localStorage -> sessionStorage -> null
  try {
    if (typeof window === "undefined") return null;

    // localStorage test
    const s = window.localStorage;
    const k = "__mh_test__";
    s.setItem(k, "1");
    s.removeItem(k);
    return s;
  } catch {
    try {
      if (typeof window === "undefined") return null;
      const s = window.sessionStorage;
      const k = "__mh_test__";
      s.setItem(k, "1");
      s.removeItem(k);
      return s;
    } catch {
      return null;
    }
  }
}

async function storageGet(key: string): Promise<string | null> {
  try {
    if (isWeb) {
      const s = getWebStorage();
      return s ? s.getItem(key) : null;
    }
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function storageSet(key: string, value: string): Promise<void> {
  try {
    if (isWeb) {
      const s = getWebStorage();
      if (s) s.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  } catch {}
}

/* ----------------------- Helpers: normalize ----------------------- */

function unwrapStoredString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let s = v.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.length ? s : null;
}

function normalizeStoredKey(v: unknown): string | null {
  const s = unwrapStoredString(v);
  return s ? s.toLowerCase() : null;
}

function toTheme(v: unknown): Theme | null {
  const key = normalizeStoredKey(v);
  if (!key) return null;
  return (THEMES_CYCLE as string[]).includes(key) ? (key as Theme) : null;
}

function toPattern(v: unknown): BackgroundPattern | null {
  const key = normalizeStoredKey(v);
  if (!key) return null;
  return (PATTERNS_CYCLE as string[]).includes(key)
    ? (key as BackgroundPattern)
    : null;
}

/* ----------------------- WEB store (dla tej samej karty) ----------------------- */

const WEB_THEME_EVENT = "missionhome:theme-change";

/**
 * Snapshot jako STRING (stabilny) — używamy go WYŁĄCZNIE do “pingowania” subskrypcji.
 * Nie jest już źródłem prawdy o motywie (to jest Context).
 */
function readWebSnapshotKey(): string {
  const s = getWebStorage();
  if (!s) return "__no_storage__";
  const t = toTheme(s.getItem(LS_THEME_KEY)) ?? "dark";
  const p = toPattern(s.getItem(LS_PATTERN_KEY)) ?? "none";
  return `${t}|${p}`;
}

function subscribeWebSnapshot(onStoreChange: () => void) {
  if (!isWeb || typeof window === "undefined") return () => {};

  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_THEME_KEY || e.key === LS_PATTERN_KEY) onStoreChange();
  };

  const onCustom = () => onStoreChange();

  window.addEventListener("storage", onStorage);
  window.addEventListener(WEB_THEME_EVENT, onCustom as any);

  // w tej samej karcie storage event nie odpala → polling
  const id = window.setInterval(onStoreChange, 250);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(WEB_THEME_EVENT, onCustom as any);
    window.clearInterval(id);
  };
}

function emitWebThemeEvent() {
  if (!isWeb || typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(WEB_THEME_EVENT));
  } catch {}
}

/* ----------------------- Provider ----------------------- */

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [pattern, setPatternState] = useState<BackgroundPattern>("none");

  // refs do porównań w sync
  const themeRef = useRef<Theme>("dark");
  const patternRef = useRef<BackgroundPattern>("none");

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);

  // ✅ wczytanie ustawień (web/native)
  useEffect(() => {
    let alive = true;

    (async () => {
      const tRaw = await storageGet(LS_THEME_KEY);
      const t = toTheme(tRaw);
      if (alive && t) setThemeState(t);

      const pRaw = await storageGet(LS_PATTERN_KEY);
      const p = toPattern(pRaw);
      if (alive && p) setPatternState(p);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // ✅ setTheme / setPattern = jedyne miejsce, które ZAPISUJE do storage
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    storageSet(LS_THEME_KEY, t);
    emitWebThemeEvent(); // ta sama karta
  }, []);

  const setPattern = useCallback((p: BackgroundPattern) => {
    setPatternState(p);
    storageSet(LS_PATTERN_KEY, p);
    emitWebThemeEvent(); // ta sama karta
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const currentIndex = THEMES_CYCLE.indexOf(prev);
      const nextIndex = (currentIndex + 1) % THEMES_CYCLE.length;
      const next = THEMES_CYCLE[nextIndex];
      storageSet(LS_THEME_KEY, next);
      emitWebThemeEvent();
      return next;
    });
  }, []);

  const togglePattern = useCallback(() => {
    setPatternState((prev) => {
      const currentIndex = PATTERNS_CYCLE.indexOf(prev);
      const nextIndex = (currentIndex + 1) % PATTERNS_CYCLE.length;
      const next = PATTERNS_CYCLE[nextIndex];
      storageSet(LS_PATTERN_KEY, next);
      emitWebThemeEvent();
      return next;
    });
  }, []);

  /**
   * ✅ SYNC web:
   * - między kartami: storage event
   * - w tej samej karcie: custom event + polling (subscribeWebSnapshot)
   */
  useEffect(() => {
    if (!isWeb) return;

    const s = getWebStorage();
    if (!s || typeof window === "undefined") return;

    const syncFromStorage = () => {
      const t = toTheme(s.getItem(LS_THEME_KEY));
      if (t && t !== themeRef.current) setThemeState(t);

      const p = toPattern(s.getItem(LS_PATTERN_KEY));
      if (p && p !== patternRef.current) setPatternState(p);
    };

    // start
    syncFromStorage();

    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_THEME_KEY || e.key === LS_PATTERN_KEY) {
        syncFromStorage();
      }
    };

    window.addEventListener("storage", onStorage);

    const id = window.setInterval(syncFromStorage, 250);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(id);
    };
  }, []);

  /**
   * ✅ KLUCZ: wypchnięcie theme do DOM na WEB
   * Dzięki temu komponenty web (np. Cookie modal) mogą czytać aktualny motyw z CSS vars / dataset / klasy.
   */
  useEffect(() => {
    applyWebThemeToDom(theme, pattern);
  }, [theme, pattern]);

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

/* ----------------------- Snapshot keys (WEB) ----------------------- */

/**
 * ✅ KLUCZOWA ZMIANA:
 * - Na WEB nadal subskrybujemy zmiany (żeby “pingować” rerender),
 * - ale ŹRÓDŁEM PRAWDY jest Context (ctx.theme/ctx.pattern), NIE localStorage.
 */
function useThemeSnapshotKeys(): { theme: Theme; pattern: BackgroundPattern } {
  const ctx = useTheme();

  if (!isWeb || typeof window === "undefined") {
    return { theme: ctx.theme, pattern: ctx.pattern };
  }

  // subskrypcja tylko po to, żeby odświeżyć komponenty, gdy storage zmieni się w innej karcie
  useSyncExternalStore(subscribeWebSnapshot, readWebSnapshotKey, () => "__no_storage__");

  // ✅ SOURCE OF TRUTH:
  return { theme: ctx.theme, pattern: ctx.pattern };
}

/* ----------------------- Color utils ----------------------- */

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
 * ✅ WEB: helper – dobór koloru tekstu pod tło (biały/ciemny)
 */
function onColorForHex(hex: string) {
  const L = clamp01(relativeLuminance(hex));
  return L > 0.6 ? "#0b1020" : "#ffffff";
}

/**
 * ✅ WEB: wypchnięcie motywu do DOM (dataset + class + CSS variables)
 * Dzięki temu komponenty webowe mogą czytać temat z CSS vars / data-theme.
 */
function applyWebThemeToDom(theme: Theme, pattern: BackgroundPattern) {
  if (!isWeb || typeof document === "undefined") return;

  const root = document.documentElement;
  const c = getActiveThemeColors(theme);
  const isDark = clamp01(relativeLuminance(c.bg)) < 0.42;

  // dataset + class (do wykrywania)
  root.dataset.theme = theme;
  root.dataset.pattern = pattern;
  root.dataset.colorScheme = isDark ? "dark" : "light";
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";

  // CSS variables (tokeny dla web UI)
  const vars: Record<string, string> = {
    "--background": c.bg,
    "--foreground": c.text,

    "--card": c.card,
    "--card-foreground": c.text,

    "--muted": c.card,
    "--muted-foreground": c.textMuted,

    "--border": c.border,
    "--input": c.border,

    "--primary": c.accent,
    "--primary-foreground": onColorForHex(c.accent),

    "--secondary": c.card,
    "--secondary-foreground": c.text,

    "--ring": c.accent,
  };

  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}

/**
 * ✅ Patterny tła (web: backgroundImage; native: tylko backgroundColor)
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
  const { theme } = useThemeSnapshotKeys();

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
  const { pattern } = useThemeSnapshotKeys();
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
