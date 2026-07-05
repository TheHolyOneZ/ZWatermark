import { useCallback, useEffect } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  X,
  FolderOpen,
  Scan,
  Anchor,
  Clock,
  FileCheck2,
  AlertTriangle,
} from "lucide-react";
import { useVerifyStore } from "../../store/verifyStore";
import { Panel } from "../lib/Panel";
import { Section } from "../lib/Section";
import { Card } from "../lib/Card";
import { Button } from "../lib/Button";
import { Badge } from "../lib/Badge";
import { ConfidenceBar } from "../lib/ConfidenceBar";
import { HexViewer } from "../lib/HexViewer";
import { DropZone } from "../lib/DropZone";
import { HelpTip } from "../lib/HelpTip";
import { useCommands } from "../lib/CommandPalette";
import type { VerifyResult } from "../../ipc/bridge";

const ACCEPT = ["png", "jpg", "jpeg", "webp", "bmp"];

export function Verify() {
  const { verify, lastResult, lastPath, busy, clear } = useVerifyStore();
  const { register } = useCommands();

  const pick = useCallback(async () => {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "Image", extensions: ACCEPT }],
    });
    if (typeof path === "string") await verify(path);
  }, [verify]);

  const onPaths = useCallback(
    async (paths: string[]) => {
      const p = paths[0];
      if (p) await verify(p);
    },
    [verify],
  );

  useEffect(
    () =>
      register([
        {
          id: "verify.open",
          section: "Verify",
          label: "Verify from file…",
          hint: "Choose image",
          icon: <FolderOpen size={14} />,
          perform: () => void pick(),
        },
        {
          id: "verify.clear",
          section: "Verify",
          label: "Clear last result",
          perform: () => clear(),
        },
      ]),
    [register, pick, clear],
  );

  const status = statusFor(lastResult);

  return (
    <Panel
      title="Verify"
      subtitle="Drop an image to check its watermark and Ed25519 signature. A valid signature is the ground truth for authenticity — the decode margin below only reports how much redundancy survived the trip."
    >
      <DropZone
        onPaths={onPaths}
        accept={ACCEPT}
        icon={<Scan size={30} strokeWidth={1.5} />}
        title="Drop an image here to verify"
        subtitle="or click to browse"
        hint={`Accepts ${ACCEPT.join(", ")}`}
        dialogTitle="Choose an image to verify"
      />

      {busy && (
        <Card>
          <div className="flex items-center gap-3">
            <div className="zw-spinner" aria-hidden />
            <div className="min-w-0">
              <div className="text-sm font-medium">Analysing…</div>
              {lastPath && (
                <div className="font-mono text-xs text-[color:var(--zw-text-3)] truncate mt-0.5">
                  {lastPath}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {!busy && lastResult && (
        <Section
          title="Result"
          actions={
            <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={clear}>
              Dismiss
            </Button>
          }
        >
          <Card variant={status.card}>

            <div className="zw-verdict" data-tone={status.card}>
              <div className="zw-verdict-icon" aria-hidden>{status.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="zw-verdict-title">{status.title}</div>
                <div className="zw-verdict-sub">{status.description}</div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge
                  variant={
                    lastResult.found && lastResult.signatureOk
                      ? "success"
                      : lastResult.found
                      ? "warning"
                      : "error"
                  }
                >
                  {lastResult.found && lastResult.signatureOk
                    ? "Signature valid"
                    : lastResult.found
                    ? "Signature unverified"
                    : "No watermark"}
                </Badge>
                <div className="zw-small tabular-nums">
                  Confidence {Math.round(lastResult.confidence * 100)}%
                </div>
              </div>
            </div>

            {lastPath && <div className="zw-path-well mb-5">{lastPath}</div>}


            <dl className="zw-facts">
              <dt>Originator</dt>
              <dd>
                {lastResult.originator ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {lastResult.originator.displayName}
                      </span>
                      {lastResult.originator.email && (
                        <span className="zw-small">
                          &lt;{lastResult.originator.email}&gt;
                        </span>
                      )}
                      {lastResult.identityVerified ? (
                        <Badge variant="success">signature verified</Badge>
                      ) : (
                        <Badge variant="warning">claimed — unverified</Badge>
                      )}
                      <HelpTip
                        ariaLabel="What does the identity badge mean?"
                        content={
                          <div>
                            <b>Signature verified</b> — the fragile-layer
                            signature checks out against the embedded pubkey.
                            Cryptographic proof this file came from the named
                            key.
                            <br /><br />
                            <b>Claimed — unverified</b> — the fragile signature
                            was destroyed (typically by JPEG, resize, or crop),
                            so we could only match the mark's 40-bit
                            fingerprint against a key in your ring. That's
                            useful evidence but not proof: an attacker could
                            in principle grind a colliding key. Trust it as
                            "probably from this person" unless you have a
                            timestamp sidecar to corroborate.
                          </div>
                        }
                      />
                    </div>
                    <div className="zw-small font-mono">
                      key {shortKey(lastResult.originator.verifyingKeyHex)}
                    </div>
                  </div>
                ) : (
                  <em className="text-[color:var(--zw-text-3)]">unknown</em>
                )}
              </dd>

              <dt>Layers</dt>
              <dd>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge
                    variant={lastResult.robustFound ? "success" : "neutral"}
                  >
                    Robust {lastResult.robustFound ? "decoded" : "absent"}
                  </Badge>
                  <Badge
                    variant={lastResult.fragileFound ? "success" : "neutral"}
                  >
                    Fragile {lastResult.fragileFound ? "decoded" : "absent"}
                  </Badge>
                  <Badge
                    variant={lastResult.signatureOk ? "success" : "warning"}
                  >
                    Signature{" "}
                    {lastResult.signatureOk ? "valid Ed25519" : "unverified"}
                  </Badge>
                  <HelpTip
                    ariaLabel="What does 'signature valid Ed25519' mean?"
                    content={
                      <div>
                        Ed25519 is the signature algorithm (same one used by SSH, Signal, WireGuard). <strong>Valid</strong> means the fragile layer's signature checks out against the embedded public key — cryptographic proof the image bytes have not been changed since signing.
                      </div>
                    }
                  />
                </div>
              </dd>

              <dt className="inline-flex items-center">
                Decode margin
                <HelpTip
                  ariaLabel="What is decode margin?"
                  content={
                    <div>
                      Share of the redundant watermark tiles the decoder recovered. The signature is the real proof of authenticity — this bar just shows how much <strong>headroom</strong> the mark has left after compression, cropping or re-encoding. High margin means it'll survive more travel.
                    </div>
                  }
                />
              </dt>
              <dd>
                <ConfidenceBar value={lastResult.confidence} />
                <div className="zw-small mt-1.5">
                  {marginHintFor(lastResult)}
                </div>
              </dd>
            </dl>

            {lastResult.found && !lastResult.signatureOk && (
              <div className="zw-alert zw-alert--warning mt-5">
                <ShieldAlert size={14} aria-hidden />
                <div>
                  {lastResult.originator ? (
                    <>
                      The fragile signature layer is damaged (typically by
                      JPEG, resize, or crop), so signature verification wasn't
                      possible. The mark's 40-bit fingerprint matches{" "}
                      <b>{lastResult.originator.displayName}</b>'s key —
                      strong evidence, but not cryptographic proof. If you
                      have a `.zwm` sidecar or the original file, verify
                      against that instead.
                    </>
                  ) : (
                    <>
                      A watermark was found but its signature could not be
                      verified against any known key. This can mean the
                      signer's public key is not in your key ring, or the
                      image was re-encoded so heavily that the signature
                      layer degraded.
                    </>
                  )}
                </div>
              </div>
            )}

            {!lastResult.found && lastResult.confidence > 0.1 && (
              <div className="zw-alert zw-alert--warning mt-5">
                <ShieldAlert size={14} aria-hidden />
                <div>
                  Weak residual signal detected. This is not conclusive evidence of a
                  watermark — treat as noise.
                </div>
              </div>
            )}
          </Card>

          {(lastResult.selfContained || lastResult.sidecar) && (
            <ProvenanceCard result={lastResult} />
          )}

          {/* Device card */}
          {lastResult.device && (
            <Card
              title="Capture device"
              subtitle={
                lastResult.device.knownLocally
                  ? "Matched against your local device registry."
                  : "Not in your local registry — the fragile layer supplied a name hint."
              }
              actions={
                <Badge
                  variant={
                    lastResult.device.knownLocally ? "success" : "warning"
                  }
                >
                  {lastResult.device.knownLocally
                    ? "Known locally"
                    : "Unknown device"}
                </Badge>
              }
            >
              <dl className="zw-facts">
                <dt>Name</dt>
                <dd>{lastResult.device.name}</dd>

                {(lastResult.device.kindLabel || lastResult.device.kind) && (
                  <>
                    <dt>Kind</dt>
                    <dd>
                      <Badge variant="neutral">
                        {lastResult.device.kindLabel ??
                          lastResult.device.kind}
                      </Badge>
                    </dd>
                  </>
                )}

                {lastResult.device.id && (
                  <>
                    <dt>UUID</dt>
                    <dd className="font-mono text-xs break-all">
                      {lastResult.device.id}
                    </dd>
                  </>
                )}

                {Object.keys(lastResult.device.metadata).length > 0 && (
                  <>
                    <dt data-top="true">Metadata</dt>
                    <dd>
                      <table className="zw-kv-table w-full text-xs">
                        <tbody>
                          {Object.entries(lastResult.device.metadata).map(
                            ([k, v]) => (
                              <tr key={k}>
                                <th className="text-left font-medium pr-3 py-0.5 align-top text-[color:var(--zw-text-2)] whitespace-nowrap">
                                  {k}
                                </th>
                                <td className="py-0.5 font-mono break-all">
                                  {v}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </dd>
                  </>
                )}
              </dl>
            </Card>
          )}

          {/* Payload details */}
          {(lastResult.robustPayload ||
            lastResult.fragilePayload ||
            lastResult.payloadHex) && (
            <Card
              title="Payload details"
              subtitle="Everything the mark embedded, decoded per layer."
            >
              {lastResult.timestampIso && (
                <dl className="zw-facts">
                  <dt>Capture time</dt>
                  <dd className="tabular-nums">
                    {formatTimestamp(lastResult.timestampIso)}
                    <div className="zw-small font-mono mt-0.5">
                      {lastResult.timestampIso}
                    </div>
                  </dd>
                </dl>
              )}

              {lastResult.robustPayload && (
                <div className="mt-4">
                  <div className="zw-h3 mb-2 inline-flex items-center">
                    Robust layer
                    <HelpTip
                      ariaLabel="What is the robust layer?"
                      content={
                        <div>
                          The part of the mark that survives re-encoding — hidden in the image's frequency signal so it lives through screenshots, JPEG saves, and mild edits. It carries the compact ID fields below.
                        </div>
                      }
                    />
                  </div>
                  <dl className="zw-facts">
                    <dt>Version</dt>
                    <dd>v{lastResult.robustPayload.version}</dd>

                    <dt className="inline-flex items-center">
                      User ID
                      <HelpTip
                        ariaLabel="What is the User ID?"
                        content={
                          <div>
                            40-bit BLAKE3 fingerprint of the signer's public key. Enough to look up the signer in your keyring even when the fragile layer is destroyed — that's how <strong>weak attribution</strong> ("claimed") still works after JPEG or resize.
                          </div>
                        }
                      />
                    </dt>
                    <dd className="font-mono text-xs break-all">
                      {lastResult.robustPayload.userIdHex}
                      <div className="zw-small">
                        40-bit BLAKE3 prefix of the originator's public key
                      </div>
                    </dd>

                    <dt className="inline-flex items-center">
                      Device ID
                      <HelpTip
                        ariaLabel="What is the Device ID?"
                        content={
                          <div>
                            16-bit BLAKE3 fingerprint of the device profile used to sign this capture. Lets verifiers tell your laptop's screenshots apart from your workstation's without exposing raw hardware details in the robust layer.
                          </div>
                        }
                      />
                    </dt>
                    <dd className="font-mono text-xs break-all">
                      {lastResult.robustPayload.deviceIdHex}
                      <div className="zw-small">
                        16-bit BLAKE3 prefix of the machine identifier
                      </div>
                    </dd>

                    <dt className="inline-flex items-center">
                      Epoch
                      <HelpTip
                        ariaLabel="What is the epoch?"
                        content={
                          <div>
                            When the image was signed, counted in minutes from a fixed reference date so it fits in a few bytes. Gives the robust layer <strong>minute-level</strong> timing — enough to spot obviously backdated captures.
                          </div>
                        }
                      />
                    </dt>
                    <dd className="tabular-nums">
                      {lastResult.robustPayload.epochMin.toLocaleString()} min
                      {lastResult.robustPayload.epochIso && (
                        <div className="zw-small font-mono">
                          {lastResult.robustPayload.epochIso}
                        </div>
                      )}
                    </dd>

                    <dt className="inline-flex items-center">
                      Counter
                      <HelpTip
                        ariaLabel="What is the counter?"
                        content={
                          <div>
                            Per-day sequence number that bumps on every capture. Keeps two marks unique when they share the same minute, and makes replayed or duplicated frames stand out. Wraps at 4095 (12 bits).
                          </div>
                        }
                      />
                    </dt>
                    <dd className="tabular-nums">
                      {lastResult.robustPayload.counter}
                      <div className="zw-small">
                        Monotonic per-day, wraps at 4095
                      </div>
                    </dd>
                  </dl>
                </div>
              )}

              {lastResult.fragilePayload && (
                <div className="mt-4">
                  <div className="zw-h3 mb-2 inline-flex items-center">
                    Fragile layer
                    <HelpTip
                      ariaLabel="What is the fragile layer?"
                      content={
                        <div>
                          The tamper-evident part of the mark — carries the full Ed25519 signature written into the least-significant pixel bits. Any edit or re-save breaks this layer, so it proves the file bytes are exactly what was signed.
                        </div>
                      }
                    />
                  </div>
                  <dl className="zw-facts">
                    <dt className="inline-flex items-center">
                      Public key
                      <HelpTip
                        ariaLabel="What is the embedded public key?"
                        content={
                          <div>
                            The signer's full 32-byte Ed25519 verifying key, embedded directly in the mark. Anyone can verify the signature against this key — no keyring lookup required. Attribution to a *name* still needs the signer to have published this key's fingerprint out-of-band (website, bio, etc.).
                          </div>
                        }
                      />
                    </dt>
                    <dd className="font-mono text-xs break-all">
                      {lastResult.fragilePayload.pubkeyHex}
                    </dd>

                    <dt className="inline-flex items-center">
                      Timestamp (ns)
                      <HelpTip
                        ariaLabel="What is the fragile timestamp?"
                        content={
                          <div>
                            Exact signing time in nanoseconds since Unix epoch. Precise enough to correlate a capture with system logs or a screen recording. This value is covered by the signature, so any change to it invalidates the mark.
                          </div>
                        }
                      />
                    </dt>
                    <dd className="font-mono text-xs tabular-nums break-all">
                      {lastResult.fragilePayload.timestampNs}
                    </dd>

                    {lastResult.fragilePayload.screenSerial && (
                      <>
                        <dt className="inline-flex items-center">
                          Screen serial
                          <HelpTip
                            ariaLabel="What is the screen serial?"
                            content={
                              <div>
                                Manufacturer serial of the monitor that was captured, read from EDID at capture time. Ties the screenshot to a <strong>specific physical display</strong> — useful when a leak needs to be traced to one particular seat.
                              </div>
                            }
                          />
                        </dt>
                        <dd className="font-mono text-xs">
                          {lastResult.fragilePayload.screenSerial}
                        </dd>
                      </>
                    )}

                    {lastResult.fragilePayload.region && (
                      <>
                        <dt className="inline-flex items-center">
                          Region
                          <HelpTip
                            ariaLabel="What is the region?"
                            content={
                              <div>
                                Which rectangle of the screen was captured, in pixels — <code>x, y</code> as the top-left corner and <code>w × h</code> as the size. Handy for partial-screen or window captures.
                              </div>
                            }
                          />
                        </dt>
                        <dd className="tabular-nums font-mono text-xs">
                          {lastResult.fragilePayload.region.x},
                          {lastResult.fragilePayload.region.y} ·{" "}
                          {lastResult.fragilePayload.region.w}×
                          {lastResult.fragilePayload.region.h}
                        </dd>
                      </>
                    )}

                    {lastResult.fragilePayload.deviceName && (
                      <>
                        <dt>Device name hint</dt>
                        <dd>{lastResult.fragilePayload.deviceName}</dd>
                      </>
                    )}

                    <dt className="inline-flex items-center">
                      Signature
                      <HelpTip
                        ariaLabel="What is the signature?"
                        content={
                          <div>
                            The raw Ed25519 signature bytes. This is the mathematical proof the file is authentic — the verifier above ran the actual check, this field just shows the payload for the technically curious.
                          </div>
                        }
                      />
                    </dt>
                    <dd className="font-mono text-[10px] break-all">
                      {lastResult.fragilePayload.signatureHex}
                    </dd>
                  </dl>
                </div>
              )}

              {lastResult.payloadHex && (
                <div className="mt-4">
                  <HexViewer
                    hex={lastResult.payloadHex}
                    label="Robust payload bytes"
                    defaultOpen={false}
                  />
                </div>
              )}
            </Card>
          )}
        </Section>
      )}
    </Panel>
  );
}

function ProvenanceCard({ result }: { result: VerifyResult }) {
  const sc = result.selfContained ?? null;
  const sidecar = result.sidecar ?? null;

  const rfc = sidecar?.rfc3161 ?? [];
  const ots = sidecar?.opentimestamps ?? [];
  const verifiedTsaCount = rfc.filter((t) => t.verified).length;
  const anyTsaVerified = verifiedTsaCount > 0;
  const verifiedOtsCount = ots.filter((o) => o.verified).length;
  const pendingOtsCount = ots.filter((o) => o.pendingUpgrade).length;
  const anyOtsVerified = verifiedOtsCount > 0;
  const anyExternalTime = anyTsaVerified || anyOtsVerified;

  const overallTone: "success" | "warning" | "error" =
    sc?.signatureOk && (!sidecar || (sidecar.digestMatches && anyExternalTime))
      ? "success"
      : sc?.signatureOk
      ? "warning"
      : "error";

  return (
    <Card
      title="Provenance evidence"
      subtitle="Standalone cryptographic proof anyone can check without prior key exchange."
      actions={
        <Badge variant={overallTone}>
          {overallTone === "success"
            ? "Verified end-to-end"
            : overallTone === "warning"
            ? "Partial"
            : "Unverified"}
        </Badge>
      }
    >
      <dl className="zw-facts">
        {sc && (
          <>
            <dt className="inline-flex items-center">
              Signature
              <HelpTip
                ariaLabel="What is standalone signature verification?"
                content={
                  <div>
                    The mark embeds the signer's full Ed25519 public key, so any verifier can check the signature against that key without importing anything first. Attribution to a real-world name still needs the signer to have published this key's fingerprint out-of-band.
                  </div>
                }
              />
            </dt>
            <dd>
              <div className="flex items-center gap-2 flex-wrap">
                {sc.signatureOk ? (
                  <>
                    <ShieldCheck size={14} className="text-[color:var(--zw-success)]" />
                    <span>Verified against embedded public key</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert size={14} className="text-[color:var(--zw-warning)]" />
                    <span>Embedded pubkey present, signature did not verify</span>
                  </>
                )}
              </div>
            </dd>

            <dt>Signed by</dt>
            <dd>
              {sc.knownIdentity ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{sc.knownIdentity.displayName}</span>
                    {sc.knownIdentity.email && (
                      <span className="zw-small">&lt;{sc.knownIdentity.email}&gt;</span>
                    )}
                    <Badge variant="success">Known key</Badge>
                  </div>
                  <div className="zw-small font-mono">
                    key {shortKey(sc.pubkeyHex)}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{shortKey(sc.pubkeyHex)}</span>
                    <Badge variant="warning">Unknown key</Badge>
                  </div>
                  <div className="zw-small">
                    Fingerprint not in your keyring — verify out-of-band before trusting the name.
                  </div>
                </div>
              )}
            </dd>
          </>
        )}

        {sidecar ? (
          <>
            <dt className="inline-flex items-center">
              Sidecar
              <HelpTip
                ariaLabel="What is the .zwm sidecar?"
                content={
                  <div>
                    A small companion file written next to a marked image, holding the raw RFC 3161 timestamp responses plus the exact image digest they attest to. Kept separate because responses are ~1.5 KB each — too big for the in-image fragile frame.
                  </div>
                }
              />
            </dt>
            <dd>
              <div className="flex items-center gap-2 flex-wrap">
                <FileCheck2
                  size={14}
                  className={
                    sidecar.digestMatches
                      ? "text-[color:var(--zw-success)]"
                      : "text-[color:var(--zw-warning)]"
                  }
                />
                <span className="font-mono text-xs break-all">
                  {sidecar.sidecarPath}
                </span>
                <Badge variant={sidecar.digestMatches ? "success" : "warning"}>
                  {sidecar.digestMatches ? "Digest matches" : "Digest mismatch"}
                </Badge>
              </div>
              {!sidecar.digestMatches && (
                <div className="zw-small mt-1">
                  The image on disk does not match the digest the timestamps
                  attest to. The image may have been re-encoded after the
                  sidecar was written, or the sidecar belongs to a different
                  file.
                </div>
              )}
            </dd>

            <dt className="inline-flex items-center">
              Timestamps
              <HelpTip
                ariaLabel="What are RFC 3161 timestamps?"
                content={
                  <div>
                    Each row is an RFC 3161 timestamp response from an independent Time Stamp Authority. Each attests that the image digest existed by the time shown. Multiple authorities defeat any single one being compromised or backdated.
                  </div>
                }
              />
            </dt>
            <dd>
              {rfc.length === 0 ? (
                <em className="text-[color:var(--zw-text-3)]">
                  No RFC 3161 tokens recorded.
                </em>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {rfc.map((t, i) => (
                    <li key={`${t.tsaUrl}-${i}`} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {t.verified ? (
                          <Anchor
                            size={14}
                            className="text-[color:var(--zw-success)]"
                          />
                        ) : (
                          <AlertTriangle
                            size={14}
                            className="text-[color:var(--zw-warning)]"
                          />
                        )}
                        <span className="font-mono text-xs break-all">
                          {t.tsaUrl}
                        </span>
                        <Badge variant={t.verified ? "success" : "warning"}>
                          {t.verified ? "Verified" : "Unverified"}
                        </Badge>
                      </div>
                      {t.verified && t.genTimeIso && (
                        <div className="inline-flex items-center gap-1.5 zw-small tabular-nums pl-6">
                          <Clock size={12} aria-hidden />
                          <span>{formatTimestamp(t.genTimeIso)}</span>
                          <span className="font-mono text-[color:var(--zw-text-3)]">
                            · {t.genTimeIso}
                          </span>
                        </div>
                      )}
                      {!t.verified && t.error && (
                        <div className="zw-small pl-6 text-[color:var(--zw-text-3)]">
                          {t.error}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {anyTsaVerified && sidecar.digestMatches && (
                <div className="zw-small mt-2">
                  {verifiedTsaCount === 1
                    ? "One authority attests to this image's existence at the time above."
                    : `${verifiedTsaCount} independent authorities attest to this image's existence at the times above.`}
                </div>
              )}
            </dd>

            {ots.length > 0 && (
              <>
                <dt className="inline-flex items-center">
                  OpenTimestamps
                  <HelpTip
                    ariaLabel="What is OpenTimestamps?"
                    content={
                      <div className="flex flex-col gap-1.5">
                        <div>Each proof was submitted to an OTS calendar which periodically commits its aggregate hash into a Bitcoin block header. Once committed, no operator can rewrite the timestamp without rewriting Bitcoin's proof-of-work chain.</div>
                        <div>Fresh proofs show "Pending upgrade" for the first ~24h until the next Bitcoin block includes the calendar's commitment.</div>
                        <div>The raw <code>.ots</code> bytes are archived so you can also verify externally with the <code>ots verify</code> CLI or your own Bitcoin node.</div>
                      </div>
                    }
                  />
                </dt>
                <dd>
                  <ul className="flex flex-col gap-2">
                    {ots.map((o, i) => {
                      const state = o.error
                        ? "error"
                        : o.verified
                        ? "verified"
                        : o.pendingUpgrade
                        ? "pending"
                        : "warning";
                      return (
                        <li
                          key={`${o.calendarUrl}-${i}`}
                          className="flex flex-col gap-1"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            {state === "verified" ? (
                              <Anchor
                                size={14}
                                className="text-[color:var(--zw-success)]"
                              />
                            ) : state === "pending" ? (
                              <Clock
                                size={14}
                                className="text-[color:var(--zw-text-2)]"
                              />
                            ) : (
                              <AlertTriangle
                                size={14}
                                className="text-[color:var(--zw-warning)]"
                              />
                            )}
                            <span className="font-mono text-xs break-all">
                              {o.calendarUrl}
                            </span>
                            <Badge
                              variant={
                                state === "verified"
                                  ? "success"
                                  : state === "pending"
                                  ? "neutral"
                                  : "warning"
                              }
                            >
                              {state === "verified"
                                ? "Bitcoin-anchored"
                                : state === "pending"
                                ? "Pending upgrade"
                                : state === "error"
                                ? "Error"
                                : "Unverified"}
                            </Badge>
                          </div>
                          {o.attestations.map((a, j) => (
                            <div
                              key={j}
                              className="inline-flex items-center gap-1.5 zw-small tabular-nums pl-6 flex-wrap"
                            >
                              {a.verified ? (
                                <>
                                  <Clock size={12} aria-hidden />
                                  <span>
                                    {a.chain} block #{a.height.toLocaleString()}
                                  </span>
                                  {a.blockTimeIso && (
                                    <>
                                      <span>·</span>
                                      <span>{formatTimestamp(a.blockTimeIso)}</span>
                                      <span className="font-mono text-[color:var(--zw-text-3)]">
                                        {a.blockTimeIso}
                                      </span>
                                    </>
                                  )}
                                </>
                              ) : (
                                <>
                                  <AlertTriangle size={12} aria-hidden />
                                  <span>
                                    {a.chain} block #{a.height.toLocaleString()}
                                  </span>
                                  {a.error && (
                                    <span className="text-[color:var(--zw-text-3)]">
                                      · {a.error}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                          {state === "pending" && (
                            <div className="zw-small pl-6 text-[color:var(--zw-text-3)]">
                              Proof will be upgraded once the calendar's next
                              Bitcoin commitment lands (~24h from submission).
                              Re-run verify later to complete the chain.
                            </div>
                          )}
                          {o.error && (
                            <div className="zw-small pl-6 text-[color:var(--zw-text-3)]">
                              {o.error}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {anyOtsVerified && (
                    <div className="zw-small mt-2">
                      {verifiedOtsCount === 1
                        ? "One OpenTimestamps proof is anchored in a Bitcoin block."
                        : `${verifiedOtsCount} OpenTimestamps proofs are anchored in Bitcoin blocks.`}
                    </div>
                  )}
                  {!anyOtsVerified && pendingOtsCount > 0 && (
                    <div className="zw-small mt-2 text-[color:var(--zw-text-3)]">
                      {pendingOtsCount === 1
                        ? "1 proof pending Bitcoin upgrade."
                        : `${pendingOtsCount} proofs pending Bitcoin upgrade.`}
                    </div>
                  )}
                </dd>
              </>
            )}
          </>
        ) : (
          <>
            <dt>Sidecar</dt>
            <dd>
              <em className="text-[color:var(--zw-text-3)]">
                No <code>.zwm</code> sidecar found next to this image.
              </em>
              <div className="zw-small mt-1">
                Signature is still verifiable via the embedded public key, but
                nothing anchors it in time — an attacker could re-mark and
                backdate.
              </div>
            </dd>
          </>
        )}
      </dl>
    </Card>
  );
}

function shortKey(hex: string): string {
  if (hex.length <= 20) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  } catch {
    return iso;
  }
}

function marginHintFor(r: VerifyResult): string {
  if (!r.found) {
    return "No watermark tiles decoded. If the source really was marked, it has been re-processed too heavily to recover.";
  }
  const pct = Math.round(r.confidence * 100);
  if (r.signatureOk) {
    if (pct >= 75) return `Fresh — ${pct}% of redundant tiles decoded. Image is untouched or lightly compressed.`;
    if (pct >= 40) return `Healthy — ${pct}% of redundant tiles decoded. Signature is still authoritative.`;
    return `Thin — only ${pct}% of tiles decoded, but the signature is cryptographically valid, so the image is authentic. Heavy compression or resizing.`;
  }
  return `${pct}% of tiles decoded, but no key in your ring matches the signature.`;
}

function statusFor(r: VerifyResult | null) {
  if (!r) {
    return {
      icon: <ShieldOff size={24} className="text-[color:var(--zw-text-3)]" />,
      title: "No result",
      description: "Drop an image to begin.",
      card: "default" as const,
    };
  }
  if (r.found && r.signatureOk) {
    return {
      icon: <ShieldCheck size={24} className="text-[color:var(--zw-success)]" />,
      title: "Verified",
      description: "Watermark decoded, signature valid.",
      card: "success" as const,
    };
  }
  if (r.found) {
    return {
      icon: <ShieldAlert size={24} className="text-[color:var(--zw-warning)]" />,
      title: "Watermark found",
      description: "Payload decoded, but signature could not be verified.",
      card: "warning" as const,
    };
  }
  return {
    icon: <ShieldOff size={24} className="text-[color:var(--zw-error)]" />,
    title: "No watermark",
    description: "No recoverable payload in this image.",
    card: "error" as const,
  };
}
