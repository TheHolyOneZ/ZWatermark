import { useEffect, useState } from "react";
import {
  Camera,
  Info,
  Folder,
  Globe,
  Code2,
  Lock,
  KeyRound,
  Anchor,
  RotateCcw,
  GitBranch,
  User,
  Boxes,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSettingsStore } from "../../store/settingsStore";
import { useVaultStore } from "../../store/vaultStore";
import type { Settings as S } from "../../ipc/bridge";
import { Panel } from "../lib/Panel";
import { Section } from "../lib/Section";
import { Card } from "../lib/Card";
import { Segmented } from "../lib/Segmented";
import { Toggle } from "../lib/Toggle";
import { Button } from "../lib/Button";
import { Badge } from "../lib/Badge";
import { Modal } from "../lib/Modal";
import { PasswordInput } from "../lib/PasswordInput";
import { TagList } from "../lib/TagList";
import { HelpTip } from "../lib/HelpTip";
import { OverlayEditor } from "../lib/OverlayEditor";
import { useToast } from "../lib/Toast";
import logo from "../../assets/logo.png";

type Tab = "capture" | "timestamps" | "security" | "about";

const DEFAULT_TSA_URLS = [
  "https://freetsa.org/tsr",
  "http://timestamp.digicert.com",
];

const DEFAULT_OTS_URLS = [
  "https://alice.btc.calendar.opentimestamps.org",
  "https://bob.btc.calendar.opentimestamps.org",
  "https://finney.calendar.eternitywall.com",
];

