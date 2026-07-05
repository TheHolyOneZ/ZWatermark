import { create } from "zustand";
import { capturesRecent, type CaptureLogEntry } from "../ipc/bridge";

interface CapturesState {
  entries: CaptureLogEntry[];
  markedToday: number;
  refresh: () => Promise<void>;
}

export const useCapturesStore = create<CapturesState>((set) => ({
  entries: [],
  markedToday: 0,
  refresh: async () => {
    try {
      const entries = await capturesRecent(100);
      const now = new Date();
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).getTime();
      const markedToday = entries.filter(
        (e) => e.epochMs >= startOfDay && e.verified,
      ).length;
      set({ entries, markedToday });
    } catch {
      set({ entries: [], markedToday: 0 });
    }
  },
}));
