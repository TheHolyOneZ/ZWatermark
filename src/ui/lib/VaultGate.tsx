import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "./Button";
import { PasswordInput } from "./PasswordInput";
import { useVaultStore } from "../../store/vaultStore";
import { useIdentityStore } from "../../store/identityStore";
import logo from "../../assets/logo.png";

export function VaultGate() {
  const { unlock } = useVaultStore();
  const { load: loadIdentities } = useIdentityStore();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await unlock(password);
      await loadIdentities();
    } catch (e) {
      setError(String(e));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="zw-vault-gate">
      <div className="zw-vault-card zw-card">
        <div className="flex flex-col items-center text-center gap-4">
          <img src={logo} alt="" className="zw-setup-brand" aria-hidden />
          <div>
            <h1 className="zw-h2">ZWatermark is locked</h1>
            <p className="zw-small mt-1 max-w-sm">
              Enter your vault password to open the app. This gate protects the
              UI only — keys stay on this device.
            </p>
          </div>
          <div className="w-full flex flex-col gap-3">
            <PasswordInput
              label={<span className="sr-only">Password</span>}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password.length > 0) void submit();
              }}
              placeholder="Vault password"
              autoFocus
            />
            {error && <div className="zw-alert zw-alert--error">{error}</div>}
            <Button
              variant="primary"
              onClick={submit}
              loading={busy}
              disabled={password.length === 0}
              icon={<ShieldCheck size={14} />}
            >
              Unlock
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
