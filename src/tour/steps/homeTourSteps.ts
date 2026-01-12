// src/tour/steps/homeTourSteps.ts

import type { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

/** kompatybilny typ z GuidedTourOverlay */
export type AnchorRect = { x: number; y: number; width: number; height: number };

/**
 * ✅ Home ma kroki 1–4, ale licznik ma pokazywać globalnie (np. 1/15).
 * (U Ciebie licznik i tak jest liczony przez GuidedTourOverlay przez totalSteps + stepIndexOffset,
 * ale te pola możesz zostawić, jeśli gdzieś jeszcze ich używasz.)
 *
 * ✅ KROK 15: "finish" ma być modalem z confetti i BEZ highlightu.
 * Dlatego dodajemy pole `isFinal?: boolean`, które GuidedTourOverlay rozumie.
 */
export type TourStepId = "hud" | "week" | "add" | "checkbox" | "finish";

export type TourStep = {
  key: TourStepId; // ✅ WAŻNE: GuidedTourOverlay używa `key`, nie `id`
  title: string;
  body: string;

  /** (opcjonalnie) jeśli chcesz przechowywać globalny licznik w danych kroku */
  globalStep?: number;
  globalTotal?: number;

  /** ✅ GuidedTourOverlay: krok końcowy (modal + confetti, bez highlightu) */
  isFinal?: boolean;

  /** (opcjonalnie) własna etykieta przycisku "Dalej" – jeśli obsłużysz ją po swojej stronie */
  nextLabel?: string;

  actionLabel?: string;
  actionIcon?: ComponentProps<typeof Ionicons>["name"];
  virtualAnchor?: AnchorRect | ((dims: { W: number; H: number }) => AnchorRect);
};

/**
 * Kroki toura dla Home (GuidedTourOverlay) — to są KROKI 1–4.
 */
export const HOME_TOUR_STEPS: TourStep[] = [
  {
    key: "hud",
    title: "PANEL GŁÓWNY",
    body: "Tutaj sprawdzisz swój aktualny postęp: poziom, EXP i streak. Możesz też zmieniać widok dat (dzień/tydzień/miesiąc).",
    globalStep: 1,
    globalTotal: 15,
  },
  {
    key: "week",
    title: "WYBÓR DNIA",
    body: "Kliknij dzień tygodnia, żeby przełączyć listę zadań. Zielona kropka oznacza, że wykonałeś przynajmniej jedno zadanie.",
    globalStep: 2,
    globalTotal: 15,
  },
  {
    key: "add",
    title: "DODAJ ZADANIE",
    body: "Dodaj nowe zadanie na wybraną datę. Możesz też ustawić cykliczność (codziennie/tygodniowo/miesięcznie). Korzystając z Premium, możesz dodawać zadania członkom rodziny.",
    globalStep: 3,
    globalTotal: 15,
  },
  {
    key: "checkbox",
    title: "REALIZOWANIE ZADAŃ",
    body: "Kliknij kółko przy zadaniu, żeby oznaczyć je jako wykonane i zgarnąć EXP (z fajerwerkami 💥).",
    globalStep: 4,
    globalTotal: 15,
  },
];

/**
 * ✅ KROK 15 (FINISH) — NIE DODAJEMY GO do HOME_TOUR_STEPS,
 * bo ma się pokazać dopiero po krokach 5–14 (CustomHeader).
 *
 * ✅ Najważniejsze: `isFinal: true` -> GuidedTourOverlay pokaże modal z confetti
 * i pominie mierzenie targetu/highlight.
 */
export const TOUR_FINISH_STEP: TourStep = {
  key: "finish",
  isFinal: true,
  title: "Teraz znasz już lepiej MissionHome! 🎉",
  body:
    "Masz ogarnięte podstawy: poziom i EXP, streak, zadania i odhaczanie.\n\n" +
    "Teraz dodaj pierwszą misję i zacznij wbijać poziom w codzienności ✨",
  globalStep: 15,
  globalTotal: 15,
  nextLabel: "Zaczynamy!",
};

/* ------------------------------------------------------------------ */
/* ---------------------- GLOBAL TOUR STEP BUS ------------------------ */
/* ------------------------------------------------------------------ */

type Listener = (open: boolean) => void;

const _openByStep: Record<string, boolean> = Object.create(null);
let _listenersByStep: Record<string, Listener[]> = Object.create(null);

function key(step: number) {
  return String(step);
}

export function isHomeTourStepOpen(step: number) {
  return !!_openByStep[key(step)];
}

export function subscribeHomeTourStep(step: number, cb: Listener) {
  const k = key(step);
  const arr = (_listenersByStep[k] ??= []);

  if (!arr.includes(cb)) arr.push(cb);

  // push aktualnego stanu
  try {
    cb(!!_openByStep[k]);
  } catch {}

  return () => {
    const cur = _listenersByStep[k] ?? [];
    _listenersByStep[k] = cur.filter((l) => l !== cb);
  };
}

export function setHomeTourStepOpen(step: number, open: boolean) {
  const k = key(step);
  _openByStep[k] = open;

  const arr = _listenersByStep[k] ?? [];
  arr.forEach((l) => {
    try {
      l(open);
    } catch {}
  });
}

export function resetHomeTourStepsOpen() {
  for (const k of Object.keys(_openByStep)) delete _openByStep[k];
  _listenersByStep = Object.create(null);
}

/* ------------------------------------------------------------------ */
/* --------- COMPAT: eksporty nazwane jak stare pliki 5–14 ----------- */
/* ------------------------------------------------------------------ */

export const subscribeTourStep5 = (cb: Listener) => subscribeHomeTourStep(5, cb);
export const setTourStep5Open = (open: boolean) => setHomeTourStepOpen(5, open);

export const subscribeTourStep6 = (cb: Listener) => subscribeHomeTourStep(6, cb);
export const setTourStep6Open = (open: boolean) => setHomeTourStepOpen(6, open);

export const subscribeTourStep7 = (cb: Listener) => subscribeHomeTourStep(7, cb);
export const setTourStep7Open = (open: boolean) => setHomeTourStepOpen(7, open);

export const subscribeTourStep8 = (cb: Listener) => subscribeHomeTourStep(8, cb);
export const setTourStep8Open = (open: boolean) => setHomeTourStepOpen(8, open);

// ✅ bonus: brakowało 9 (bezpieczne do dodania)
export const subscribeTourStep9 = (cb: Listener) => subscribeHomeTourStep(9, cb);
export const setTourStep9Open = (open: boolean) => setHomeTourStepOpen(9, open);

export const subscribeTourStep10 = (cb: Listener) => subscribeHomeTourStep(10, cb);
export const setTourStep10Open = (open: boolean) => setHomeTourStepOpen(10, open);

export const subscribeTourStep11 = (cb: Listener) => subscribeHomeTourStep(11, cb);
export const setTourStep11Open = (open: boolean) => setHomeTourStepOpen(11, open);

export const subscribeTourStep12 = (cb: Listener) => subscribeHomeTourStep(12, cb);
export const setTourStep12Open = (open: boolean) => setHomeTourStepOpen(12, open);

export const subscribeTourStep13 = (cb: Listener) => subscribeHomeTourStep(13, cb);
export const setTourStep13Open = (open: boolean) => setHomeTourStepOpen(13, open);

export const subscribeTourStep14 = (cb: Listener) => subscribeHomeTourStep(14, cb);
export const setTourStep14Open = (open: boolean) => setHomeTourStepOpen(14, open);

// ✅ opcjonalnie: bus dla 15 (jeśli odpalasz finish eventowo po 14)
export const subscribeTourStep15 = (cb: Listener) => subscribeHomeTourStep(15, cb);
export const setTourStep15Open = (open: boolean) => setHomeTourStepOpen(15, open);
