import { create } from "zustand";
import { verifyImage, type VerifyResult } from "../ipc/bridge";

interface VerifyState {
  busy: boolean;
  lastResult: VerifyResult | null;
  lastPath: string | null;
  verify: (path: string) => Promise<void>;
  clear: () => void;
}

export const useVerifyStore = create<VerifyState>((set) => ({
  busy: false,
  lastResult: null,
  lastPath: null,
  verify: async (path) => {
    set({ busy: true, lastPath: path });
    try {
      const r = await verifyImage(path);
      set({ lastResult: r });
    } finally {
      set({ busy: false });
    }
  },
  clear: () => set({ lastResult: null, lastPath: null }),
}));
