import { create } from "zustand";
import {
  identityExport,
  identityImport,
  identityList,
  type IdentitySummary,
} from "../ipc/bridge";

interface IdentityState {
  identities: IdentitySummary[];
  active: IdentitySummary | null;
  needsSetup: boolean;
  load: () => Promise<void>;
  setActive: (id: string) => void;
  export: (id: string) => Promise<string>;
  import: (json: string) => Promise<IdentitySummary>;
}

export const useIdentityStore = create<IdentityState>((set, get) => ({
  identities: [],
  active: null,
  needsSetup: false,
  load: async () => {
    try {
      const ids = await identityList();
      set({
        identities: ids,
        active: ids[0] ?? null,
        needsSetup: ids.length === 0,
      });
    } catch {
      set({ identities: [], active: null, needsSetup: true });
    }
  },
  setActive: (id) =>
    set((s) => ({ active: s.identities.find((i) => i.id === id) ?? s.active })),
  export: async (id) => {
    return await identityExport(id);
  },
  import: async (json) => {
    const summary = await identityImport(json);
    await get().load();
    return summary;
  },
}));
