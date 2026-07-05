import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wand2,
  FolderOpen,
  Copy,
  Check,
  ShieldOff,
  ShieldCheck,
  Layers,
  Clock,
  KeyRound,
  HardDrive,
  Cpu,
  Scan,
  Monitor,
  Laptop,
  Camera as CameraIcon,
  Smartphone,
  Server,
  Cog,
  Star,
  Anchor,
} from "lucide-react";
import { Panel } from "../lib/Panel";
import { Section } from "../lib/Section";
import { Card } from "../lib/Card";
import { Button } from "../lib/Button";
import { DropZone } from "../lib/DropZone";
import { Segmented } from "../lib/Segmented";
import { Select } from "../lib/Select";
import { Badge } from "../lib/Badge";
import { EmptyState } from "../lib/EmptyState";
import { HelpTip } from "../lib/HelpTip";
import { OverlayEditor } from "../lib/OverlayEditor";
import { Toggle } from "../lib/Toggle";
import { NetworkDisclosureModal } from "../lib/NetworkDisclosureModal";
import { useToast } from "../lib/Toast";
import { useCommands } from "../lib/CommandPalette";
import { useIdentityStore } from "../../store/identityStore";
import { useDevicesStore } from "../../store/devicesStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useAppStore } from "../../store/appStore";
import {
  markImage,
  type MarkResult,
  type DeviceKind,
  type VisibleOverlay,
} from "../../ipc/bridge";
import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

type Strength = "robust" | "fragile" | "both" | "max";

const ACCEPT = ["png", "jpg", "jpeg", "webp", "bmp"];

const STRENGTH_COPY: Record<Strength, { headline: string; body: string }> = {
  robust: {
    headline: "DWT-domain carrier only.",
    body: "Payload rides the frequency-domain (Discrete Wavelet Transform) coefficients. Survives screenshotting, JPEG re-encoding and light color/scale edits. Use when you only need proof of origin and expect the file to be re-encoded or re-captured before it reaches the verifier.",
  },
  fragile: {
    headline: "Signed LSB layer only.",
    body: "Payload rides the least-significant bits, sealed with an Ed25519 signature. Any pixel change (even a 1-bit edit) invalidates the signature. Use when you need to prove the file bytes are byte-identical to what you signed — but expect it to break on any re-encoding.",
  },
  both: {
    headline: "Robust + fragile in one pass. Recommended.",
    body: "Robust DWT carrier proves origin; fragile signed LSB layer proves the file wasn't touched since you signed it. Verify sees both layers and reports what survived. Slightly larger perceptual cost; still visually lossless for photographic content.",
  },
  max: {
    headline: "Both layers, boosted amplitude. Paranoid mode.",
    body: "Same two layers as Both, but the robust carrier is embedded at ~1.75× amplitude — it survives aggressive re-encoding, 2× rescale, and phone-photo-of-screen. Cost: slightly more visible noise on large flat regions (skies, solid backgrounds). Verify auto-probes both amplitudes; verifiers don't need to know which mode was used.",
  },
};

const DEVICE_ICON: Record<DeviceKind, React.ReactNode> = {
  workstation: <Monitor size={14} />,
  laptop: <Laptop size={14} />,
  camera: <CameraIcon size={14} />,
  phone: <Smartphone size={14} />,
  server: <Server size={14} />,
  custom: <Cog size={14} />,
};

