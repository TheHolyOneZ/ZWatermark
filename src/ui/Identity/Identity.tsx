import { useEffect, useState } from "react";
import {
  UserPlus,
  Download,
  Upload,
  Trash2,
  Copy,
  Check,
  KeyRound,
  CircleUser,
  Cloud,
  Pencil,
} from "lucide-react";
import type { IdentitySummary } from "../../ipc/bridge";
import { identityDelete, identityUpdate, registryPublish } from "../../ipc/bridge";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useIdentityStore } from "../../store/identityStore";
import { useDevicesStore } from "../../store/devicesStore";
import { Panel } from "../lib/Panel";
import { Section } from "../lib/Section";
import { Card } from "../lib/Card";
import { Button } from "../lib/Button";
import { Badge } from "../lib/Badge";
import { EmptyState } from "../lib/EmptyState";
import { Modal } from "../lib/Modal";
import { Input } from "../lib/Input";
import { HelpTip } from "../lib/HelpTip";
import { useToast } from "../lib/Toast";

export function Identity({ identities }: { identities: IdentitySummary[] }) {
  const { active, setActive, load, export: exportIdentity } = useIdentityStore();
  const { devices, load: loadDevices, ready: devicesReady } = useDevicesStore();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<IdentitySummary | null>(null);
  const [confirmExport, setConfirmExport] = useState<IdentitySummary | null>(null);
  const [editing, setEditing] = useState<IdentitySummary | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!devicesReady) loadDevices();
  }, [devicesReady, loadDevices]);

  const [publishing, setPublishing] = useState<string | null>(null);
  const publish = async (id: IdentitySummary) => {
    setPublishing(id.id);
    try {
      await registryPublish(id.id);
      toast.success("Public key published", `${id.displayName} is now discoverable by ID.`);
    } catch (e) {
      toast.error("Publish failed", String(e));
    } finally {
      setPublishing(null);
    }
  };

  const runExport = async (id: IdentitySummary) => {
    try {
      const json = await exportIdentity(id.id);
      const safeName = id.displayName
        .trim()
        .replace(/[^a-z0-9-_]+/gi, "_")
        .toLowerCase() || "identity";
      const dest = await saveDialog({
        title: "Export identity",
        defaultPath: `${safeName}.identity.json`,
        filters: [{ name: "Identity JSON", extensions: ["json"] }],
      });
      if (!dest) return;
      await writeTextFile(dest, json);
      toast.success(
        "Identity exported",
        "Store this file somewhere safe — it contains your private key.",
      );
    } catch (e) {
      toast.error("Export failed", String(e));
    }
  };

  const copyKey = async (hex: string) => {
    await navigator.clipboard.writeText(hex);
    setCopied(hex);
    setTimeout(() => setCopied(null), 1400);
  };

  return (
    <Panel
      title="Identity"
      subtitle="Your keys never leave this device. Export a backup so you don't lose them."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<Upload size={14} />} onClick={() => setImporting(true)}>
            Import
          </Button>
          <Button variant="primary" size="sm" icon={<UserPlus size={14} />} onClick={() => setCreating(true)}>
            New identity
          </Button>
        </div>
      }
    >
      {identities.length === 0 ? (
        <EmptyState
          icon={<KeyRound size={40} strokeWidth={1.4} />}
          title="No identities yet"
          description="Create one to start signing screenshots. Everything is generated locally — no network, no accounts."
          action={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              Create identity
            </Button>
          }
        />
      ) : (
        <Section
          title={`Key ring — ${identities.length} identit${identities.length === 1 ? "y" : "ies"}`}
          description="Each key signs a watermark that pairs it with your captures."
        >
          <ul className="flex flex-col gap-2">
            {identities.map((id) => {
              const isActive = active?.id === id.id;
              return (
                <li key={id.id}>
                  <Card variant={isActive ? "success" : "default"}>
                    <div className="flex items-start gap-3">
                      <div className="zw-avatar" aria-hidden>
                        <CircleUser size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-medium text-[color:var(--zw-text-1)] truncate">
                            {id.displayName}
                          </div>
                          {isActive && <Badge variant="success">Active</Badge>}
                        </div>
                        {id.email && (
                          <div className="text-xs text-[color:var(--zw-text-2)] mt-0.5">
                            {id.email}
                          </div>
                        )}
                        {(() => {
                          const dev = devices.find((d) => d.id === id.defaultDeviceId);
                          return (
                            <div className="mt-1">
                              <Badge variant={dev ? "info" : "neutral"}>
                                {dev ? dev.name : "No default device"}
                              </Badge>
                            </div>
                          );
                        })()}
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[10px] uppercase tracking-wider text-[color:var(--zw-text-3)] font-semibold inline-flex items-center">
                            Verifying key
                            <HelpTip
                              ariaLabel="What is a verifying key?"
                              content={
                                <div>
                                  Your public key — safe to share. Anyone who has it can check that a signed screenshot really came from your private key. The private half stays sealed on this device.
                                </div>
                              }
                            />
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyKey(id.verifyingKeyHex)}
                          className="zw-key-chip"
                          title="Copy public key"
                        >
                          <KeyRound size={11} aria-hidden />
                          <span className="font-mono text-xs truncate">
                            {id.verifyingKeyHex.slice(0, 32)}…
                          </span>
                          {copied === id.verifyingKeyHex ? (
                            <Check size={12} className="text-[color:var(--zw-success)]" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isActive && (
                          <Button size="sm" variant="secondary" onClick={() => setActive(id.id)}>
                            Use
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil size={14} />}
                          onClick={() => setEditing(id)}
                          aria-label="Edit"
                          title="Edit signature metadata"
                        >
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Cloud size={14} />}
                          onClick={() => void publish(id)}
                          loading={publishing === id.id}
                          aria-label="Publish public key"
                          title="Publish this identity's public key to the registry so others can verify your signatures"
                        >
                          <span className="sr-only">Publish public key</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Download size={14} />}
                          onClick={() => setConfirmExport(id)}
                          aria-label="Export"
                          title="Export identity to JSON file"
                        >
                          <span className="sr-only">Export</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 size={14} />}
                          onClick={() => setConfirmDelete(id)}
                          aria-label="Delete"
                          title="Delete identity"
                        >
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <NewIdentityModal open={creating} onClose={() => setCreating(false)} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
      <EditIdentityModal
        identity={editing}
        onClose={() => setEditing(null)}
        onSaved={() => load()}
      />
      <Modal
        open={confirmExport !== null}
        onClose={() => setConfirmExport(null)}
        title="Export includes the private key"
        description={
          confirmExport ? (
            <>
              You're about to export <strong>{confirmExport.displayName}</strong>.
              The file contains the raw private seed — anyone who has it can
              sign as you. Store it in an encrypted location and never share it.
            </>
          ) : null
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmExport(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const target = confirmExport;
                setConfirmExport(null);
                if (target) await runExport(target);
              }}
            >
              Export
            </Button>
          </>
        }
      />
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete identity?"
        description={
          confirmDelete ? (
            <>
              <strong>{confirmDelete.displayName}</strong> — its private key
              will be erased from this device. Any screenshots already signed
              with it will still verify against the public key, but you will
              not be able to sign new ones.
            </>
          ) : null
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await identityDelete(confirmDelete.id);
                  await load();
                  toast.success("Identity deleted", confirmDelete.displayName);
                } catch (e) {
                  toast.error("Delete failed", String(e));
                }
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      />
    </Panel>
  );
}

function NewIdentityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { load } = useIdentityStore();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async () => {
    setBusy(true);
    try {
      const { identityGenerate } = await import("../../ipc/bridge");
      await identityGenerate(displayName.trim(), email.trim() || null);
      await load();
      toast.success("Identity created", displayName.trim());
      onClose();
      setDisplayName("");
      setEmail("");
    } catch (e) {
      toast.error("Could not create identity", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New identity"
      description="Generates a fresh Ed25519 keypair, stored locally."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={busy}
            disabled={!displayName.trim()}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Input
          label="Email"
          hint="Optional"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
        />
      </div>
    </Modal>
  );
}

function EditIdentityModal({
  identity,
  onClose,
  onSaved,
}: {
  identity: IdentitySummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [defaultDeviceId, setDefaultDeviceId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { devices } = useDevicesStore();

  useEffect(() => {
    if (identity) {
      setDisplayName(identity.displayName);
      setEmail(identity.email ?? "");
      setDefaultDeviceId(identity.defaultDeviceId ?? "");
    }
  }, [identity]);

  const submit = async () => {
    if (!identity) return;
    setBusy(true);
    try {
      await identityUpdate(
        identity.id,
        displayName.trim(),
        email.trim() || null,
        defaultDeviceId || null,
      );
      onSaved();
      toast.success("Signature updated", displayName.trim());
      onClose();
    } catch (e) {
      toast.error("Update failed", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={identity !== null}
      onClose={onClose}
      title="Edit signature"
      description="Update the name and email that appear on every watermark you sign. The keypair itself is unchanged."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={busy}
            disabled={!displayName.trim()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Input
          label="Email"
          hint="Optional — displayed on verification cards."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
        />
        <div>
          <label className="text-xs text-[color:var(--zw-text-2)] mb-1.5 inline-flex items-center">
            Default device
            <HelpTip
              ariaLabel="What is the default device?"
              content={
                <div>
                  When you sign with this identity and don't pick a device explicitly, this one is used. Handy if you almost always shoot from the same rig — you can still override it per-capture in the Mark tab.
                </div>
              }
            />
          </label>
          <select
            className="zw-input"
            value={defaultDeviceId}
            onChange={(e) => setDefaultDeviceId(e.target.value)}
          >
            <option value="">None</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.kind}
              </option>
            ))}
          </select>
          <div className="text-xs text-[color:var(--zw-text-3)] mt-1">
            {devices.length === 0
              ? "Create a device in the Devices tab first."
              : "Used automatically when you sign with this identity. Can be overridden per capture."}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { import: importIdentity } = useIdentityStore();
  const [busy, setBusy] = useState(false);

  const pickAndImport = async () => {
    setBusy(true);
    try {
      const picked = await openDialog({
        title: "Import identity",
        multiple: false,
        directory: false,
        filters: [{ name: "Identity JSON", extensions: ["json"] }],
      });
      if (!picked || Array.isArray(picked)) {
        setBusy(false);
        return;
      }
      const json = await readTextFile(picked);
      const summary = await importIdentity(json);
      toast.success("Identity imported", summary.displayName);
      onClose();
    } catch (e) {
      toast.error("Import failed", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import identity"
      description="Restore a private key from an exported identity JSON file."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={pickAndImport} loading={busy}>
            Choose file…
          </Button>
        </>
      }
    >
      <div className="zw-alert zw-alert--info">
        The file must contain a private seed. It will be added to your local
        key ring — nothing is sent over the network.
      </div>
    </Modal>
  );
}