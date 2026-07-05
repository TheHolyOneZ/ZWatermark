import { useEffect, useState } from "react";
import { Cloud, CloudUpload, Search } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Input } from "./Input";
import { useToast } from "./Toast";
import { useCommands } from "./CommandPalette";
import { registryImport, registryPublish } from "../../ipc/bridge";
import { useIdentityStore } from "../../store/identityStore";

export function RegistryImportModal() {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { register } = useCommands();
  const { active } = useIdentityStore();

  useEffect(() => {
    const cmds = [
      {
        id: "registry.import",
        section: "Registry",
        label: "Registry: import public key by ID…",
        icon: <Cloud size={14} />,
        keywords: ["pubkey", "verify", "signer", "download"],
        perform: () => setOpen(true),
      },
    ];
    if (active) {
      cmds.push({
        id: "registry.publish",
        section: "Registry",
        label: `Registry: publish ${active.displayName}…`,
        icon: <CloudUpload size={14} />,
        keywords: ["upload", "share", "pubkey"],
        perform: async () => {
          try {
            await registryPublish(active.id);
            toast.success("Public key published");
          } catch (e) {
            toast.error("Publish failed", String(e));
          }
        },
      });
    }
    return register(cmds);
  }, [register, active, toast]);

  const submit = async () => {
    const id = userId.trim();
    if (!id) return;
    setBusy(true);
    try {
      const pub = await registryImport(id);
      toast.success("Imported", `Public key added for ${pub.displayName}.`);
      setUserId("");
      setOpen(false);
    } catch (e) {
      toast.error("Import failed", String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Import public key"
      description="Fetches a signer's public key from the registry so you can verify screenshots they signed. Everything else about that identity stays with them."
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={busy}
            disabled={userId.trim().length === 0}
            icon={<Search size={14} />}
          >
            Fetch
          </Button>
        </>
      }
    >
      <Input
        label="Identity ID"
        hint="UUID printed on the sender's Identity card."
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && userId.trim().length > 0) void submit();
        }}
        autoFocus
      />
    </Modal>
  );
}
