import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Cog,
  Laptop,
  Monitor,
  Pencil,
  Plus,
  Server,
  Smartphone,
  Trash2,
} from "lucide-react";
import type { DeviceKind, DeviceSummary } from "../../ipc/bridge";
import { useDevicesStore } from "../../store/devicesStore";
import { useIdentityStore } from "../../store/identityStore";
import { Panel } from "../lib/Panel";
import { Section } from "../lib/Section";
import { Card } from "../lib/Card";
import { Button } from "../lib/Button";
import { Badge } from "../lib/Badge";
import { EmptyState } from "../lib/EmptyState";
import { Modal } from "../lib/Modal";
import { Input } from "../lib/Input";
import { Segmented } from "../lib/Segmented";
import { KeyValueEditor } from "../lib/KeyValueEditor";
import { HelpTip } from "../lib/HelpTip";
import { useToast } from "../lib/Toast";

const KIND_OPTIONS: { value: DeviceKind; label: string }[] = [
  { value: "workstation", label: "Workstation" },
  { value: "laptop", label: "Laptop" },
  { value: "camera", label: "Camera" },
  { value: "phone", label: "Phone" },
  { value: "server", label: "Server" },
  { value: "custom", label: "Custom" },
];

function kindIcon(kind: DeviceKind) {
  switch (kind) {
    case "laptop":
      return <Laptop size={18} />;
    case "camera":
      return <Camera size={18} />;
    case "phone":
      return <Smartphone size={18} />;
    case "server":
      return <Server size={18} />;
    case "custom":
      return <Cog size={18} />;
    case "workstation":
    default:
      return <Monitor size={18} />;
  }
}