export function Mark() {
  const toast = useToast();
  const { register } = useCommands();
  const { active } = useIdentityStore();
  const { devices, load: loadDevices, ready: devicesReady } = useDevicesStore();
  const { settings, update: updateSettings } = useSettingsStore();
  const { setRoute } = useAppStore();

  const [path, setPath] = useState<string | null>(null);
  const [strength, setStrength] = useState<Strength>(settings.defaultStrength);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MarkResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [savingDefault, setSavingDefault] = useState(false);
  const [overlay, setOverlay] = useState<VisibleOverlay>(settings.defaultOverlay);
  const [savingOverlayDefault, setSavingOverlayDefault] = useState(false);
  const [requestTimestamps, setRequestTimestamps] = useState<boolean>(
    settings.timestamps.defaultRequest,
  );
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  useEffect(() => {
    if (!devicesReady) loadDevices();
  }, [devicesReady, loadDevices]);

  useEffect(() => {

    setStrength(settings.defaultStrength);
  }, [settings.defaultStrength]);

  useEffect(() => {
    setOverlay(settings.defaultOverlay);
  }, [settings.defaultOverlay]);

  useEffect(() => {

    setDeviceId(active?.defaultDeviceId ?? "");
  }, [active?.id, active?.defaultDeviceId]);

  const saveStrengthAsDefault = useCallback(async () => {
    if (strength === settings.defaultStrength) return;
    setSavingDefault(true);
    try {
      await updateSettings({ ...settings, defaultStrength: strength });
      toast.success("Saved as default", `New captures will use "${strength}".`);
    } catch (e) {
      toast.error("Couldn't save default", String(e));
    } finally {
      setSavingDefault(false);
    }
  }, [strength, settings, updateSettings, toast]);

  const onPaths = useCallback((paths: string[]) => {
    const p = paths[0];
    if (!p) return;
    setPath(p);
    setResult(null);
  }, []);

  const doMark = useCallback(async () => {
    if (!path || !active) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await markImage(
        path,
        active.id,
        deviceId || null,
        strength,
        overlay.enabled ? overlay : null,
        requestTimestamps,
      );
      setResult(r);
      const tsHint = r.sidecarPath
        ? ` · ${r.timestampsObtained ?? 0} timestamp(s)`
        : "";
      toast.success(
        "Marked",
        `${basename(r.outputPath)} · ${(r.durationMs).toFixed(0)} ms · ${formatBytes(r.bytes)}${tsHint}`,
      );
      if (r.timestampErrors && r.timestampErrors.length > 0) {
        toast.error(
          "Timestamp partial failure",
          `${r.timestampErrors.length} TSA(s) did not respond — the mark itself is fine.`,
        );
      }
    } catch (e) {
      toast.error("Mark failed", String(e));
    } finally {
      setBusy(false);
    }
  }, [path, active, strength, deviceId, overlay, requestTimestamps, toast]);

  const run = useCallback(async () => {
    if (!path || !active) return;

    if (requestTimestamps && !settings.timestamps.askedFirstTimeConsent) {
      setDisclosureOpen(true);
      return;
    }
    void doMark();
  }, [path, active, requestTimestamps, settings.timestamps.askedFirstTimeConsent, doMark]);

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

  const saveOverlayAsDefault = useCallback(async () => {
    setSavingOverlayDefault(true);
    try {
      await updateSettings({ ...settings, defaultOverlay: overlay });
      toast.success("Overlay saved as default");
    } catch (e) {
      toast.error("Couldn't save overlay default", String(e));
    } finally {
      setSavingOverlayDefault(false);
    }
  }, [overlay, settings, updateSettings, toast]);

  const copyPath = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.outputPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }, [result]);

  useEffect(
    () =>
      register([
        {
          id: "mark.pick",
          section: "Mark",
          label: "Mark: choose image…",
          icon: <FolderOpen size={14} />,
          perform: () => setPath(null),
        },
        {
          id: "mark.run",
          section: "Mark",
          label: "Mark: apply watermark",
          icon: <Wand2 size={14} />,
          perform: () => void run(),
        },
      ]),
    [register, run],
  );

  const previewSrc = useMemo(() => (path ? convertFileSrc(path) : null), [path]);
  const canRun = Boolean(path && active && !busy);

  return (
    <Panel
      title="Mark"
      subtitle="Drop an image to embed an invisible signed watermark. A new file is written next to it — the original stays untouched."
    >
      {!active ? (
        <EmptyState
          icon={<ShieldOff size={40} />}
          title="No active identity"
          description="Marking requires a signing identity. Create one to continue."
          action={
            <Button variant="primary" onClick={() => setRoute("identity")} icon={<KeyRound size={14} />}>
              Open Identity
            </Button>
          }
        />
      ) : (
        <>

          <Card>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="zw-avatar" aria-hidden>
                <ShieldCheck size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-sm">
                  <strong className="text-[color:var(--zw-text-1)]">{active.displayName}</strong>
                </div>
                <div className="text-xs text-[color:var(--zw-text-3)] mt-0.5 inline-flex items-center">
                  Signing identity
                  <HelpTip
                    ariaLabel="What does the signing identity do?"
                    content={
                      <div>
                        The private key that will sign this image. Whoever verifies your screenshot later sees this name and can check that the signature really came from your key — not someone impersonating you.
                      </div>
                    }
                  />
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <span className="text-xs text-[color:var(--zw-text-2)] inline-flex items-center">
                  Strength
                  <HelpTip
                    ariaLabel="What do the strength options mean?"
                    content={
                      <div className="flex flex-col gap-1.5">
                        <div><strong>Robust</strong> — hides the mark in the image's underlying frequency signal. Survives screenshots, JPEG re-saving and light editing, so it's what proves origin after the file travels the internet.</div>
                        <div><strong>Fragile</strong> — writes a cryptographic signature into the least-significant pixel bits. Any edit — even one pixel — breaks it. Use it to prove a file has not been touched since you signed it.</div>
                        <div><strong>Both</strong> — applies both layers. Recommended for almost everyone.</div>
                        <div><strong>Max</strong> — Both, pushed harder into the frequency signal. Best when the image will face adversarial re-encoding or aggressive editing; costs a hair of visible impact at high zoom.</div>
                      </div>
                    }
                  />
                </span>
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
                {strength !== settings.defaultStrength ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Star size={12} />}
                    onClick={saveStrengthAsDefault}
                    loading={savingDefault}
                    title="Save this strength as the app-wide default"
                  >
                    Save as default
                  </Button>
                ) : (
                  <span title="This is your saved default in Settings">
                    <Badge variant="neutral">Default</Badge>
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[color:var(--zw-border-hair)]">
              <div className="text-xs text-[color:var(--zw-text-1)]">
                <strong>{STRENGTH_COPY[strength].headline}</strong>
              </div>
              <div className="zw-small mt-1">{STRENGTH_COPY[strength].body}</div>
            </div>
            <div className="mt-3 pt-3 border-t border-[color:var(--zw-border-hair)] flex items-center gap-3 flex-wrap">
              <span className="text-xs text-[color:var(--zw-text-2)] shrink-0 inline-flex items-center">
                Device
                <HelpTip
                  ariaLabel="What does the device do?"
                  content={
                    <div>
                      The machine, camera, or software pipeline that produced this screenshot. The device name is embedded in the mark so verifiers can see where a capture came from — useful when you sign from multiple rigs.
                    </div>
                  }
                />
              </span>
              <Select
                value={deviceId}
                onChange={(v) => setDeviceId(v)}
                ariaLabel="Signing device"
                allowClear
                clearLabel="No device"
                placeholder="Pick a device…"
                emptyLabel="No devices yet"
                wrapperClassName="flex-1"
                minWidth={280}
                options={devices.map((d) => ({
                  value: d.id,
                  label: d.name,
                  hint: active?.defaultDeviceId === d.id ? "default" : (d.kindLabel ?? d.kind),
                  icon: DEVICE_ICON[d.kind],
                }))}
              />
              {devices.length === 0 && (
                <Button variant="ghost" size="sm" onClick={() => setRoute("devices")}>
                  Create a device
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="zw-h2 inline-flex items-center gap-2">
                <Anchor size={16} /> Provenance evidence
                <Badge variant="warning">Beta</Badge>
                <HelpTip
                  ariaLabel="Why external timestamps?"
                  content={
                    <div className="flex flex-col gap-1.5">
                      <div>
                        <strong>Beta:</strong> the timestamping pipeline (RFC 3161 + OpenTimestamps) works end-to-end and the sidecar is written and verified — but network reliability, TSA quirks, and OpenTimestamps upgrade timing haven't been battle-tested across the wild. Treat verified timestamps as strong evidence, not court-grade proof yet.
                      </div>
                      <div>
                        Your public key is already embedded in the mark, so anyone can verify the signature. But a signature alone doesn't prove <em>when</em> — a thief could strip your mark, re-sign with their own key, and claim priority.
                      </div>
                      <div>
                        <strong>External timestamps</strong> anchor the file's hash to a real-world moment that no one can rewrite: independent Time Stamp Authorities cryptographically sign "this hash existed by TIME_T". The proofs are archived in a <code>.zwm</code> sidecar next to your marked image.
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
                  When you mark, the app will POST the marked image's SHA-256 hash to{" "}
                  <strong>{settings.timestamps.tsaUrls.length}</strong> Time Stamp Authorit
                  {settings.timestamps.tsaUrls.length === 1 ? "y" : "ies"}
                  {settings.timestamps.otsCalendarUrls.length > 0 && (
                    <>
                      {" "}and <strong>{settings.timestamps.otsCalendarUrls.length}</strong>{" "}
                      OpenTimestamps calendar
                      {settings.timestamps.otsCalendarUrls.length === 1 ? "" : "s"}
                    </>
                  )}
                  . No pixels, no identity — just the hash. The responses go into a{" "}
                  <code>.zwm</code> sidecar. Change providers in <em>Settings → Timestamps</em>.
                </>
              ) : (
                <>
                  Timestamping is off — your mark will still verify cryptographically, but
                  there's no independent proof of when you signed it. Anyone who strips
                  your mark and re-signs could claim priority without contradiction.
                </>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="zw-h2">Visible watermark</div>
              {overlay.enabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Star size={12} />}
                  onClick={saveOverlayAsDefault}
                  loading={savingOverlayDefault}
                  title="Save these overlay settings as the app-wide default"
                >
                  Save as default
                </Button>
              )}
            </div>
            <OverlayEditor value={overlay} onChange={setOverlay} />
          </Card>

          {!path ? (
            <DropZone
              onPaths={onPaths}
              accept={ACCEPT}
              icon={<Wand2 size={30} strokeWidth={1.5} />}
              title="Drop an image here to mark"
              subtitle="or click to browse"
              hint={`Accepts ${ACCEPT.join(", ")}. Original is preserved — a new file is written next to it as name.zw.png`}
              dialogTitle="Choose an image to mark"
            />
          ) : (
            <Section
              title="Ready to mark"
              actions={
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setPath(null); setResult(null); }}>
                    Change image
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Wand2 size={14} />}
                    onClick={run}
                    loading={busy}
                    disabled={!canRun}
                  >
                    Apply watermark
                  </Button>
                </div>
              }
            >
              <Card>
                <div className="flex gap-5 flex-wrap sm:flex-nowrap">
                  {previewSrc ? (
                    <img
                      src={previewSrc}
                      alt=""
                      className="zw-preview-frame"
                      style={{ width: 192, height: 144 }}
                    />
                  ) : (
                    <div className="zw-preview-frame" style={{ width: 192, height: 144 }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="zw-h2 mb-2">Source</div>
                    <div className="zw-path-well">{path}</div>
                    <div className="zw-meta mt-3">
                      <span className="zw-meta-item">
                        <Layers size={12} /> <strong>{strength}</strong>
                      </span>
                      <span className="zw-meta-item">
                        <ShieldCheck size={12} /> signed as <strong>{active.displayName}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </Section>
          )}

          {result && (
            <Section
              title={
                <span className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-[color:var(--zw-success)]" /> Marked
                </span>
              }
              description="A new file was written next to the source. The original is untouched."
              actions={
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={copied ? <Check size={14} /> : <Copy size={14} />}
                    onClick={copyPath}
                  >
                    {copied ? "Copied" : "Copy path"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<FolderOpen size={14} />}
                    onClick={() => void revealItemInDir(result.outputPath).catch(() => undefined)}
                  >
                    Reveal
                  </Button>
                </div>
              }
            >
              <Card variant="success">
                <div className="zw-h2 mb-2">Output</div>
                <div className="zw-path-well">{result.outputPath}</div>
                <div className="zw-meta mt-4">
                  <span className="zw-meta-item">
                    <Clock size={12} /> <strong>{result.durationMs} ms</strong>
                  </span>
                  <span className="zw-meta-item">
                    <Layers size={12} /> <strong>{result.strength}</strong>
                  </span>
                  <span className="zw-meta-item">
                    <HardDrive size={12} /> <strong>{formatBytes(result.bytes)}</strong>
                  </span>
                  <span className="zw-meta-item">
                    <Cpu size={12} /> <strong>{result.payloadBits}-bit</strong>&nbsp;payload
                  </span>
                </div>
                {result.sidecarPath && (
                  <div className="mt-4 pt-4 border-t border-[color:var(--zw-border-hair)]">
                    <div className="text-xs text-[color:var(--zw-text-1)] inline-flex items-center gap-2">
                      <Anchor size={12} />
                      <strong>{result.timestampsObtained ?? 0}</strong> external timestamp
                      {(result.timestampsObtained ?? 0) === 1 ? "" : "s"} archived
                    </div>
                    <div className="zw-small mt-1 font-mono break-all">
                      {result.sidecarPath}
                    </div>
                    {result.timestampErrors && result.timestampErrors.length > 0 && (
                      <div className="mt-2 zw-small text-[color:var(--zw-warning)]">
                        {result.timestampErrors.length} TSA
                        {result.timestampErrors.length === 1 ? "" : "s"} did not respond:{" "}
                        {result.timestampErrors.map((e) => e.tsaUrl).join(", ")}
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-[color:var(--zw-border-hair)] flex items-center justify-between gap-3 flex-wrap">
                  <span className="zw-small">Want to see what a recipient sees?</span>
                  <Button variant="ghost" size="sm" icon={<Scan size={14} />} onClick={() => setRoute("verify")}>
                    Open Verify
                  </Button>
                </div>
              </Card>
            </Section>
          )}
        </>
      )}
      <NetworkDisclosureModal
        open={disclosureOpen}
        urls={[
          ...settings.timestamps.tsaUrls,
          ...settings.timestamps.otsCalendarUrls,
        ]}
        purpose="Timestamping will POST the marked image's SHA-256 hash to these RFC 3161 Time Stamp Authorities and OpenTimestamps calendars each time you mark an image with the Provenance toggle on. Verifying OpenTimestamps proofs later will additionally query blockstream.info for Bitcoin block headers."
        onCancel={() => setDisclosureOpen(false)}
        onProceed={() => void proceedAfterDisclosure()}
      />
    </Panel>
  );
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i === -1 ? p : p.slice(i + 1);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}