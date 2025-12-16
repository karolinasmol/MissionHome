// src/utils/tourStep5Bus.ts
type Listener = (open: boolean) => void;

let _open = false;
let listeners: Listener[] = [];

export function subscribeTourStep5(cb: Listener) {
  listeners.push(cb);
  // od razu push aktualnego stanu
  cb(_open);

  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

export function setTourStep5Open(open: boolean) {
  _open = open;
  listeners.forEach((l) => l(_open));
}
