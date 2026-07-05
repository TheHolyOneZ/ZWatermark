import { create } from "zustand";
import {
  vaultChangePassword,
  vaultDisable,
  vaultEnable,
  vaultStatus,
  vaultUnlock,
  type VaultStatus,
} from "../ipc/bridge";

interface VaultState {
  status: VaultStatus;
  ready: boolean;
  refresh: () => Promise<void>;
  unlock: (password: string) => Promise<void>;
  enable: (password: string) => Promise<void>;
  disable: (password: string) => Promise<void>;
  change: (oldPassword: string, newPassword: string) => Promise<void>;
}

const INITIAL: VaultStatus = { enabled: false, unlocked: true };

export const useVaultStore = create<VaultState>((set, get) => ({
  status: INITIAL,
  ready: false,
  refresh: async () => {
    try {
      const status = await vaultStatus();
      set({ status, ready: true });
    } catch {
      set({ status: INITIAL, ready: true });
    }
  },
  unlock: async (password) => {
    await vaultUnlock(password);
    await get().refresh();
  },
  enable: async (password) => {
    await vaultEnable(password);
    await get().refresh();
  },
  disable: async (password) => {
    await vaultDisable(password);
    await get().refresh();
  },
  change: async (oldPassword, newPassword) => {
    await vaultChangePassword(oldPassword, newPassword);
    await get().refresh();
  },
}));
