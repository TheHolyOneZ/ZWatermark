import { Globe, ShieldCheck } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export interface NetworkDisclosureModalProps {
  open: boolean;
  onCancel: () => void;
  onProceed: () => void;
  urls: string[];
  purpose?: string;
}


export function NetworkDisclosureModal({
  open,
  onCancel,
  onProceed,
  urls,
  purpose,
}: NetworkDisclosureModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="md"
      title={
        <span className="inline-flex items-center gap-2">
          <Globe size={16} /> External network call
        </span>
      }
      description={
        purpose ??
        "ZWatermark is about to contact external services on your behalf. The exact URLs are listed below."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onProceed} icon={<ShieldCheck size={14} />}>
            I understand — proceed
          </Button>
        </>
      }
    >
      <div className="zw-small mb-2">Endpoints contacted:</div>
      <ul className="text-sm space-y-1 mb-3">
        {urls.map((u) => (
          <li key={u} className="font-mono text-xs break-all">· {u}</li>
        ))}
      </ul>
      <div className="text-xs text-[color:var(--zw-text-2)] leading-relaxed">
        Each service receives only the SHA-256 hash of your watermarked image — no
        pixels, no metadata, no identity information. The raw response is archived
        locally in a <code>.zwm</code> sidecar next to your marked file so it can be
        independently verified later.
      </div>
    </Modal>
  );
}