export function Settings() {
  const { settings, load, update } = useSettingsStore();
  const [tab, setTab] = useState<Tab>("capture");
  const [draft, setDraft] = useState<S>(settings);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setDraft(settings); setDirty(false); }, [settings]);

  const patch = (p: Partial<S>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await update(draft);
      toast.success("Settings saved");
    } catch (e) {
      toast.error("Save failed", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Settings"
      subtitle="Preferences are stored locally and never synchronized to any server."
      actions={
        dirty && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setDraft(settings); setDirty(false); }}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={save} loading={busy}>
              Save changes
            </Button>
          </div>
        )
      }
    >
      <Segmented
        value={tab}
        onChange={setTab}
        ariaLabel="Settings section"
        options={[
          { value: "capture", label: "Capture", icon: <Camera size={14} /> },
          { value: "timestamps", label: "Timestamps", icon: <Anchor size={14} /> },
          { value: "security", label: "Security", icon: <Lock size={14} /> },
          { value: "about", label: "About", icon: <Info size={14} /> },
        ]}
      />

      {tab === "capture" && (
        <Section title="Capture" description="How and where new screenshots are picked up.">
          <Card>
            <div className="flex flex-col gap-4">
              <Row
                label="Default strength"
                description="Which watermark layers to apply to new captures."
                help={
                  <div className="flex flex-col gap-1.5">
                    <div><strong>Robust</strong> — survives compression and re-encoding.</div>
                    <div><strong>Fragile</strong> — cryptographic signature; breaks on any edit, proves tamper-free.</div>
                    <div><strong>Both</strong> — recommended for almost everyone.</div>
                    <div><strong>Max</strong> — Both layers with boosted robust amplitude. Survives harder attacks (aggressive recompression, phone-photo-of-screen). Slightly more visible on flat regions.</div>
                  </div>
                }
              >
                <Segmented
                  value={draft.defaultStrength}
                  onChange={(v) => patch({ defaultStrength: v })}
                  ariaLabel="Default strength"
                  options={[
                    { value: "robust", label: "Robust", hint: "DWT only — survives re-encoding" },
                    { value: "fragile", label: "Fragile", hint: "LSB only — signed, breaks on any edit" },
                    { value: "both", label: "Both", hint: "Recommended" },
                    { value: "max", label: "Max", hint: "Both, boosted amplitude — survives harder attacks" },
                  ]}
                />
              </Row>
              <div className="zw-setting-row zw-setting-row--stack">
                <div className="flex items-center gap-2 mb-2">
                  <Folder size={14} className="text-[color:var(--zw-text-2)]" />
                  <div className="text-sm text-[color:var(--zw-text-1)] inline-flex items-center">
                    Watched folders
                    <HelpTip
                      ariaLabel="What are watched folders?"
                      content={
                        <div>
                          Directories the app quietly scans for new screenshots. Anything that lands here is auto-marked with your active identity. Leave empty to only watch the OS default screenshot folder.
                        </div>
                      }
                    />
                  </div>
                </div>
                <div className="text-xs text-[color:var(--zw-text-2)] mb-2">
                  Folders monitored for new screenshots. Empty means the OS default location only.
                </div>
                <TagList
                  value={draft.captureWatchedFolders}
                  onChange={(v) => patch({ captureWatchedFolders: v })}
                  placeholder="/home/you/Pictures/Screenshots"
                  emptyHint="Empty — only the OS default screenshots folder is watched"
                />
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <div className="zw-h3">Default visible watermark</div>
              <HelpTip
                ariaLabel="What is the visible watermark?"
                content={
                  <div>
                    Optional cosmetic overlay drawn onto the pixels. Trivial for a determined attacker to crop away — the invisible robust and fragile layers stay in the file underneath. Configured here it applies to every mark by default; you can override it per-mark in the Mark and Batch tabs.
                  </div>
                }
              />
            </div>
            <OverlayEditor
              value={draft.defaultOverlay}
              onChange={(o) => patch({ defaultOverlay: o })}
            />
          </Card>
        </Section>
      )}

      {tab === "timestamps" && (
        <Section
          title="External timestamps"
          description="RFC 3161 timestamp authorities give any verifier cryptographic proof this image existed by a specific time."
        >
          <Card>
            <div className="flex flex-col gap-4">
              <Row
                label="Request timestamps by default"
                description="When on, marking an image contacts the TSAs below and writes a .zwm sidecar next to the output."
                help={
                  <div className="flex flex-col gap-1.5">
                    <div>Timestamping is what defeats a re-marking attack: an attacker can strip your mark and replace it with their own, but they cannot backdate the TSA's response.</div>
                    <div>Each TSA receives only the SHA-256 hash of your marked image — no pixels, no metadata, no identity.</div>
                    <div>Turn this off if you want fully offline marking. You can still toggle it per-mark in the Mark tab.</div>
                  </div>
                }
              >
                <Toggle
                  checked={draft.timestamps.defaultRequest}
                  onChange={(v) =>
                    patch({ timestamps: { ...draft.timestamps, defaultRequest: v } })
                  }
                  label={draft.timestamps.defaultRequest ? "On" : "Off"}
                />
              </Row>
              <div className="zw-setting-row zw-setting-row--stack">
                <div className="flex items-center gap-2 mb-2">
                  <Anchor size={14} className="text-[color:var(--zw-text-2)]" />
                  <div className="text-sm text-[color:var(--zw-text-1)] inline-flex items-center">
                    Timestamp authorities
                    <HelpTip
                      ariaLabel="What are TSA URLs?"
                      content={
                        <div className="flex flex-col gap-1.5">
                          <div>Each URL points to an RFC 3161 Time Stamp Authority. When timestamping is enabled, each is contacted in turn and their responses are archived in the sidecar.</div>
                          <div>Multiple TSAs = no single point of failure. If one is down when you mark, the others still succeed.</div>
                          <div><strong>FreeTSA</strong> is free and community-run; <strong>DigiCert</strong> is a commercial CA offering free public timestamps.</div>
                        </div>
                      }
                    />
                  </div>
                </div>
                <div className="text-xs text-[color:var(--zw-text-2)] mb-2">
                  URLs contacted for each mark when timestamping is enabled.
                </div>
                <TagList
                  value={draft.timestamps.tsaUrls}
                  onChange={(v) =>
                    patch({ timestamps: { ...draft.timestamps, tsaUrls: v } })
                  }
                  placeholder="https://freetsa.org/tsr"
                  emptyHint="Empty — no timestamps will be requested even if the toggle is on"
                />
              </div>
              <div className="zw-setting-row zw-setting-row--stack">
                <div className="flex items-center gap-2 mb-2">
                  <Anchor size={14} className="text-[color:var(--zw-text-2)]" />
                  <div className="text-sm text-[color:var(--zw-text-1)] inline-flex items-center">
                    OpenTimestamps calendars
                    <HelpTip
                      ariaLabel="What are OTS calendars?"
                      content={
                        <div className="flex flex-col gap-1.5">
                          <div>OpenTimestamps calendars pool submissions and periodically commit their aggregate hash into a Bitcoin block header. Once committed (~24h), no one — not even the calendar — can rewrite the timestamp without rewriting Bitcoin's proof-of-work chain.</div>
                          <div>Adding two or three calendars is prudent: if one operator vanishes, the others still upgrade your proof.</div>
                          <div>Leave empty to skip OTS entirely and rely on RFC 3161 only.</div>
                        </div>
                      }
                    />
                  </div>
                </div>
                <div className="text-xs text-[color:var(--zw-text-2)] mb-2">
                  Bitcoin-anchored evidence. Proofs upgrade automatically within ~24h.
                </div>
                <TagList
                  value={draft.timestamps.otsCalendarUrls}
                  onChange={(v) =>
                    patch({ timestamps: { ...draft.timestamps, otsCalendarUrls: v } })
                  }
                  placeholder="https://alice.btc.calendar.opentimestamps.org"
                  emptyHint="Empty — no OpenTimestamps proofs will be requested"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <div className="text-xs text-[color:var(--zw-text-2)] leading-relaxed">
                  Responses are stored in a <code>.zwm</code> sidecar next to each marked image and re-verified offline (plus a Bitcoin-header lookup for OTS proofs).
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={14} />}
                  onClick={() =>
                    patch({
                      timestamps: {
                        ...draft.timestamps,
                        defaultRequest: true,
                        tsaUrls: DEFAULT_TSA_URLS,
                        otsCalendarUrls: DEFAULT_OTS_URLS,
                      },
                    })
                  }
                >
                  Reset to defaults
                </Button>
              </div>
            </div>
          </Card>
        </Section>
      )}

      {tab === "security" && <SecurityTab />}

      {tab === "about" && (
        <Section title="About">
          <Card>
            <div className="flex items-start gap-4">
              <div className="zw-brand-mark" aria-hidden><img src={logo} alt="" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="zw-h3">ZWatermark</div>
                  <Badge variant="success">Free</Badge>
                  <Badge variant="neutral">GPL-3.0-or-later</Badge>
                </div>
                <div className="text-sm text-[color:var(--zw-text-1)] mt-3 leading-relaxed">
                  Forensic screenshot watermarking. Every mark is cryptographically signed with your local Ed25519 key so anyone can prove — or disprove — that a captured image came from you.
                </div>
                <div className="text-xs text-[color:var(--zw-text-2)] mt-2 leading-relaxed">
                  The signing key never leaves your machine. The app makes network calls only when <em>you</em> ask it to: publishing an identity to the registry, or requesting external timestamps for a mark. Nothing is uploaded, phoned home, or analytics-tracked in the background.
                </div>
                <div className="zw-meta mt-4">
                  <span className="zw-meta-item"><strong>v0.1.0</strong></span>
                  <span className="zw-meta-item">No telemetry</span>
                  <span className="zw-meta-item">No accounts</span>
                  <span className="zw-meta-item">Network only on your action</span>
                  <span className="zw-meta-item">Keys never leave this device</span>
                </div>
                <div className="mt-4 pt-4 border-t border-[color:var(--zw-border-hair)]">
                  <div className="text-xs text-[color:var(--zw-text-3)] mb-2 uppercase tracking-wider">Project</div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Globe size={14} />}
                      onClick={() => void openUrl("https://zsync.eu/zwatermark/")}
                    >
                      Website
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<GitBranch size={14} />}
                      onClick={() => void openUrl("https://github.com/TheHolyOneZ/ZWatermark")}
                    >
                      GitHub
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Code2 size={14} />}
                      onClick={() => void openUrl("https://github.com/TheHolyOneZ/ZWatermark")}
                    >
                      Source
                    </Button>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-[color:var(--zw-border-hair)]">
                  <div className="text-xs text-[color:var(--zw-text-3)] mb-2 uppercase tracking-wider">Made by</div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<User size={14} />}
                      onClick={() => void openUrl("https://github.com/TheHolyOneZ")}
                    >
                      TheHolyOneZ on GitHub
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Boxes size={14} />}
                      onClick={() => void openUrl("https://zsync.eu")}
                    >
                      More Z-projects at zsync.eu
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Section>
      )}
    </Panel>
  );
}