export function Devices() {
  const { devices, load, ready, remove } = useDevicesStore();
  const { identities } = useIdentityStore();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DeviceSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DeviceSummary | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!ready) load();
  }, [ready, load]);

  const usageByDevice = useMemo(() => {
    const map = new Map<string, number>();
    for (const id of identities) {
      if (id.defaultDeviceId) {
        map.set(id.defaultDeviceId, (map.get(id.defaultDeviceId) ?? 0) + 1);
      }
    }
    return map;
  }, [identities]);

  return (
    <Panel
      title="Devices"
      subtitle="Describe the machine, camera, or software chain that produces your captures. Each device gets a stable ID that's embedded in every mark you sign with it."
      actions={
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => setCreating(true)}
        >
          New device
        </Button>
      }
    >
      {devices.length === 0 ? (
        <EmptyState
          icon={<Monitor size={40} strokeWidth={1.4} />}
          title="No devices yet"
          description="Create one — start with 'This machine' if you're not sure. You can attach whatever metadata matters: CPU, GPU, camera model, software chain."
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setCreating(true)}
            >
              Create device
            </Button>
          }
        />
      ) : (
        <Section
          title={`${devices.length} device${devices.length === 1 ? "" : "s"}`}
          description="Assign a default device to each identity in the Identity tab."
        >
          <ul className="flex flex-col gap-2">
            {devices.map((d) => {
              const usage = usageByDevice.get(d.id) ?? 0;
              const metaEntries = Object.entries(d.metadata);
              return (
                <li key={d.id}>
                  <Card>
                    <div className="flex items-start gap-3">
                      <div className="zw-avatar" aria-hidden>
                        {kindIcon(d.kind)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-medium text-[color:var(--zw-text-1)] truncate">
                            {d.name}
                          </div>
                          <Badge variant="neutral">
                            {d.kind === "custom" && d.kindLabel
                              ? d.kindLabel
                              : d.kind}
                          </Badge>
                          {usage > 0 && (
                            <Badge variant="info">
                              Used by {usage} identit{usage === 1 ? "y" : "ies"}
                            </Badge>
                          )}
                        </div>
                        {metaEntries.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {metaEntries.map(([k, v]) => (
                              <span
                                key={k}
                                className="zw-key-chip"
                                title={`${k}: ${v}`}
                              >
                                <span className="text-xs">
                                  <strong>{k}</strong> · {v}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil size={14} />}
                          onClick={() => setEditing(d)}
                          aria-label="Edit"
                        >
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 size={14} />}
                          onClick={() => setConfirmDelete(d)}
                          aria-label="Delete"
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

      <DeviceModal
        open={creating}
        onClose={() => setCreating(false)}
        initial={null}
      />
      <DeviceModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        initial={editing}
      />
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete device?"
        description={
          confirmDelete ? (
            <>
              <strong>{confirmDelete.name}</strong> will be removed from this
              device store. Marks already signed with it will still verify,
              but future signatures can no longer reference it.
            </>
          ) : null
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await remove(confirmDelete.id);
                  toast.success("Device deleted", confirmDelete.name);
                } catch (e) {
                  toast.error("Delete blocked", String(e));
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

function DeviceModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: DeviceSummary | null;
}) {
  const { create, update } = useDevicesStore();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DeviceKind>("workstation");
  const [kindLabel, setKindLabel] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setKind(initial?.kind ?? "workstation");
      setKindLabel(initial?.kindLabel ?? "");
      setMetadata(initial?.metadata ?? {});
    }
  }, [open, initial]);

  const submit = async () => {
    setBusy(true);
    try {
      const trimmedLabel = kindLabel.trim();
      const labelPayload =
        kind === "custom" && trimmedLabel.length > 0 ? trimmedLabel : null;
      if (initial) {
        await update(initial.id, name.trim(), kind, metadata, labelPayload);
        toast.success("Device updated", name.trim());
      } else {
        await create(name.trim(), kind, metadata, labelPayload);
        toast.success("Device created", name.trim());
      }
      onClose();
    } catch (e) {
      toast.error("Save failed", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Edit device" : "New device"}
      description="A device profile bundles a display name, kind, and any metadata you want to remember."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={busy}
            disabled={!name.trim()}
          >
            {initial ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Studio Mac"
        />
        <div>
          <label className="text-xs text-[color:var(--zw-text-2)] mb-1.5 inline-flex items-center">
            Kind
            <HelpTip
              ariaLabel="What is the device kind?"
              content={
                <div>
                  A rough category — workstation, laptop, camera, phone, server, or custom. Purely cosmetic: verifiers see it as a badge next to the device name so they can tell your studio Mac apart from your phone at a glance. Pick whatever best fits the rig.
                </div>
              }
            />
          </label>
          <Segmented
            value={kind}
            onChange={(v) => setKind(v as DeviceKind)}
            options={KIND_OPTIONS}
          />
        </div>
        {kind === "custom" && (

          <div>
            <label className="text-xs text-[color:var(--zw-text-2)] mb-1.5 inline-flex items-center">
              Custom kind name
              <HelpTip
                ariaLabel="What is a custom kind label?"
                content={
                  <div>
                    A free-text name for hardware that doesn't fit the built-in categories — for example "e-ink display" or "webcam array". Shown to verifiers as the device kind.
                  </div>
                }
              />
            </label>
            <Input
              value={kindLabel}
              onChange={(e) => setKindLabel(e.target.value)}
              placeholder="e.g. e-ink display, webcam array, default"
            />
          </div>
        )}
        <div>
          <label className="text-xs text-[color:var(--zw-text-2)] mb-1.5 inline-flex items-center">
            Metadata
            <HelpTip
              ariaLabel="What is device metadata?"
              content={
                <div>
                  Free-form notes about the device — CPU, GPU, camera model, software chain, anything you want to remember. This stays on your machine and is <strong>not</strong> embedded in the watermark. Only the device <em>name</em> is written into the fragile layer.
                </div>
              }
            />
          </label>
          <KeyValueEditor value={metadata} onChange={setMetadata} />
        </div>
      </div>
    </Modal>
  );
}
