import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  Boxes,
  FolderOpen,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  FileText,
  Play,
  Wand2,
  AlertCircle,
  X,
  Trash2,
  User,
  Cpu,
  Anchor,
} from "lucide-react";
import { Panel } from "../lib/Panel";
import { Section } from "../lib/Section";
import { Card } from "../lib/Card";
import { Button } from "../lib/Button";
import { Badge } from "../lib/Badge";
import { EmptyState } from "../lib/EmptyState";
import { Segmented } from "../lib/Segmented";
import { Select } from "../lib/Select";
import { Modal } from "../lib/Modal";
import { Toggle } from "../lib/Toggle";
import { NetworkDisclosureModal } from "../lib/NetworkDisclosureModal";
import { ConfidenceBar } from "../lib/ConfidenceBar";
import { HelpTip } from "../lib/HelpTip";
import { useToast } from "../lib/Toast";
import { useCommands } from "../lib/CommandPalette";
import { useIdentityStore } from "../../store/identityStore";
import { useDevicesStore } from "../../store/devicesStore";
import { useBatchStore } from "../../store/batchStore";
import {
  batchExportCsv,
  verifyImage,
  type BatchVerifyReport,
  type VerifyResult,
  type VisibleOverlay,
} from "../../ipc/bridge";
import { useSettingsStore } from "../../store/settingsStore";
import { OverlayEditor } from "../lib/OverlayEditor";

type Mode = "verify" | "mark";
type Strength = "robust" | "fragile" | "both" | "max";

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i === -1 ? p : p.slice(i + 1);
}

function statusFor(row: BatchVerifyReport["rows"][number]) {
  if (row.error) {
    return { icon: <ShieldOff size={14} />, tone: "error" as const, label: "Error" };
  }
  if (row.signatureOk) {
    return { icon: <ShieldCheck size={14} />, tone: "success" as const, label: "Verified" };
  }
  if (row.found) {
    return { icon: <ShieldAlert size={14} />, tone: "warning" as const, label: "Unsigned" };
  }
  return { icon: <ShieldOff size={14} />, tone: "neutral" as const, label: "None" };
}

