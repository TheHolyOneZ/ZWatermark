import { create } from "zustand";
import {
  defaultOverlay,
  settingsGet,
  settingsSet,
  type Settings,
} from "../ipc/bridge";

interface SettingsState {
  settings: Settings;
  load: () => Promise<void>;
  update: (next: Settings) => Promise<void>;
}

const defaults: Settings = {
  captureWatchedFolders: [],
  defaultStrength: "both",
  defaultOverlay: defaultOverlay(),
  timestamps: {
    defaultRequest: true,
    tsaUrls: [
      "https://freetsa.org/tsr",
      "http://timestamp.digicert.com",
    ],
    otsCalendarUrls: [
      "https://alice.btc.calendar.opentimestamps.org",
      "https://bob.btc.calendar.opentimestamps.org",
      "https://finney.calendar.eternitywall.com",
    ],
    askedFirstTimeConsent: false,
  },
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaults,
  load: async () => {
    try {
      set({ settings: await settingsGet() });
    } catch {}
  },
  update: async (next) => {
    await settingsSet(next);
    set({ settings: next });
  },
}));
