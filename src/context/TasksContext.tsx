import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
} from "react";

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

type TasksContextValue = {
  chores: Chore[];
  addChore: (input: Omit<Chore, "id">) => void;
  removeChore: (id: string) => void;
  userProgress: UserProgress; // ⭐ DODANE
};

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [chores, setChores] = useState<Chore[]>(INITIAL_CHORES);

  const addChore = (input: Omit<Chore, "id">) => {
    setChores((prev) => [
      {
        ...input,
        id: String(Date.now()) + Math.random().toString(16).slice(2),
      },
      ...prev,
    ]);
  };

  const removeChore = (id: string) => {
    setChores((prev) => prev.filter((c) => c.id !== id));
  };

  // ⭐ tymczasowy mock exp/level — aż podłączymy Firestore
  const userProgress: UserProgress = {
    level: 1,
    currentExp: 0,
    nextLevelExp: 100,
  };

  const value = useMemo(
    () => ({
      chores,
      addChore,
      removeChore,
      userProgress,
    }),
    [chores]
  );

  return (
    <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) {
    throw new Error("useTasks must be used within TasksProvider");
  }
  return ctx;
}
