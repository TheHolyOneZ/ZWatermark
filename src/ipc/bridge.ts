

import { invoke } from "@tauri-apps/api/core";

export interface IdentitySummary {
  id: string;
  displayName: string;
  email: string | null;
  verifyingKeyHex: string;
  createdEpochS: number;
  defaultDeviceId?: string | null;
}

export type DeviceKind =
  | "workstation"
  | "laptop"
  | "camera"
  | "phone"
  | "server"
  | "custom";

export interface DeviceSummary {
  id: string;
  name: string;
  kind: DeviceKind;
  kindLabel?: string | null;
  metadata: Record<string, string>;
  createdEpochS: number;
}

export interface DeviceRef {
  name: string;
  id?: string | null;
  kind?: DeviceKind | null;
  kindLabel?: string | null;
  metadata: Record<string, string>;
  knownLocally: boolean;
}

export interface MarkResult {
  outputPath: string;
  bytes: number;
  durationMs: number;
  strength: string;
  payloadBits: number;
  sidecarPath?: string | null;
  timestampsObtained?: number;
  timestampErrors?: TimestampErrorInfo[];
}

export interface TimestampErrorInfo {
  tsaUrl: string;
  message: string;
}

export interface OriginatorInfo {
  id: string;
  displayName: string;
  email?: string | null;
  verifyingKeyHex: string;
}

export interface RobustPayloadInfo {
  version: number;
  userIdHex: string;
  deviceIdHex: string;
  epochMin: number;
  epochIso?: string | null;
  counter: number;
}

export interface FragileRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FragilePayloadInfo {
  pubkeyHex: string;
  timestampNs: string;
  screenSerial?: string | null;
  region?: FragileRegion | null;
  deviceName?: string | null;
  signatureHex: string;
}

export interface SelfContainedVerificationInfo {
  pubkeyHex: string;
  signatureOk: boolean;
  knownIdentity?: OriginatorInfo | null;
}

export interface Rfc3161TimestampInfo {
  tsaUrl: string;
  verified: boolean;
  genTimeIso?: string | null;
  genTimeEpochS?: number | null;
  error?: string | null;
}

export interface SidecarVerificationInfo {
  sidecarPath: string;
  digestMatches: boolean;
  rfc3161: Rfc3161TimestampInfo[];
  opentimestamps: OpenTimestampsInfo[];
}

export interface OpenTimestampsInfo {
  calendarUrl: string;
  verified: boolean;
  pendingUpgrade: boolean;
  attestations: OtsAttestationInfo[];
  pendingCalendars: string[];
  error?: string | null;
}

export interface OtsAttestationInfo {
  chain: string;
  height: number;
  verified: boolean;
  blockTimeEpochS?: number | null;
  blockTimeIso?: string | null;
  error?: string | null;
}

export interface VerifyResult {
  found: boolean;
  signatureOk: boolean;


  identityVerified: boolean;
  confidence: number;
  robustFound: boolean;
  fragileFound: boolean;
  originator: OriginatorInfo | null;
  device: DeviceRef | null;
  timestampIso: string | null;
  payloadHex: string | null;
  robustPayload?: RobustPayloadInfo | null;
  fragilePayload?: FragilePayloadInfo | null;
  selfContained?: SelfContainedVerificationInfo | null;
  sidecar?: SidecarVerificationInfo | null;
}

export interface CaptureLogEntry {
  id: string;
  path: string;
  thumbnailDataUrl: string | null;
  epochMs: number;
  strength: string;
  payloadBits: number;
  verified: boolean;
}

export interface RuleSet {
  folderAllow: string[];
  folderDeny: string[];
  workHoursOnly: boolean;
  workHoursStart: string | null;
  workHoursEnd: string | null;
  folderStrength: Record<string, "robust" | "fragile" | "both" | "max">;
}

export type OverlayMode = "text" | "image";
export type OverlayCorner =
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right"
  | "center";

export interface VisibleOverlay {
  enabled: boolean;
  mode: OverlayMode;
  text: string | null;
  imageBytes?: number[] | null;
  position: OverlayCorner;
  opacity: number;
  sizePct: number;
  zwBadge: boolean;
}

