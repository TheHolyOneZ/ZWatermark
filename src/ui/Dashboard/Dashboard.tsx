import { useEffect, useMemo } from "react";
import {
  Activity,
  ShieldCheck,
  ImageIcon,
  Clock,
  Camera,
  Cpu,
  Wand2,
  Layers,
  Fingerprint,
} from "lucide-react";
import { useCapturesStore } from "../../store/capturesStore";
import { useIdentityStore } from "../../store/identityStore";
import { useDevicesStore } from "../../store/devicesStore";
import { useAppStore } from "../../store/appStore";
import { Panel } from "../lib/Panel";
import { Section } from "../lib/Section";
import { Card } from "../lib/Card";
import { Badge } from "../lib/Badge";
import { EmptyState } from "../lib/EmptyState";
import { Button } from "../lib/Button";
import { Select } from "../lib/Select";

export function Dashboard() {
  const { entries, markedToday, refresh } = useCapturesStore();
  const identities = useIdentityStore((s) => s.identities);
  const active = useIdentityStore((s) => s.active);
  const setActive = useIdentityStore((s) => s.setActive);
  const devicesReady = useDevicesStore((s) => s.ready);
  const loadDevices = useDevicesStore((s) => s.load);
  const devices = useDevicesStore((s) => s.devices);
  const { setRoute } = useAppStore();

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!devicesReady) loadDevices();
  }, [devicesReady, loadDevices]);

  const defaultDevice = useMemo(
    () =>
      active?.defaultDeviceId
        ? devices.find((d) => d.id === active.defaultDeviceId) ?? null
        : null,
    [active?.defaultDeviceId, devices],
  );

  const captureState = (e: { verified: boolean; payloadBits: number }): "marked" | "fragile" | "detected" =>
    e.verified ? "marked" : e.payloadBits > 0 ? "fragile" : "detected";

  const stats = useMemo(() => {
    let verified = 0, fragile = 0, detected = 0;
    for (const e of entries) {
      const s = captureState(e);
      if (s === "marked") verified++;
      else if (s === "fragile") fragile++;
      else detected++;
    }
    return { verified, fragile, detected, total: entries.length };
  }, [entries]);

  return (
    <Panel
      title="Dashboard"
      subtitle="Mark an image with your invisible signature, or verify one you received."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setRoute("verify")}>
            Verify an image
          </Button>
          <Button variant="primary" size="sm" icon={<Wand2 size={14} />} onClick={() => setRoute("mark")}>
            Mark an image
          </Button>
        </div>
      }
    >

      <Card>
        <div className="zw-hero">
          <div className="zw-avatar" aria-hidden>
            <ShieldCheck size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {active && identities.length > 1 ? (
                <Select<string>
                  value={active.id}
                  onChange={(v) => setActive(v)}
                  options={identities.map((id) => ({
                    value: id.id,
                    label: id.displayName,
                    icon: <ShieldCheck size={12} aria-hidden />,
                    hint: id.email ?? undefined,
                  }))}
                  ariaLabel="Active identity"
                  wrapperClassName="min-w-[220px] max-w-[320px]"
                />
              ) : (
                <strong className="zw-h3 truncate">
                  {active ? active.displayName : "No identity selected"}
                </strong>
              )}
              <Badge variant={active ? "success" : "neutral"}>
                {active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              {active ? (
                <Badge variant={defaultDevice ? "info" : "neutral"}>
                  <Cpu size={11} aria-hidden style={{ marginRight: 4 }} />
                  {defaultDevice ? defaultDevice.name : "No default device"}
                </Badge>
              ) : null}
              <span className="text-xs text-[color:var(--zw-text-2)]">
                {active
                  ? "Ready to sign"
                  : "Choose an identity to start marking captures."}
              </span>
            </div>
          </div>
          {active ? (
            <span className="zw-key-chip" style={{ marginTop: 0 }} title={active.verifyingKeyHex}>
              <Fingerprint size={12} aria-hidden />
              <span className="font-mono text-xs">{active.verifyingKeyHex.slice(0, 12)}…</span>
            </span>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setRoute("identity")}>
              Open Identity
            </Button>
          )}
        </div>
      </Card>


      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={<Camera size={16} />} label="Marked today" value={markedToday} tone="accent" />
        <Stat icon={<ShieldCheck size={16} />} label="Verified in recent" value={stats.verified} tone="success" />
        <Stat icon={<Activity size={16} />} label="Fragile / detected" value={stats.fragile + stats.detected} tone="warning" />
        <Stat icon={<Layers size={16} />} label="In recent (100)" value={stats.total} tone="neutral" />
      </div>

      <Section
        title="Recent captures"
        description="Most recent 10. Older entries live in Log."
        actions={
          entries.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setRoute("log")}>
              Open log
            </Button>
          )
        }
      >
        {entries.length === 0 ? (
          <EmptyState
            icon={<ImageIcon size={40} strokeWidth={1.4} />}
            title="No marked images yet"
            description="Mark an image to sign it with your identity, or drop one that's already screenshot-shaped into the watched folder."
            action={
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" icon={<Wand2 size={14} />} onClick={() => setRoute("mark")}>
                  Mark an image
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRoute("settings")}>
                  Configure capture
                </Button>
              </div>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.slice(0, 10).map((e) => (
              <li key={e.id} className="zw-capture-row" data-verified={e.verified}>
                {e.thumbnailDataUrl ? (
                  <img src={e.thumbnailDataUrl} alt="" className="zw-capture-thumb" />
                ) : (
                  <div className="zw-capture-thumb zw-capture-thumb--empty" aria-hidden>
                    <ImageIcon size={16} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate font-mono text-xs text-[color:var(--zw-text-1)]">
                    {baseName(e.path)}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {(() => {
                      const s = captureState(e);
                      return (
                        <Badge variant={s === "marked" ? "success" : s === "fragile" ? "warning" : "neutral"}>
                          {s === "marked" ? "Marked" : s === "fragile" ? "Fragile only" : "Detected (unmarked)"}
                        </Badge>
                      );
                    })()}
                    <span className="text-xs text-[color:var(--zw-text-3)] flex items-center gap-1">
                      <Cpu size={11} /> {e.payloadBits} bits
                    </span>
                    <span className="text-xs text-[color:var(--zw-text-3)] flex items-center gap-1">
                      <Clock size={11} /> {relativeTime(e.epochMs)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Panel>
  );
}

function Stat({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "accent" | "success" | "warning" | "neutral";
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

function baseName(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}