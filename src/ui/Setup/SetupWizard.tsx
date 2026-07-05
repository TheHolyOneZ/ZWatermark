import { useMemo, useState } from "react";
import {
  KeyRound,
  User,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Camera,
  Sparkles,
  Globe,
  Wand2,
} from "lucide-react";
import { identityGenerate, identityUpdate, registryPublish, type DeviceKind } from "../../ipc/bridge";
import { useIdentityStore } from "../../store/identityStore";
import { useDevicesStore } from "../../store/devicesStore";
import { Button } from "../lib/Button";
import { Input } from "../lib/Input";
import { Toggle } from "../lib/Toggle";
import { Segmented } from "../lib/Segmented";
import { KeyValueEditor } from "../lib/KeyValueEditor";
import { HelpTip } from "../lib/HelpTip";
import logo from "../../assets/logo.png";

type Step =
  | "welcome"
  | "identity"
  | "device"
  | "publish"
  | "done";

const ORDER: Step[] = [
  "welcome",
  "identity",
  "device",
  "publish",
  "done",
];

export function SetupWizard() {
  const { load } = useIdentityStore();
  const { create: createDevice } = useDevicesStore();
  const [step, setStep] = useState<Step>("welcome");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [deviceName, setDeviceName] = useState("This machine");
  const [deviceKind, setDeviceKind] = useState<DeviceKind>("workstation");
  const [deviceMeta, setDeviceMeta] = useState<Record<string, string>>({});
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idx = ORDER.indexOf(step);
  const total = ORDER.length - 1;

  const go = (dir: 1 | -1) => setStep(ORDER[Math.max(0, Math.min(ORDER.length - 1, idx + dir))]);

  const canProceed = useMemo(() => {
    switch (step) {
      case "welcome": return true;
      case "identity": return displayName.trim().length > 0;
      case "device": return deviceName.trim().length > 0;
      case "publish": return true;
      default: return false;
    }
  }, [step, displayName, deviceName]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const identity = await identityGenerate(displayName.trim(), email.trim() || null);
      const device = await createDevice(deviceName.trim(), deviceKind, deviceMeta, null);
      await identityUpdate(
        identity.id,
        identity.displayName,
        identity.email,
        device.id,
      );
      if (publish) {
        try {
          await registryPublish(identity.id);
        } catch (e) {
          setError(`Identity created, but publishing failed: ${String(e)}. You can retry from Identity later.`);
        }
      }
      await load();
      setStep("done");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 grid place-items-center p-8 zw-setup-bg">
      <div className="w-full max-w-xl flex flex-col gap-6">
        <div className="zw-stepper" aria-label="Setup progress">
          {ORDER.slice(0, -1).map((s, i) => (
            <div
              key={s}
              className="zw-stepper-dot"
              data-state={i < idx ? "done" : i === idx ? "current" : "pending"}
              aria-current={i === idx ? "step" : undefined}
            />
          ))}
        </div>

        <div className="zw-card zw-setup-card" key={step}>
          {step === "welcome" && (
            <StepWelcome onNext={() => go(1)} />
          )}
          {step === "identity" && (
            <StepIdentity
              displayName={displayName}
              email={email}
              onName={setDisplayName}
              onEmail={setEmail}
            />
          )}
          {step === "device" && (
            <StepDevice
              name={deviceName}
              kind={deviceKind}
              metadata={deviceMeta}
              onName={setDeviceName}
              onKind={setDeviceKind}
              onMetadata={setDeviceMeta}
            />
          )}
          {step === "publish" && (
            <StepPublish value={publish} onChange={setPublish} />
          )}
          {step === "done" && <StepDone />}

          {error && step !== "done" && (
            <div className="zw-alert zw-alert--error mt-4">{error}</div>
          )}

          {step !== "welcome" && step !== "done" && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-[color:var(--zw-border-hair)]">
              <Button
                variant="ghost"
                onClick={() => go(-1)}
                icon={<ArrowLeft size={14} />}
                disabled={busy}
              >
                Back
              </Button>
              <div className="text-xs text-[color:var(--zw-text-3)] tabular-nums">
                Step {idx} of {total}
              </div>
              {step === "publish" ? (
                <Button
                  variant="primary"
                  onClick={generate}
                  loading={busy}
                  iconRight={<CheckCircle2 size={14} />}
                >
                  Create identity
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => go(1)}
                  disabled={!canProceed || busy}
                  iconRight={<ArrowRight size={14} />}
                >
                  Continue
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="text-center text-xs text-[color:var(--zw-text-3)]">
          Everything stays on this device — no telemetry, no cloud.
        </div>
      </div>
    </div>
  );
}


function StepHead({
  icon, title, help, children,
}: {
  icon: React.ReactNode; title: string; help?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="zw-avatar" aria-hidden>{icon}</div>
      <div className="min-w-0">
        <h2 className="zw-h3 inline-flex items-center">
          {title}
          {help && <HelpTip ariaLabel={`What is ${title.toLowerCase()}?`} content={help} />}
        </h2>
        <p className="zw-small mt-1">{children}</p>
      </div>
    </div>
  );
}

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-4">
      <img src={logo} alt="" className="zw-setup-brand" aria-hidden />
      <div>
        <h1 className="zw-h1">Welcome to ZWatermark</h1>
        <p className="zw-small mt-2 max-w-md">
          Sign screenshots with an Ed25519 identity that never leaves this
          machine. Verify by drag & drop. No cloud, no telemetry.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 w-full mt-1">
        <MiniFeature icon={<Wand2 size={16} />} label="Sign on demand" />
        <MiniFeature icon={<KeyRound size={16} />} label="Local keys" />
        <MiniFeature icon={<Sparkles size={16} />} label="Free & open" />
      </div>
      <Button variant="primary" size="lg" onClick={onNext} iconRight={<ArrowRight size={16} />}>
        Get started
      </Button>
    </div>
  );
}