export const defaultOverlay = (): VisibleOverlay => ({
  enabled: false,
  mode: "image",
  text: null,
  imageBytes: null,
  position: "bottom_right",
  opacity: 0.75,
  sizePct: 0.12,
  zwBadge: false,
});

export interface Settings {
  captureWatchedFolders: string[];
  defaultStrength: "robust" | "fragile" | "both" | "max";
  defaultOverlay: VisibleOverlay;
  timestamps: TimestampSettings;
}

export interface TimestampSettings {
  defaultRequest: boolean;
  tsaUrls: string[];
  otsCalendarUrls: string[];
  askedFirstTimeConsent: boolean;
}

export const identityList = () => invoke<IdentitySummary[]>("identity_list");
export const identityGenerate = (
  displayName: string,
  email: string | null,
) => invoke<IdentitySummary>("identity_generate", { displayName, email });
export const identityDelete = (id: string) => invoke<void>("identity_delete", { id });
export const identityExport = (id: string) => invoke<string>("identity_export", { id });
export const identityImport = (json: string) =>
  invoke<IdentitySummary>("identity_import", { json });
export const identityUpdate = (
  id: string,
  displayName: string,
  email: string | null,
  defaultDeviceId: string | null,
) =>
  invoke<IdentitySummary>("identity_update", {
    id,
    displayName,
    email,
    defaultDeviceId,
  });

export const deviceList = () => invoke<DeviceSummary[]>("device_list");
export const deviceCreate = (
  name: string,
  kind: DeviceKind,
  metadata: Record<string, string>,
  kindLabel: string | null,
) => invoke<DeviceSummary>("device_create", { name, kind, kindLabel, metadata });
export const deviceUpdate = (
  id: string,
  name: string,
  kind: DeviceKind,
  metadata: Record<string, string>,
  kindLabel: string | null,
) => invoke<DeviceSummary>("device_update", { id, name, kind, kindLabel, metadata });
export const deviceDelete = (id: string) =>
  invoke<void>("device_delete", { id });

export const migrationTakeLegacyFlag = () => invoke<boolean>("migration_take_legacy_flag");

export interface VaultStatus {
  enabled: boolean;
  unlocked: boolean;
}

export const vaultStatus = () => invoke<VaultStatus>("vault_status");
export const vaultEnable = (password: string) =>
  invoke<void>("vault_enable", { password });
export const vaultDisable = (password: string) =>
  invoke<void>("vault_disable", { password });
export const vaultUnlock = (password: string) =>
  invoke<void>("vault_unlock", { password });
export const vaultChangePassword = (oldPassword: string, newPassword: string) =>
  invoke<void>("vault_change_password", { oldPassword, newPassword });

export const markImage = (
  path: string,
  identityId: string,
  deviceId: string | null,
  strength: string,
  overlay: VisibleOverlay | null,
  requestTimestamps?: boolean | null,
) =>
  invoke<MarkResult>("mark_image", {
    path,
    identityId,
    deviceId,
    strength,
    overlay,
    requestTimestamps: requestTimestamps ?? null,
  });

export const verifyImage = (path: string) => invoke<VerifyResult>("verify_image", { path });

export const capturesRecent = (limit: number) =>
  invoke<CaptureLogEntry[]>("captures_recent", { limit });

export type ActivityLevel = "info" | "success" | "warning" | "error";
export type ActivitySource =
  | "capture"
  | "mark"
  | "verify"
  | "batch"
  | "identity"
  | "device"
  | "rules"
  | "vault"
  | "system";

export interface ActivityEvent {
  id: string;
  epochMs: number;
  level: ActivityLevel;
  source: ActivitySource;
  message: string;
  details?: string | null;
}

export const activityRecent = (limit: number) =>
  invoke<ActivityEvent[]>("activity_recent", { limit });

export const rulesGet = () => invoke<RuleSet>("rules_get");
export const rulesSet = (rules: RuleSet) => invoke<void>("rules_set", { rules });

export const settingsGet = () => invoke<Settings>("settings_get");
export const settingsSet = (next: Settings) => invoke<void>("settings_set", { next });