function Row({
  label, description, help, children,
}: {
  label: string; description?: string; help?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="zw-setting-row">
      <div>
        <div className="text-sm text-[color:var(--zw-text-1)] inline-flex items-center">
          {label}
          {help && <HelpTip ariaLabel={`What is ${label.toLowerCase()}?`} content={help} />}
        </div>
        {description && <div className="text-xs text-[color:var(--zw-text-2)] mt-0.5">{description}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SecurityTab() {
  const { status, refresh } = useVaultStore();
  const [modal, setModal] = useState<"enable" | "disable" | "change" | null>(null);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <Section title="Security" description="Optional launch password. Everything stays local.">
      <Card>
        <div className="flex flex-col gap-4">
          <div className="zw-setting-row">
            <div className="flex-1">
              <Toggle
                checked={status.enabled}
                onChange={(v) => setModal(v ? "enable" : "disable")}
                label="Require password to open ZWatermark"
                description="Prompts once at launch. Nothing else changes — no per-key passphrases, no per-sign prompts."
              />
            </div>
            <HelpTip
              ariaLabel="What does the vault password protect?"
              content={
                <div>
                  Adds a launch-time password to open the app UI. It does <strong>not</strong> encrypt your private keys on disk — the keys still sit under your OS user account in plain text. For at-rest protection, use full-disk encryption.
                </div>
              }
            />
          </div>
          {status.enabled && (
            <div className="zw-setting-row">
              <div>
                <div className="text-sm text-[color:var(--zw-text-1)]">Vault password</div>
                <div className="text-xs text-[color:var(--zw-text-2)] mt-0.5">Change the password you type at launch.</div>
              </div>
              <Button variant="secondary" size="sm" icon={<KeyRound size={14} />} onClick={() => setModal("change")}>
                Change password
              </Button>
            </div>
          )}
          <div className="zw-alert zw-alert--info">
            <Info size={14} aria-hidden />
            <div>
              The vault password protects the app UI. Keys are stored in plain
              text under your OS user account. For at-rest protection, use
              full-disk encryption.
            </div>
          </div>
        </div>
      </Card>

      <EnableVaultModal open={modal === "enable"} onClose={() => setModal(null)} />
      <DisableVaultModal open={modal === "disable"} onClose={() => setModal(null)} />
      <ChangeVaultModal open={modal === "change"} onClose={() => setModal(null)} />
    </Section>
  );
}

function EnableVaultModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { enable } = useVaultStore();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const mismatch = pw2.length > 0 && pw !== pw2;
  const ok = pw.length >= 8 && !mismatch;

  const submit = async () => {
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await enable(pw);
      toast.success("Vault enabled", "You'll be prompted at next launch.");
      onClose();
      setPw("");
      setPw2("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { setPw(""); setPw2(""); setError(null); onClose(); }}
      title="Set vault password"
      description="Pick a password you'll remember. There is no recovery — the app will simply refuse to open."
      footer={
        <>
          <Button variant="ghost" onClick={() => { setPw(""); setPw2(""); setError(null); onClose(); }} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!ok}>Enable vault</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <PasswordInput
          label="Password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          strengthMeter
          autoFocus
        />
        <PasswordInput
          label="Confirm password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          error={mismatch ? "Doesn't match" : undefined}
        />
        {error && <div className="zw-alert zw-alert--error">{error}</div>}
      </div>
    </Modal>
  );
}

function DisableVaultModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { disable, refresh } = useVaultStore();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await disable(pw);
      toast.success("Vault disabled");
      onClose();
      setPw("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setPw("");
    setError(null);
    await refresh();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={cancel}
      title="Disable vault"
      description="Enter your current vault password to remove the launch gate."
      footer={
        <>
          <Button variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={pw.length === 0}>Disable</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <PasswordInput
          label="Current password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
        />
        {error && <div className="zw-alert zw-alert--error">{error}</div>}
      </div>
    </Modal>
  );
}

function ChangeVaultModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { change } = useVaultStore();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const mismatch = newPw2.length > 0 && newPw !== newPw2;
  const ok = oldPw.length > 0 && newPw.length >= 8 && !mismatch;

  const submit = async () => {
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await change(oldPw, newPw);
      toast.success("Vault password changed");
      onClose();
      setOldPw(""); setNewPw(""); setNewPw2("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { setOldPw(""); setNewPw(""); setNewPw2(""); setError(null); onClose(); }}
      title="Change vault password"
      footer={
        <>
          <Button variant="ghost" onClick={() => { setOldPw(""); setNewPw(""); setNewPw2(""); setError(null); onClose(); }} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!ok}>Save</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <PasswordInput
          label="Current password"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
          autoFocus
        />
        <PasswordInput
          label="New password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          strengthMeter
        />
        <PasswordInput
          label="Confirm new password"
          value={newPw2}
          onChange={(e) => setNewPw2(e.target.value)}
          error={mismatch ? "Doesn't match" : undefined}
        />
        {error && <div className="zw-alert zw-alert--error">{error}</div>}
      </div>
    </Modal>
  );
}