function MiniFeature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="zw-mini-feature">
      <span className="text-[color:var(--zw-accent)]" aria-hidden>{icon}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

function StepIdentity({
  displayName, email, onName, onEmail,
}: {
  displayName: string; email: string; onName: (v: string) => void; onEmail: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHead icon={<User size={16} />} title="Your identity">
        Shown as the "originator" on any screenshot you sign. You can add more identities later.
      </StepHead>
      <Input
        label="Display name"
        value={displayName}
        onChange={(e) => onName(e.target.value)}
        placeholder="Etienne Busch"
        autoFocus
      />
      <Input
        label="Email"
        hint="Optional — only shown on receipts if you fill it in."
        value={email}
        onChange={(e) => onEmail(e.target.value)}
        placeholder="you@example.com"
        type="email"
      />
    </div>
  );
}

function StepDevice({
  name,
  kind,
  metadata,
  onName,
  onKind,
  onMetadata,
}: {
  name: string;
  kind: DeviceKind;
  metadata: Record<string, string>;
  onName: (v: string) => void;
  onKind: (v: DeviceKind) => void;
  onMetadata: (v: Record<string, string>) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <StepHead
        icon={<Camera size={16} />}
        title="Describe your capture device"
        help={
          <div>
            A device profile is a stable ID for whatever machine, camera, or software pipeline produces your screenshots. Its name gets embedded in every mark you sign, so verifiers can tell which rig a capture came from.
          </div>
        }
      >
        This becomes the "rig" every mark you sign is stamped with. Just a name
        is fine — add extra metadata (CPU, camera, software chain) if you want.
      </StepHead>
      <Input
        label="Device name"
        value={name}
        onChange={(e) => onName(e.target.value)}
        placeholder="This machine"
        autoFocus
      />
      <div>
        <label className="block text-xs text-[color:var(--zw-text-2)] mb-1.5">
          Kind
        </label>
        <Segmented<DeviceKind>
          value={kind}
          onChange={onKind}
          options={[
            { value: "workstation", label: "Workstation" },
            { value: "laptop", label: "Laptop" },
            { value: "camera", label: "Camera" },
            { value: "phone", label: "Phone" },
            { value: "server", label: "Server" },
            { value: "custom", label: "Custom" },
          ]}
          ariaLabel="Device kind"
        />
      </div>
      <div>
        <label className="block text-xs text-[color:var(--zw-text-2)] mb-1.5">
          Metadata (optional)
        </label>
        <KeyValueEditor value={metadata} onChange={onMetadata} />
      </div>
    </div>
  );
}

function StepPublish({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <StepHead icon={<Globe size={16} />} title="Publish public key?">
        Optional. Publishing your public key to <code>zsync.eu/watermark/pubkeys</code>{" "}
        lets others verify your screenshots automatically. You can flip this
        at any time.
      </StepHead>
      <Toggle
        checked={value}
        onChange={onChange}
        label="Publish my public key to the registry"
        description="Only the public half is uploaded. Your private key stays sealed on this device."
      />
      {value && (
        <div className="zw-alert zw-alert--info">
          You'll be prompted to sign the publication request after your identity
          is generated. Nothing is uploaded until then.
        </div>
      )}
    </div>
  );
}

function StepDone() {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-4">
      <div className="zw-setup-hero zw-setup-hero--success" aria-hidden>
        <CheckCircle2 size={40} strokeWidth={1.4} />
      </div>
      <div>
        <h1 className="zw-h1">You're set.</h1>
        <p className="zw-small mt-2 max-w-md">
          Head to Mark to sign an image, or drop any image into Verify to
          check it. Screenshots dropped into your watched folder show up on
          the dashboard automatically.
        </p>
      </div>
    </div>
  );
}

