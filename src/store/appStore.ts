import { create } from "zustand";

export type Route =
  | "dashboard"
  | "mark"
  | "verify"
  | "batch"
  | "stress"
  | "identity"
  | "devices"
  | "rules"
  | "guide"
  | "log"
  | "settings";

interface AppState {
  route: Route;
  setRoute: (r: Route) => void;
}

export const useAppStore = create<AppState>((set) => ({
  route: "dashboard",
  setRoute: (route) => set({ route }),
}));