export interface BatchVerifyRow {
  path: string;
  found: boolean;
  signatureOk: boolean;

  identityVerified?: boolean;
  confidence: number;
  originator: string | null;
  device: string | null;
  timestampIso: string | null;
  blake3: string;
  error: string | null;
  hasSidecar?: boolean;
  sidecarDigestMatches?: boolean;
  timestampsVerified?: number;
  timestampsTotal?: number;
}

export interface BatchVerifyReport {
  folder: string;
  rows: BatchVerifyRow[];
  durationMs: number;
}

export interface BatchMarkResult {
  processed: number;
  failed: number;
  durationMs: number;
  sidecarsWritten?: number;
  timestampsObtained?: number;
}

export interface BatchStartResult {
  jobId: string;
}


export const batchVerifyStart = (folder: string) =>
  invoke<BatchStartResult>("batch_verify", { folder });
export const batchExportCsv = (report: BatchVerifyReport, destination: string) =>
  invoke<string>("batch_export_csv", { report, destination });
export const batchMarkStart = (
  folder: string,
  identityId: string,
  deviceId: string | null,
  strength: string,
  overlay: VisibleOverlay | null,
  requestTimestamps?: boolean | null,
) =>
  invoke<BatchStartResult>("batch_mark", {
    folder,
    identityId,
    deviceId,
    strength,
    overlay,
    requestTimestamps: requestTimestamps ?? null,
  });
export const batchCancel = (jobId: string) =>
  invoke<void>("batch_cancel", { jobId });

export interface BatchProgressEvent {
  jobId: string;
  phase: "verify" | "mark";
  processed: number;
  total: number;
  currentPath: string | null;
  failed: number;
}

export interface BatchDoneVerifyEvent {
  jobId: string;
  phase: "verify";
  report: BatchVerifyReport;
}

export interface BatchDoneMarkEvent {
  jobId: string;
  phase: "mark";
  result: BatchMarkResult;
}

export type BatchDoneEvent = BatchDoneVerifyEvent | BatchDoneMarkEvent;

export interface BatchErrorEvent {
  jobId: string;
  phase: "verify" | "mark";
  error: string;
}

export interface RegistryPublicIdentity {
  id: string;
  displayName: string;
  email: string | null;
  verifyingKey: number[];
}

export type Attack =
  | { kind: "jpeg_recompress"; quality: number }
  | { kind: "resize"; scale: number }
  | { kind: "crop"; keep_pct: number }
  | { kind: "gaussian_noise"; sigma: number }
  | { kind: "gaussian_blur"; sigma: number }
  | { kind: "brightness"; delta: number }
  | { kind: "contrast"; factor: number }
  | { kind: "grayscale" }
  | { kind: "horizontal_flip" }
  | { kind: "rotate"; degrees: number };

export interface StressRow {
  path: string;
  attackLabel: string;
  baselineSignatureOk: boolean;
  baselineConfidence: number;
  attackedRobustFound: boolean;
  attackedFragileFound: boolean;
  attackedSignatureOk: boolean;


  attackedIdentityKnown: boolean;


  attackedIdentityVerified: boolean;
  attackedConfidence: number;
  error: string | null;
}

export interface StressReport {
  rows: StressRow[];
  durationMs: number;
}

export interface StressProgressEvent {
  jobId: string;
  processed: number;
  total: number;
  current: string | null;
  failed: number;
  latest: StressRow | null;
}

export interface StressDoneEvent {
  jobId: string;
  report: StressReport;
}

export interface StressErrorEvent {
  jobId: string;
  error: string;
}

export const stressStart = (paths: string[], attacks: Attack[], chain: boolean) =>
  invoke<{ jobId: string }>("stress_start", { paths, attacks, chain });

export const registryPublish = (identityId: string, endpoint?: string) =>
  invoke<string>("registry_publish", { identityId, endpoint: endpoint ?? null });
export const registryImport = (userIdHex: string, endpoint?: string) =>
  invoke<RegistryPublicIdentity>("registry_import", { userIdHex, endpoint: endpoint ?? null });
