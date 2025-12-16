type Listener = (open: boolean) => void;

let _open = false;
let listeners: Listener[] = [];

export function subscribeTourStep14(cb: Listener) {
  listeners.push(cb);
  cb(_open);

  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

export function setTourStep14Open(open: boolean) {
  _open = open;
  listeners.forEach((l) => l(_open));
}
// src/utils/tourStep14Bus.ts
