import { listen } from "@tauri-apps/api/event";
import type { CaptureLogEntry } from "./bridge";


export const onCapture = (fn: (entry: CaptureLogEntry) => void) =>
  listen<CaptureLogEntry>("capture:detected", (e) => fn(e.payload));