export function Batch() {
  const toast = useToast();
  const { register } = useCommands();
  const { active, identities } = useIdentityStore();
  const { devices, ready: devicesReady, load: loadDevices } = useDevicesStore();
  const { settings, update: updateSettings } = useSettingsStore();

  const job = useBatchStore();

  const [mode, setMode] = useState<Mode>("verify");
  const [folder, setFolder] = useState<string | null>(null);
  const [strength, setStrength] = useState<Strength>("both");
  const [inspectPath, setInspectPath] = useState<string | null>(null);


  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<VisibleOverlay>(settings.defaultOverlay);
  const [requestTimestamps, setRequestTimestamps] = useState<boolean>(
    settings.timestamps.defaultRequest,
  );
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  useEffect(() => {
    setOverlay(settings.defaultOverlay);
  }, [settings.defaultOverlay]);

  useEffect(() => {
    setRequestTimestamps(settings.timestamps.defaultRequest);
  }, [settings.timestamps.defaultRequest]);


  useEffect(() => {
    if (!devicesReady) void loadDevices();
  }, [devicesReady, loadDevices]);

  const effectiveIdentity = useMemo(() => {
    if (selectedIdentityId) {
      return identities.find((i) => i.id === selectedIdentityId) ?? active;
    }
    return active;
  }, [selectedIdentityId, identities, active]);

  const effectiveDeviceId = useMemo(() => {
    if (selectedIdentityId && selectedIdentityId !== active?.id) {


      return selectedDeviceId;
    }
    if (selectedDeviceId !== null) return selectedDeviceId;
    return effectiveIdentity?.defaultDeviceId ?? null;
  }, [selectedIdentityId, selectedDeviceId, effectiveIdentity, active]);


  const lastStatus = useRef(job.status);
  useEffect(() => {
    if (lastStatus.current === job.status) return;
    lastStatus.current = job.status;
    if (job.status === "done") {
      if (job.phase === "verify" && job.report) {
        toast.success(
          "Batch verify complete",
          `${job.report.rows.length} file${job.report.rows.length === 1 ? "" : "s"} in ${(job.report.durationMs / 1000).toFixed(1)}s`,
        );
      } else if (job.phase === "mark" && job.markResult) {
        const sc = job.markResult.sidecarsWritten ?? 0;
        const suffix = sc > 0 ? ` · ${sc} sidecar${sc === 1 ? "" : "s"}` : "";
        toast.success(
          "Batch mark complete",
          `${job.markResult.processed} marked · ${job.markResult.failed} failed · ${(job.markResult.durationMs / 1000).toFixed(1)}s${suffix}`,
        );
      }
    } else if (job.status === "error" && job.error) {
      toast.error("Batch failed", job.error);
    } else if (job.status === "cancelled") {
      toast.info("Batch cancelled", "Partial results retained.");
    }
  }, [job.status, job.phase, job.report, job.markResult, job.error, toast]);

  const pickFolder = useCallback(async () => {
    const p = await openDialog({ directory: true, multiple: false });
    if (typeof p === "string") {
      setFolder(p);
    }
  }, []);

  const runVerify = useCallback(async () => {
    if (!folder) return;
    await job.startVerify(folder);
  }, [folder, job]);

  const doMark = useCallback(async () => {
    if (!folder || !effectiveIdentity) return;
    await job.startMark(
      folder,
      effectiveIdentity.id,
      effectiveDeviceId,
      strength,
      overlay.enabled ? overlay : null,
      requestTimestamps,
    );
  }, [folder, effectiveIdentity, effectiveDeviceId, strength, overlay, requestTimestamps, job]);

  const runMark = useCallback(async () => {
    if (!folder || !effectiveIdentity) return;
    if (requestTimestamps && !settings.timestamps.askedFirstTimeConsent) {
      setDisclosureOpen(true);
      return;
    }
    void doMark();
  }, [folder, effectiveIdentity, requestTimestamps, settings.timestamps.askedFirstTimeConsent, doMark]);

  const proceedAfterDisclosure = useCallback(async () => {
    setDisclosureOpen(false);
    try {
      await updateSettings({
        ...settings,
        timestamps: { ...settings.timestamps, askedFirstTimeConsent: true },
      });
    } catch {}
    void doMark();
  }, [settings, updateSettings, doMark]);

  const exportCsv = useCallback(async () => {
    if (!job.report) return;
    const path = await saveDialog({
      defaultPath: "zwatermark-report.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    try {
      await batchExportCsv(job.report, path);
      toast.success("CSV saved", path);
    } catch (e) {
      toast.error("Export failed", String(e));
    }
  }, [job.report, toast]);

  useEffect(
    () =>
      register([
        {
          id: "batch.pick-folder",
          section: "Batch",
          label: "Batch: choose folder…",
          icon: <FolderOpen size={14} />,
          perform: pickFolder,
        },
        {
          id: "batch.run-verify",
          section: "Batch",
          label: "Batch: verify folder",
          icon: <Play size={14} />,
          perform: () => {
            setMode("verify");
            void runVerify();
          },
        },
      ]),
    [register, pickFolder, runVerify],
  );

  const summary = useMemo(() => {
    if (!job.report) return null;
    const s = { signed: 0, unsigned: 0, none: 0, errors: 0 };
    for (const r of job.report.rows) {
      if (r.error) s.errors++;
      else if (r.signatureOk) s.signed++;
      else if (r.found) s.unsigned++;
      else s.none++;
    }
    return s;
  }, [job.report]);

  const busy = job.status === "running";
  const percent = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;

  const identityOptions = useMemo(
    () =>
      identities.map((i) => ({
        value: i.id,
        label: i.displayName,
        hint: i.email ?? undefined,
      })),
    [identities],
  );

  const deviceOptions = useMemo(
    () =>
      devices.map((d) => ({
        value: d.id,
        label: d.name,
        hint: d.kindLabel ?? d.kind,
      })),
    [devices],
  );

  const currentIdentityValue = effectiveIdentity?.id ?? "";
  const currentDeviceValue = effectiveDeviceId ?? "";

  return (
    <Panel
      title="Batch"
      subtitle="Verify or re-mark whole folders. Runs in the background — the tab reflects live progress even if you navigate away."
    >
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Segmented<Mode>
              ariaLabel="Batch mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "verify", label: "Verify", icon: <ShieldCheck size={14} /> },
                { value: "mark", label: "Mark", icon: <Wand2 size={14} /> },
              ]}
            />
            <HelpTip
              ariaLabel="What do verify and mark do here?"
              content={
                <div>
                  <strong>Verify</strong> reads every image in the folder and reports which ones already carry a valid watermark. <strong>Mark</strong> does the opposite — it signs every image it finds, writing a new <code>name.zw.png</code> next to each original.
                </div>
              }
            />
            <div className="flex-1" />
            {mode === "mark" && (
              <span className="inline-flex items-center">
                <Segmented<Strength>
                  ariaLabel="Strength"
                  value={strength}
                  onChange={setStrength}
                  options={[
                    { value: "robust", label: "Robust" },
                    { value: "fragile", label: "Fragile" },
                    { value: "both", label: "Both" },
                    { value: "max", label: "Max" },
                  ]}
                />
                <HelpTip
                  ariaLabel="What does strength mean?"
                  content={
                    <div className="flex flex-col gap-1.5">
                      <div><strong>Robust</strong> — hidden in the frequency signal; survives compression and re-encoding.</div>
                      <div><strong>Fragile</strong> — a cryptographic signature in the pixel bits; breaks on any edit, proves tamper-free.</div>
                      <div><strong>Both</strong> — applies both layers. Recommended.</div>
                      <div><strong>Max</strong> — Both, embedded harder. Best for adversarial distribution; tiny visual cost.</div>
                    </div>
                  }
                />
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="secondary"
              icon={<FolderOpen size={14} />}
              onClick={pickFolder}
              disabled={busy}
            >
              {folder ? "Change folder" : "Choose folder"}
            </Button>
            <div
              className={folder ? "zw-path-well flex-1 min-w-[200px]" : "zw-small flex-1 min-w-[200px]"}
              style={folder ? { wordBreak: "normal", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : undefined}
              title={folder ?? undefined}
            >
              {folder ?? "No folder selected"}
            </div>
            {mode === "verify" ? (
              <Button
                variant="primary"
                icon={<Play size={14} />}
                loading={busy}
                disabled={!folder || busy}
                onClick={runVerify}
              >
                Run verify
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={<Wand2 size={14} />}
                loading={busy}
                disabled={!folder || busy || !effectiveIdentity}
                onClick={runMark}
              >
                {effectiveIdentity ? "Run mark" : "Create an identity first"}
              </Button>
            )}
          </div>

          {mode === "mark" && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-[220px]">
                <User size={14} className="text-[color:var(--zw-text-3)]" aria-hidden />
                <HelpTip
                  ariaLabel="What is the signing identity?"
                  content={
                    <div>
                      The private key used to sign every image in the batch. Verifiers see this name as the <strong>originator</strong>. Defaults to your active identity — override here to batch-sign under a different persona without switching the app-wide active key.
                    </div>
                  }
                />
                <Select<string>
                  ariaLabel="Signing identity"
                  value={currentIdentityValue}
                  onChange={(v) => {
                    setSelectedIdentityId(v);


                    setSelectedDeviceId(null);
                  }}
                  options={identityOptions}
                  placeholder="Select identity…"
                  emptyLabel="No identities"
                  disabled={busy || identityOptions.length === 0}
                  wrapperClassName="min-w-[200px]"
                />
              </div>
              <div className="flex items-center gap-2 min-w-[220px]">
                <Cpu size={14} className="text-[color:var(--zw-text-3)]" aria-hidden />
                <HelpTip
                  ariaLabel="What is the signing device?"
                  content={
                    <div>
                      The device profile stamped into every mark in this batch — telling verifiers which machine, camera, or pipeline produced these files. Falls back to the identity's default when left blank.
                    </div>
                  }
                />
                <Select<string>
                  ariaLabel="Signing device"
                  value={currentDeviceValue}
                  onChange={(v) => setSelectedDeviceId(v || null)}
                  options={deviceOptions}
                  placeholder="Default device"
                  emptyLabel="No devices"
                  disabled={busy || deviceOptions.length === 0}
                  allowClear
                  clearLabel="No device"
                  wrapperClassName="min-w-[200px]"
                />
              </div>
            </div>
          )}

          {mode === "mark" && (
            <div className="pt-3 border-t border-[color:var(--zw-border-hair)]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="zw-h2 inline-flex items-center gap-2">
                  <Anchor size={16} /> Provenance evidence
                  <HelpTip
                    ariaLabel="Why external timestamps?"
                    content={
                      <div className="flex flex-col gap-1.5">
                        <div>
                          A signature alone doesn't prove <em>when</em> — a thief could strip your mark, re-sign with their own key, and claim priority.
                        </div>
                        <div>
                          <strong>External timestamps</strong> anchor each file's hash to a real-world moment that no one can rewrite. The proofs are archived in a <code>.zwm</code> sidecar next to every marked image.
                        </div>
                      </div>
                    }
                  />
                </div>
                <Toggle
                  checked={requestTimestamps}
                  onChange={setRequestTimestamps}
                  label={<span className="text-xs">Request timestamps</span>}
                />
              </div>
              <div className="zw-small">
                {requestTimestamps ? (
                  <>
                    For every image in the batch, the app will POST the marked file's SHA-256 hash to{" "}
                    <strong>{settings.timestamps.tsaUrls.length}</strong> Time Stamp Authorit
                    {settings.timestamps.tsaUrls.length === 1 ? "y" : "ies"}
                    {settings.timestamps.otsCalendarUrls.length > 0 && (
                      <>
                        {" "}and <strong>{settings.timestamps.otsCalendarUrls.length}</strong>{" "}
                        OpenTimestamps calendar
                        {settings.timestamps.otsCalendarUrls.length === 1 ? "" : "s"}
                      </>
                    )}
                    . Network endpoints are configurable in Settings → Timestamps.
                  </>
                ) : (
                  <>Timestamps disabled — sidecar files won't be written. Signatures still verify from the embedded public key.</>
                )}
              </div>
            </div>
          )}

          {mode === "mark" && (
            <div className="pt-3 border-t border-[color:var(--zw-border-hair)]">
              <div className="zw-h2 mb-2">Visible watermark</div>
              <OverlayEditor value={overlay} onChange={setOverlay} compact />
            </div>
          )}

          {mode === "mark" && effectiveIdentity && (
            <div className="zw-small pt-3 border-t border-[color:var(--zw-border-hair)]">
              Marking with{" "}
              <strong className="text-[color:var(--zw-text-1)]">{effectiveIdentity.displayName}</strong>. Output
              files are written next to each source as{" "}
              <code className="font-mono text-[11px]">name.zw.png</code>.
            </div>
          )}
          {mode === "mark" && !effectiveIdentity && identities.length === 0 && (
            <div className="zw-alert zw-alert--warning">
              <ShieldAlert size={14} aria-hidden />
              <div>No identity yet. Create one from the Identity panel to sign captures.</div>
            </div>
          )}
        </div>
      </Card>

      {(job.status === "running" || job.status === "cancelled") && (
        <Section
          title={job.status === "running" ? "In progress" : "Cancelled"}
          description={
            job.phase === "verify"
              ? "Verifying folder — job continues even if you switch tabs."
              : "Marking folder — job continues even if you switch tabs."
          }
          actions={
            job.status === "running" ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<X size={14} />}
                onClick={() => void job.cancel()}
              >
                Cancel
              </Button>
            ) : null
          }
        >
          <Card>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant={job.status === "cancelled" ? "warning" : "neutral"}>
                  {job.processed} / {job.total || "?"}
                </Badge>
                <div className="zw-small tabular-nums">{percent}%</div>
                {job.failed > 0 && (
                  <Badge variant="error">
                    <AlertCircle size={12} />
                    <span>{job.failed} failed</span>
                  </Badge>
                )}
                <div className="flex-1" />
              </div>
              <div
                className="w-full h-2 rounded-full overflow-hidden bg-[color:var(--zw-bg-2)]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div
                  className="h-full bg-[color:var(--zw-accent)] transition-[width] duration-150"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {job.currentPath && (
                <div
                  className="font-mono text-[11px] truncate text-[color:var(--zw-text-3)]"
                  title={job.currentPath}
                >
                  {basename(job.currentPath)}
                </div>
              )}
            </div>
          </Card>
        </Section>
      )}

      {job.status === "error" && job.error && (
        <div className="zw-alert zw-alert--error">
          <AlertCircle size={14} aria-hidden />
          <div className="flex-1">
            <div className="font-semibold">Batch failed</div>
            <div className="zw-small">{job.error}</div>
          </div>
          <Button variant="secondary" size="sm" icon={<Trash2 size={14} />} onClick={job.clear}>
            Clear
          </Button>
        </div>
      )}

      {job.phase === "verify" && job.report && summary && (
        <Section
          title="Report"
          description={`${job.report.rows.length} file${job.report.rows.length === 1 ? "" : "s"} scanned in ${(job.report.durationMs / 1000).toFixed(1)}s${job.status === "cancelled" ? " (cancelled)" : ""}`}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={exportCsv}>
                Export CSV
              </Button>
              <Button variant="secondary" size="sm" icon={<Trash2 size={14} />} onClick={job.clear}>
                Clear
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryStat icon={<ShieldCheck size={16} />} label="Verified" value={summary.signed} tone="success" />
            <SummaryStat icon={<ShieldAlert size={16} />} label="Unsigned" value={summary.unsigned} tone="warning" />
            <SummaryStat icon={<ShieldOff size={16} />} label="No mark" value={summary.none} tone="neutral" />
            <SummaryStat icon={<AlertCircle size={16} />} label="Errors" value={summary.errors} tone={summary.errors > 0 ? "error" : "neutral"} />
          </div>

          {job.report.rows.length === 0 ? (
            <EmptyState
              icon={<Boxes size={32} />}
              title="No images in this folder"
              description="Supported formats: PNG, JPG, WebP, BMP."
            />
          ) : (
            <Card>
              <table className="zw-table">
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>
                      <span className="inline-flex items-center">
                        Status
                        <HelpTip
                          ariaLabel="What do the status labels mean?"
                          placement="right"
                          content={
                            <div className="flex flex-col gap-1.5">
                              <div><strong>Verified</strong> — a watermark was found and its cryptographic signature checked out.</div>
                              <div><strong>Unsigned</strong> — a watermark was found but no known key matches its signature.</div>
                              <div><strong>None</strong> — no recoverable watermark in this file.</div>
                              <div><strong>Error</strong> — the file could not be read or decoded at all.</div>
                            </div>
                          }
                        />
                      </span>
                    </th>
                    <th>File</th>
                    <th>Originator</th>
                    <th style={{ width: 100 }} className="text-right">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {job.report.rows.map((r) => {
                    const s = statusFor(r);
                    return (
                      <tr
                        key={r.path}
                        onClick={() => setInspectPath(r.path)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setInspectPath(r.path);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        title="Click for full verification details"
                        className="cursor-pointer hover:bg-[color:var(--zw-glass-2)] focus:outline-none focus:bg-[color:var(--zw-glass-2)] transition-colors"
                      >
                        <td>
                          <Badge variant={s.tone === "neutral" ? "neutral" : s.tone}>
                            {s.icon}
                            <span>{s.label}</span>
                          </Badge>
                        </td>
                        <td>
                          <div className="font-mono text-xs truncate max-w-[420px]" title={r.path}>
                            {basename(r.path)}
                          </div>
                          {r.error && (
                            <div
                              className="text-[10px] text-[color:var(--zw-error)] truncate max-w-[420px]"
                              title={r.error}
                            >
                              {r.error}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="text-xs truncate max-w-[240px]">
                            {r.originator ?? (
                              <span className="text-[color:var(--zw-text-3)]">—</span>
                            )}
                            {r.device && (
                              <span className="text-[color:var(--zw-text-3)]"> · {r.device}</span>
                            )}
                          </div>
                        </td>
                        <td className="text-right tabular-nums text-xs">
                          {r.found ? `${(r.confidence * 100).toFixed(0)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </Section>
      )}

      {job.phase === "mark" && job.markResult && (
        <Section
          title="Result"
          actions={
            <Button variant="secondary" size="sm" icon={<Trash2 size={14} />} onClick={job.clear}>
              Clear
            </Button>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            <SummaryStat icon={<Wand2 size={16} />} label="Processed" value={job.markResult.processed} tone="success" />
            <SummaryStat icon={<AlertCircle size={16} />} label="Failed" value={job.markResult.failed} tone={job.markResult.failed > 0 ? "error" : "neutral"} />
            <SummaryStat icon={<Play size={16} />} label="Duration" value={`${(job.markResult.durationMs / 1000).toFixed(1)}s`} tone="neutral" />
          </div>
        </Section>
      )}

      {!folder && job.status === "idle" && (
        <EmptyState
          icon={<Boxes size={40} />}
          title="Point at a folder to begin"
          description="Batch operations walk one directory (non-recursive) and touch only image files. Use the CLI for scripted or nested runs."
          action={
            <Button variant="primary" icon={<FolderOpen size={14} />} onClick={pickFolder}>
              Choose folder
            </Button>
          }
        />
      )}

      <RowDetailModal
        path={inspectPath}
        onClose={() => setInspectPath(null)}
      />

      <NetworkDisclosureModal
        open={disclosureOpen}
        urls={[
          ...settings.timestamps.tsaUrls,
          ...settings.timestamps.otsCalendarUrls,
        ]}
        purpose="Batch marking with timestamps will POST each marked file's SHA-256 hash to these RFC 3161 Time Stamp Authorities and OpenTimestamps calendars — once per image in the batch. Verifying OpenTimestamps proofs later will additionally query blockstream.info for Bitcoin block headers."
        onCancel={() => setDisclosureOpen(false)}
        onProceed={() => void proceedAfterDisclosure()}
      />
    </Panel>
  );
}

function RowDetailModal({
  path,
  onClose,
}: {
  path: string | null;
  onClose: () => void;
}) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setResult(null);
      setError(null);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    setResult(null);
    verifyImage(path)
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [path]);

  const title = path ? basename(path) : "";
  const s = statusFor(
    result
      ? {
          path: path ?? "",
          found: result.found,
          signatureOk: result.signatureOk,
          confidence: result.confidence,
          originator: null,
          device: null,
          timestampIso: null,
          blake3: "",
          error: null,
        }
      : { path: "", found: false, signatureOk: false, confidence: 0, originator: null, device: null, timestampIso: null, blake3: "", error: null },
  );

  return (
    <Modal
      open={path !== null}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm truncate" title={path ?? ""}>{title}</span>
          {result && (
            <Badge variant={s.tone === "neutral" ? "neutral" : s.tone}>
              {s.icon}
              <span>{s.label}</span>
            </Badge>
          )}
        </div>
      }
      description={path ? <span className="font-mono text-[11px] break-all">{path}</span> : undefined}
    >
      {busy && (
        <div className="flex items-center gap-3 py-4">
          <div className="zw-spinner" aria-hidden />
          <span className="text-sm">Re-verifying…</span>
        </div>
      )}

      {error && (
        <div className="zw-alert zw-alert--error">
          <AlertCircle size={14} aria-hidden />
          <div className="zw-small">{error}</div>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <dl className="zw-facts">
            <dt>Originator</dt>
            <dd>
              {result.originator ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{result.originator.displayName}</span>
                    {result.originator.email && (
                      <span className="zw-small">&lt;{result.originator.email}&gt;</span>
                    )}
                  </div>
                  <div className="zw-small font-mono">
                    key {shortKey(result.originator.verifyingKeyHex)}
                  </div>
                </div>
              ) : (
                <em className="text-[color:var(--zw-text-3)]">unknown</em>
              )}
            </dd>

            <dt>Layers</dt>
            <dd>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant={result.robustFound ? "success" : "neutral"}>
                  Robust {result.robustFound ? "decoded" : "absent"}
                </Badge>
                <Badge variant={result.fragileFound ? "success" : "neutral"}>
                  Fragile {result.fragileFound ? "decoded" : "absent"}
                </Badge>
                <Badge variant={result.signatureOk ? "success" : "warning"}>
                  Signature {result.signatureOk ? "valid Ed25519" : "unverified"}
                </Badge>
              </div>
            </dd>

            <dt>Decode margin</dt>
            <dd><ConfidenceBar value={result.confidence} /></dd>
          </dl>

          {result.device && (
            <Card
              title="Capture device"
              actions={
                <Badge variant={result.device.knownLocally ? "success" : "warning"}>
                  {result.device.knownLocally ? "Known locally" : "Unknown"}
                </Badge>
              }
            >
              <dl className="zw-facts">
                <dt>Name</dt>
                <dd>{result.device.name}</dd>
                {(result.device.kindLabel || result.device.kind) && (
                  <>
                    <dt>Kind</dt>
                    <dd>
                      <Badge variant="neutral">
                        {result.device.kindLabel ?? result.device.kind}
                      </Badge>
                    </dd>
                  </>
                )}
                {Object.keys(result.device.metadata).length > 0 && (
                  <>
                    <dt data-top="true">Metadata</dt>
                    <dd>
                      <table className="zw-kv-table w-full text-xs">
                        <tbody>
                          {Object.entries(result.device.metadata).map(([k, v]) => (
                            <tr key={k}>
                              <th className="text-left font-medium pr-3 py-0.5 align-top text-[color:var(--zw-text-2)] whitespace-nowrap">{k}</th>
                              <td className="py-0.5 font-mono break-all">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </dd>
                  </>
                )}
              </dl>
            </Card>
          )}

          {result.robustPayload && (
            <Card title="Robust payload">
              <dl className="zw-facts">
                <dt>Version</dt>
                <dd>v{result.robustPayload.version}</dd>
                <dt>User ID</dt>
                <dd className="font-mono text-xs break-all">{result.robustPayload.userIdHex}</dd>
                <dt>Device ID</dt>
                <dd className="font-mono text-xs break-all">{result.robustPayload.deviceIdHex}</dd>
                <dt>Epoch</dt>
                <dd className="tabular-nums">
                  {result.robustPayload.epochMin.toLocaleString()} min
                  {result.robustPayload.epochIso && (
                    <div className="zw-small font-mono">{result.robustPayload.epochIso}</div>
                  )}
                </dd>
                <dt>Counter</dt>
                <dd className="tabular-nums">{result.robustPayload.counter}</dd>
              </dl>
            </Card>
          )}

          {result.fragilePayload && (
            <Card title="Fragile payload">
              <dl className="zw-facts">
                <dt>Public key</dt>
                <dd className="font-mono text-xs break-all">{result.fragilePayload.pubkeyHex}</dd>
                <dt>Timestamp (ns)</dt>
                <dd className="font-mono text-xs tabular-nums break-all">{result.fragilePayload.timestampNs}</dd>
                {result.fragilePayload.screenSerial && (
                  <>
                    <dt>Screen serial</dt>
                    <dd className="font-mono text-xs">{result.fragilePayload.screenSerial}</dd>
                  </>
                )}
                {result.fragilePayload.region && (
                  <>
                    <dt>Region</dt>
                    <dd className="tabular-nums font-mono text-xs">
                      {result.fragilePayload.region.x},{result.fragilePayload.region.y} ·{" "}
                      {result.fragilePayload.region.w}×{result.fragilePayload.region.h}
                    </dd>
                  </>
                )}
                {result.fragilePayload.deviceName && (
                  <>
                    <dt>Device name hint</dt>
                    <dd>{result.fragilePayload.deviceName}</dd>
                  </>
                )}
                <dt>Signature</dt>
                <dd className="font-mono text-[10px] break-all">{result.fragilePayload.signatureHex}</dd>
              </dl>
            </Card>
          )}
        </div>
      )}
    </Modal>
  );
}

function shortKey(hex: string): string {
  if (hex.length <= 20) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

function SummaryStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "success" | "warning" | "error" | "neutral";
}) {
  return (
    <div className="zw-stat" data-tone={tone}>
      <div className="zw-stat-icon" aria-hidden>{icon}</div>
      <div className="min-w-0">
        <div className="zw-stat-label">{label}</div>
        <div className="zw-stat-value">{value}</div>
      </div>
    </div>
  );
}
