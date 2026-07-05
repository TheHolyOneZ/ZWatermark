import { create } from "zustand";
import { rulesGet, rulesSet, type RuleSet } from "../ipc/bridge";

interface RulesState {
  rules: RuleSet;
  load: () => Promise<void>;
  update: (next: RuleSet) => Promise<void>;
}

const empty: RuleSet = {
  folderAllow: [],
  folderDeny: [],
  workHoursOnly: false,
  workHoursStart: null,
  workHoursEnd: null,
  folderStrength: {},
};

export const useRulesStore = create<RulesState>((set) => ({
  rules: empty,
  load: async () => {
    try {
      set({ rules: await rulesGet() });
    } catch {}
  },
  update: async (next) => {
    await rulesSet(next);
    set({ rules: next });
  },
}));
