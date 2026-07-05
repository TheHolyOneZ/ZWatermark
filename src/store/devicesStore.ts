import { create } from "zustand";
import {
  deviceCreate,
  deviceDelete,
  deviceList,
  deviceUpdate,
  type DeviceKind,
  type DeviceSummary,
} from "../ipc/bridge";

interface DevicesState {
  devices: DeviceSummary[];
  ready: boolean;
  load: () => Promise<void>;
  create: (
    name: string,
    kind: DeviceKind,
    metadata: Record<string, string>,
    kindLabel: string | null,
  ) => Promise<DeviceSummary>;
  update: (
    id: string,
    name: string,
    kind: DeviceKind,
    metadata: Record<string, string>,
    kindLabel: string | null,
  ) => Promise<DeviceSummary>;
  remove: (id: string) => Promise<void>;
  find: (id: string | null | undefined) => DeviceSummary | null;
}

export const useDevicesStore = create<DevicesState>((set, get) => ({
  devices: [],
  ready: false,
  load: async () => {
    try {
      const devices = await deviceList();
      set({ devices, ready: true });
    } catch {
      set({ devices: [], ready: true });
    }
  },
  create: async (name, kind, metadata, kindLabel) => {
    const d = await deviceCreate(name, kind, metadata, kindLabel);
    set((s) => ({ devices: [...s.devices, d] }));
    return d;
  },
  update: async (id, name, kind, metadata, kindLabel) => {
    const d = await deviceUpdate(id, name, kind, metadata, kindLabel);
    set((s) => ({
      devices: s.devices.map((x) => (x.id === id ? d : x)),
    }));
    return d;
  },
  remove: async (id) => {
    await deviceDelete(id);
    set((s) => ({ devices: s.devices.filter((d) => d.id !== id) }));
  },
  find: (id) => {
    if (!id) return null;
    return get().devices.find((d) => d.id === id) ?? null;
  },
}));
