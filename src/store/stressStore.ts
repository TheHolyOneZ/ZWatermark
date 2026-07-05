import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  batchCancel,
  stressStart,
  type Attack,
  type StressDoneEvent,
  type StressErrorEvent,
  type StressProgressEvent,
  type StressReport,
  type StressRow,
} from "../ipc/bridge";

type Status = "idle" | "running" | "done" | "error" | "cancelled";

interface StressState {
  jobId: string | null;
  status: Status;
  processed: number;
  total: number;
  failed: number;
  current: string | null;
  rows: StressRow[];
  report: StressReport | null;
  error: string | null;
  startedAtMs: number | null;

  start: (paths: string[], attacks: Attack[], chain: boolean) => Promise<void>;
  cancel: () => Promise<void>;
  clear: () => void;
}

const INITIAL = {
  jobId: null,
  status: "idle" as Status,
  processed: 0,
  total: 0,
  failed: 0,
  current: null,
  rows: [] as StressRow[],
  report: null,
  error: null,
  startedAtMs: null,
};

export const useStressStore = create<StressState>((set, get) => ({
  ...INITIAL,

  start: async (paths, attacks, chain) => {
    set({ ...INITIAL, status: "running", startedAtMs: Date.now() });
    try {
      const { jobId } = await stressStart(paths, attacks, chain);
      set({ jobId });
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  cancel: async () => {
    const { jobId, status } = get();
    if (!jobId || status !== "running") return;
    try {
      await batchCancel(jobId);
      set({ status: "cancelled" });
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  clear: () => set({ ...INITIAL }),
}));

let wired = false;
export function initStressEventBridge() {
  if (wired) return;
  wired = true;

  const claim = (id: string): boolean => {
    const s = useStressStore.getState();
    if (s.jobId === id) return true;
    if (s.jobId === null && s.status === "running") {
      useStressStore.setState({ jobId: id });
      return true;
    }
    return false;
  };

  void listen<StressProgressEvent>("stress:progress", (e) => {
    const p = e.payload;
    if (!claim(p.jobId)) return;
    const state = useStressStore.getState();
    if (state.status !== "running") return;
    useStressStore.setState({
      processed: p.processed,
      total: p.total,
      failed: p.failed,
      current: p.current ?? state.current,
      rows: p.latest ? [...state.rows, p.latest] : state.rows,
    });
  });

  void listen<StressDoneEvent>("stress:done", (e) => {
    const p = e.payload;
    if (!claim(p.jobId)) return;
    const state = useStressStore.getState();
    const nextStatus: Status = state.status === "cancelled" ? "cancelled" : "done";
    useStressStore.setState({
      status: nextStatus,
      report: p.report,
      rows: p.report.rows,
      current: null,
    });
  });

  void listen<StressErrorEvent>("stress:error", (e) => {
    const p = e.payload;
    if (!claim(p.jobId)) return;
    useStressStore.setState({ status: "error", error: p.error });
  });
}

initStressEventBridge();
