import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { useThemeColors, ThemeColors } from "./ThemeContext";

export type RepeatType = "none" | "daily" | "weekly" | "monthly";

export type Chore = {
  id: string;
  title: string;
  assignedBy: string;
  assignedTo: string;
  dueDate: string; // ISO
  lastDoneBy?: string;
  lastDoneAt?: string;
  repeat?: {
    type: RepeatType;
  };
};

const MOCK_USER_NAME = "Ty";

const INITIAL_CHORES: Chore[] = [
  {
    id: "1",
    title: "Wynieść śmieci",
    assignedBy: "Mama",
    assignedTo: MOCK_USER_NAME,
    dueDate: new Date().toISOString(),
    lastDoneBy: "Ty",
    lastDoneAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    repeat: { type: "weekly" },
  },
  {
    id: "2",
    title: "Umyć podłogę w kuchni",
    assignedBy: "Ty",
    assignedTo: MOCK_USER_NAME,
    dueDate: new Date().toISOString(),
    repeat: { type: "none" },
  },
];

type UserProgress = {
  level: number;
  currentExp: number;
  nextLevelExp: number;
};

type TasksUI = {
  colors: ThemeColors;
  isDark: boolean;

  screenBg: string;
  cardBg: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;

  overdue: string;
  dueSoon: string;
  ok: string;
};

type TasksContextValue = {
  chores: Chore[];
  addChore: (input: Omit<Chore, "id">) => void;
  removeChore: (id: string) => void;
  userProgress: UserProgress;

  // ✅ spójne z aktualnym motywem z ThemeContext
  ui: TasksUI;

  // ✅ helper: stan terminu
  getChoreState: (chore: Chore) => "overdue" | "dueSoon" | "ok";
};

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

function parseIso(iso: string) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const [chores, setChores] = useState<Chore[]>(INITIAL_CHORES);

  // ✅ źródło prawdy o kolorach: ThemeContext
  const { isDark, colors } = useThemeColors();

  const addChore = useCallback((input: Omit<Chore, "id">) => {
    setChores((prev) => [
      {
        ...input,
        id: String(Date.now()) + Math.random().toString(16).slice(2),
      },
      ...prev,
    ]);
  }, []);

  const removeChore = useCallback((id: string) => {
    setChores((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // ⭐ tymczasowy mock exp/level — aż podłączymy Firestore
  const userProgress: UserProgress = {
    level: 1,
    currentExp: 0,
    nextLevelExp: 100,
  };

  const ui = useMemo<TasksUI>(() => {
    return {
      colors,
      isDark,

      screenBg: colors.bg,
      cardBg: colors.card,
      text: colors.text,
      textMuted: colors.textMuted,
      border: colors.border,
      accent: colors.accent,

      // czytelne statusy na każdym motywie
      overdue: isDark ? "#ff5c7a" : "#b00020",
      dueSoon: isDark ? "#ffcc66" : "#8a5a00",
      ok: colors.accent,
    };
  }, [colors, isDark]);

  const getChoreState = useCallback((chore: Chore) => {
    const due = parseIso(chore.dueDate);
    if (!due) return "ok";

    const now = Date.now();
    if (due < now) return "overdue";

    const in24h = now + 24 * 60 * 60 * 1000;
    if (due <= in24h) return "dueSoon";

    return "ok";
  }, []);

  const value = useMemo(
    () => ({
      chores,
      addChore,
      removeChore,
      userProgress,
      ui,
      getChoreState,
    }),
    [chores, addChore, removeChore, userProgress, ui, getChoreState]
  );

  return (
    <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error("useTasks must be used within TasksProvider");
  return ctx;
}
// src/context/TasksContext.tsx
