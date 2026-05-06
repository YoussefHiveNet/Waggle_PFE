import * as React from "react";
import type { ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 4000;

type ToastState = ToastProps & {
  id: string;
  title?: string;
  description?: string;
  open: boolean;
};

type Action =
  | { type: "ADD"; toast: ToastState }
  | { type: "DISMISS"; id: string }
  | { type: "REMOVE"; id: string };

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return String(count);
}

const listeners: Array<(state: ToastState[]) => void> = [];
let memoryState: ToastState[] = [];

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((l) => l(memoryState));
}

function reducer(state: ToastState[], action: Action): ToastState[] {
  switch (action.type) {
    case "ADD":
      return [action.toast, ...state].slice(0, TOAST_LIMIT);
    case "DISMISS":
      return state.map((t) => (t.id === action.id ? { ...t, open: false } : t));
    case "REMOVE":
      return state.filter((t) => t.id !== action.id);
  }
}

export function toast({
  title,
  description,
  variant,
}: {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}) {
  const id = genId();
  dispatch({ type: "ADD", toast: { id, title, description, variant: variant ?? "default", open: true } });
  setTimeout(() => dispatch({ type: "DISMISS", id }), TOAST_REMOVE_DELAY);
  setTimeout(() => dispatch({ type: "REMOVE", id }), TOAST_REMOVE_DELAY + 300);
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastState[]>(memoryState);
  React.useEffect(() => {
    listeners.push(setToasts);
    return () => {
      const idx = listeners.indexOf(setToasts);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);
  return { toasts };
}
