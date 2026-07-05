import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { activityRecent, type ActivityEvent } from "../ipc/bridge";


const CLIENT_CAP = 500;

interface ActivityState {
  entries: ActivityEvent[];

  refresh: () => Promise<void>;


  subscribe: () => Promise<UnlistenFn>;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  entries: [],

  refresh: async () => {
    try {
      const entries = await activityRecent(CLIENT_CAP);
      set({ entries });
    } catch {

    }
  },

  subscribe: () =>
    listen<ActivityEvent>("activity:event", (e) => {
      const next = [e.payload, ...get().entries];
      if (next.length > CLIENT_CAP) next.length = CLIENT_CAP;
      set({ entries: next });
    }),
}));
