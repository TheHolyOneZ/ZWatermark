import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  batchCancel,
  batchMarkStart,
  batchVerifyStart,
  type BatchDoneEvent,
  type BatchErrorEvent,
  type BatchMarkResult,
  type BatchProgressEvent,
  type BatchVerifyReport,
  type VisibleOverlay,
} from "../ipc/bridge";

export type BatchPhase = "verify" | "mark";
export type BatchStatus =
  | "idle"
  | "running"
  | "done"
  | "error"
  | "cancelled";

interface BatchState {
  jobId: string | null;
  phase: BatchPhase | null;
  processed: number;
  total: number;
  currentPath: string | null;
  failed: number;
  status: BatchStatus;
  report: BatchVerifyReport | null;
  markResult: BatchMarkResult | null;
  error: string | null;
  startedAtMs: number | null;

  startVerify: (folder: string) => Promise<void>;
  startMark: (
    folder: string,
    identityId: string,
    deviceId: string | null,
    strength: string,
    overlay: VisibleOverlay | null,
    requestTimestamps?: boolean | null,
  ) => Promise<void>;
  cancel: () => Promise<void>;
  clear: () => void;
}

const INITIAL = {
  jobId: null,
  phase: null,
  processed: 0,
  total: 0,
  currentPath: null,
  failed: 0,
  status: "idle" as BatchStatus,
  report: null,
  markResult: null,
  error: null,
  startedAtMs: null,
};

export const useBatchStore = create<BatchState>((set, get) => ({
  ...INITIAL,

  startVerify: async (folder) => {


    set({
      ...INITIAL,
      status: "running",
      phase: "verify",
      startedAtMs: Date.now(),
    });
    try {
      const { jobId } = await batchVerifyStart(folder);
      set({ jobId });
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  startMark: async (folder, identityId, deviceId, strength, overlay, requestTimestamps) => {
    set({
      ...INITIAL,
      status: "running",
      phase: "mark",
      startedAtMs: Date.now(),
    });
    try {
      const { jobId } = await batchMarkStart(
        folder,
        identityId,
        deviceId,
        strength,
        overlay,
        requestTimestamps ?? null,
      );
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
export function initBatchEventBridge() {
  if (wired) return;
  wired = true;


  const claimIfOurs = (eventJobId: string): boolean => {
    const s = useBatchStore.getState();
    if (s.jobId === eventJobId) return true;
    if (s.jobId === null && s.status === "running") {
      useBatchStore.setState({ jobId: eventJobId });
      return true;
    }
    return false;
  };

  void listen<BatchProgressEvent>("batch:progress", (e) => {
    const p = e.payload;
    if (!claimIfOurs(p.jobId)) return;
    const state = useBatchStore.getState();
    if (state.status !== "running") return;
    useBatchStore.setState({
      processed: p.processed,
      total: p.total,


      currentPath: p.currentPath ?? state.currentPath,
      failed: p.failed,
    });
  });

  void listen<BatchDoneEvent>("batch:done", (e) => {
    const p = e.payload;
    if (!claimIfOurs(p.jobId)) return;
    const state = useBatchStore.getState();


    const nextStatus: BatchStatus = state.status === "cancelled" ? "cancelled" : "done";
    if (p.phase === "verify") {
      useBatchStore.setState({
        status: nextStatus,
        report: p.report,
        currentPath: null,
      });
    } else {
      useBatchStore.setState({
        status: nextStatus,
        markResult: p.result,
        currentPath: null,
      });
    }
  });

  void listen<BatchErrorEvent>("batch:error", (e) => {
    const p = e.payload;
    if (!claimIfOurs(p.jobId)) return;
    useBatchStore.setState({ status: "error", error: p.error });
  });
}


initBatchEventBridge();
