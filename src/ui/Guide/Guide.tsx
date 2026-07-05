import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  KeyRound,
  MonitorSmartphone,
  Wand2,
  ShieldCheck,
  Boxes,
  Anchor,
  ShieldAlert,
  Info,
  Sparkles,
} from "lucide-react";
import { Panel } from "../lib/Panel";
import { Section } from "../lib/Section";
import { Card } from "../lib/Card";
import { Badge } from "../lib/Badge";

type SectionId =
  | "overview"
  | "identity"
  | "devices"
  | "mark"
  | "strengths"
  | "verify"
  | "timestamps"
  | "batch"
  | "defense"
  | "compare";

const NAV: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <Info size={14} /> },
  { id: "identity", label: "Identity", icon: <KeyRound size={14} /> },
  { id: "devices", label: "Devices", icon: <MonitorSmartphone size={14} /> },
  { id: "mark", label: "Mark", icon: <Wand2 size={14} /> },
  { id: "strengths", label: "Strengths", icon: <Sparkles size={14} /> },
  { id: "verify", label: "Verify", icon: <ShieldCheck size={14} /> },
  { id: "timestamps", label: "Timestamps", icon: <Anchor size={14} /> },
  { id: "batch", label: "Batch", icon: <Boxes size={14} /> },
  { id: "defense", label: "Defending against theft", icon: <ShieldAlert size={14} /> },
  { id: "compare", label: "How this compares", icon: <BookOpen size={14} /> },
];

function ChapterTitle({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="zw-guide-chapter-title">
      <span className="zw-guide-chapter-icon" aria-hidden>{icon}</span>
      <span className="text-[color:var(--zw-text-3)] font-mono text-[11px] tracking-wider">
        {String(n).padStart(2, "0")}
      </span>
      <span>{children}</span>
    </span>
  );
}

export function Guide() {
  const [active, setActive] = useState<SectionId>("overview");
  const refs = useRef<Record<string, HTMLElement | null>>({});


  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = e.target.getAttribute("data-guide-id");
            if (id) setActive(id as SectionId);
          }
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );
    for (const el of Object.values(refs.current)) {
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);

  const jump = useCallback((id: SectionId) => {
    refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const setRef = (id: SectionId) => (el: HTMLElement | null) => {
    refs.current[id] = el;
  };

  return (
    <Panel
      title="Guide"
      subtitle="How every piece of ZWatermark works, what the strength modes actually do, and how to keep someone from stealing attribution for your work."
    >
      <div className="flex gap-6">
        <aside className="hidden lg:block w-56 shrink-0">
          <nav className="sticky top-4 flex flex-col gap-1" aria-label="Guide sections">
            {NAV.map((n, i) => (
              <button
                key={n.id}
                onClick={() => jump(n.id)}
                data-active={active === n.id}
                className="zw-guide-nav-btn"
                aria-current={active === n.id ? "true" : undefined}
              >
                <span className="zw-guide-nav-num" aria-hidden>{i + 1}</span>
                {n.icon}
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col gap-8">
          <section ref={setRef("overview")} data-guide-id="overview">
            <div className="zw-guide-hero mb-3">
              <span className="zw-guide-hero-chip"><BookOpen size={12} /> 10-chapter read</span>
              <span className="zw-guide-hero-chip"><KeyRound size={12} /> Ed25519 signatures</span>
              <span className="zw-guide-hero-chip"><Sparkles size={12} /> DWT + LSB embedding</span>
              <span className="zw-guide-hero-chip"><Anchor size={12} /> RFC 3161 + OpenTimestamps</span>
              <span className="zw-guide-hero-chip"><ShieldAlert size={12} /> Anti-theft strategy</span>
            </div>
            <Section
              title={<ChapterTitle n={1} icon={<BookOpen size={16} />}>What ZWatermark does</ChapterTitle>}
              description="The short version."
            >
              <Card>
                <div className="flex flex-col gap-3 text-sm leading-relaxed">
                  <p>
                    ZWatermark writes an invisible, cryptographically-signed
                    label into your images and lets anyone check it later. The
                    label proves two things:
                  </p>
                  <ul className="list-disc pl-6 flex flex-col gap-1">
                    <li>
                      <strong>Who signed it</strong> — the mark carries the
                      full Ed25519 public key of the signer.
                    </li>
                    <li>
                      <strong>When it existed</strong> — optional external
                      timestamps anchor the file's hash to independent time
                      sources (Time Stamp Authorities and Bitcoin).
                    </li>
                  </ul>
                  <p>
                    Everything runs locally. The only network calls are the
                    timestamp requests you explicitly enable.
                  </p>
                  <div className="pt-2 border-t border-[color:var(--zw-border-hair)]">
                    <p className="zw-small">
                      <strong>The stack in one line:</strong>{" "}
                      <a href="https://datatracker.ietf.org/doc/html/rfc8032" target="_blank" rel="noreferrer">Ed25519</a>
                      {" "}for signatures,{" "}
                      <a href="https://github.com/BLAKE3-team/BLAKE3" target="_blank" rel="noreferrer">BLAKE3</a>
                      {" "}for hashing, DWT spread-spectrum for the robust layer,
                      pixel LSB for the fragile layer,{" "}
                      <a href="https://datatracker.ietf.org/doc/html/rfc3161" target="_blank" rel="noreferrer">RFC 3161</a>
                      {" "}+{" "}
                      <a href="https://opentimestamps.org/" target="_blank" rel="noreferrer">OpenTimestamps</a>
                      {" "}for external time anchoring.
                    </p>
                  </div>
                </div>
              </Card>
            </Section>
          </section>

          <section ref={setRef("identity")} data-guide-id="identity">
            <Section
              title={<ChapterTitle n={2} icon={<KeyRound size={16} />}>Identity</ChapterTitle>}
              description="The signing key that binds your name to every mark."
            >
              <Card>
                <div className="flex flex-col gap-3 text-sm leading-relaxed">
                  <p>
                    An identity is an Ed25519 keypair with a display name and
                    optional email. The private key stays on your machine (in
                    the vault if you enabled it). The public key is what
                    verifiers use to confirm signatures.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="neutral">private key: local only</Badge>
                    <Badge variant="neutral">public key: 32 bytes, embedded</Badge>
                    <Badge variant="neutral">signature: 64 bytes</Badge>
                    <Badge variant="neutral">multiple identities: allowed</Badge>
                  </div>
                  <p className="zw-small">
                    <strong>Why Ed25519?</strong> Standardized in{" "}
                    <a href="https://datatracker.ietf.org/doc/html/rfc8032" target="_blank" rel="noreferrer">RFC 8032</a>
                    {" "}(2017), ~128-bit security, deterministic nonces (no
                    catastrophic-RNG class of bug that broke ECDSA on the PS3),
                    tiny keys and signatures compared to RSA. Same primitive
                    used by OpenSSH default keys, Signal, Tor v3 onion services,
                    WireGuard, and GitHub SSH.
                  </p>
                  <p>
                    You can create as many identities as you like — one per
                    project, one per persona. Only the <em>active</em>
                    {" "}identity signs the next mark.
                  </p>
                  <p className="zw-small">
                    <strong>Export &amp; Import</strong> let you move an
                    identity between machines or hand a collaborator your
                    public identity so they can verify your work by name
                    instead of just fingerprint.
                  </p>
                </div>
              </Card>
            </Section>
          </section>

          <section ref={setRef("devices")} data-guide-id="devices">
            <Section
              title={<ChapterTitle n={3} icon={<MonitorSmartphone size={16} />}>Devices</ChapterTitle>}
              description="Which machine, camera, or pipeline produced the file."
            >
              <Card>
                <div className="flex flex-col gap-3 text-sm leading-relaxed">
                  <p>
                    Devices are optional labels stamped into the mark alongside
                    your identity: a workstation, laptop, camera, phone, or
                    custom pipeline. Verifiers see this label to distinguish
                    "signed by Alice on her studio Mac" from "signed by Alice
                    on her phone in the field."
                  </p>
                  <p>
                    Each identity can have a <strong>default device</strong>{" "}
                    that pre-fills the Mark and Batch tabs. You can override it
                    per-mark from the picker.
                  </p>
                  <p className="zw-small">
                    Devices don't add trust — anyone can claim any device
                    label. They're metadata. The trust root is always the
                    identity's key.
                  </p>
                </div>
              </Card>
            </Section>
          </section>

          <section ref={setRef("mark")} data-guide-id="mark">
            <Section
              title={<ChapterTitle n={4} icon={<Wand2 size={16} />}>Mark</ChapterTitle>}
              description="How a screenshot or image becomes a signed, verifiable file."
            >
              <Card>
                <div className="flex flex-col gap-3 text-sm leading-relaxed">
                  <p>Marking an image runs these steps:</p>
                  <ol className="list-decimal pl-6 flex flex-col gap-1.5">
                    <li>
                      Load the image and pick the active identity + device.
                    </li>
                    <li>
                      Encode a <strong>robust</strong> payload (identity
                      fingerprint, device fingerprint, timestamp, counter) into
                      the image's frequency signal so it survives moderate
                      compression and resizing.
                    </li>
                    <li>
                      Encode a <strong>fragile</strong> payload (full public
                      key, exact timestamp, optional screen serial, and an
                      Ed25519 signature over the image hash) into pixel-level
                      bits. Any edit breaks it — that's the point.
                    </li>
                    <li>
                      Optionally overlay a visible watermark (badge, logo, or
                      text) if you want a human-readable mark too.
                    </li>
                    <li>
                      Optionally request external timestamps and write a{" "}
                      <code>.zwm</code> sidecar with the proof bundle.
                    </li>
                    <li>Save as <code>name.zw.png</code>.</li>
                  </ol>
                  <p className="zw-small">
                    The signature covers the entire image and the fragile
                    payload. So if anyone changes a single pixel, the fragile
                    check fails — telling verifiers the file was edited after
                    signing.
                  </p>
                  <div className="pt-2 border-t border-[color:var(--zw-border-hair)]">
                    <p className="zw-small">
                      <strong>Under the hood.</strong> The image hash used for
                      signing is{" "}
                      <a href="https://github.com/BLAKE3-team/BLAKE3" target="_blank" rel="noreferrer">BLAKE3</a>
                      {" "}(2020) — a Merkle-tree hash roughly 6–10× faster than
                      SHA-256 on modern hardware, so signing large screenshots
                      stays snappy. Pixel-LSB embedding stores 1 bit per colour
                      channel per pixel — plenty of capacity for a 64-byte
                      signature, but it's destroyed by any lossy re-encode
                      (that's the tamper-evidence property, not a bug).
                    </p>
                  </div>
                </div>
              </Card>
            </Section>
          </section>

          <section ref={setRef("strengths")} data-guide-id="strengths">
            <Section
              title={<ChapterTitle n={5} icon={<Sparkles size={16} />}>Strength modes</ChapterTitle>}
              description="Robust vs fragile vs both vs max — pick based on what the image will go through."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card title={<span className="inline-flex items-center gap-2"><Badge variant="neutral">Robust</Badge></span>}>
                  <div className="flex flex-col gap-2 text-sm leading-relaxed">
                    <p>
                      Hidden in the DWT frequency signal. <strong>Survives
                      recompression, mild resize, and re-saving.</strong> Only
                      carries the compact identity+device+timestamp fingerprint
                      (128 bits).
                    </p>
                    <p className="zw-small">
                      Use when: the image will be re-encoded on the way to
                      the viewer (social media, chat platforms, screenshots
                      of screenshots).
                    </p>
                  </div>
                </Card>
                <Card title={<span className="inline-flex items-center gap-2"><Badge variant="neutral">Fragile</Badge></span>}>
                  <div className="flex flex-col gap-2 text-sm leading-relaxed">
                    <p>
                      Cryptographic signature stored in the pixel bits.{" "}
                      <strong>Breaks on any edit</strong> — proving the file
                      is byte-exact what was signed.
                    </p>
                    <p className="zw-small">
                      Use when: tamper-evidence matters more than survival
                      through re-encoding. Forensics, chain-of-custody, legal
                      evidence.
                    </p>
                  </div>
                </Card>
                <Card title={<span className="inline-flex items-center gap-2"><Badge variant="success">Both</Badge> <span className="zw-small">recommended</span></span>}>
                  <div className="flex flex-col gap-2 text-sm leading-relaxed">
                    <p>
                      Applies both layers. Robust survives compression;
                      fragile proves the current copy is byte-exact.
                    </p>
                    <p className="zw-small">
                      Use when: default. Covers both threat models.
                    </p>
                  </div>
                </Card>
                <Card title={<span className="inline-flex items-center gap-2"><Badge variant="warning">Max</Badge></span>}>
                  <div className="flex flex-col gap-2 text-sm leading-relaxed">
                    <p>
                      Same coverage as Both, but with a stronger embedding
                      that pushes the DWT coefficients harder — more resilient
                      to attacks that shave the frequency signal.
                    </p>
                    <p className="zw-small">
                      Use when: expecting adversarial re-encoding, cropping,
                      or noise. Tradeoff: very slightly larger visual impact
                      at high zoom.
                    </p>
                  </div>
                </Card>
              </div>
              <Card>
                <div className="flex flex-col gap-2 text-sm leading-relaxed">
                  <p className="zw-small">
                    <strong>Why the frequency domain?</strong> Watermarking has
                    a well-known trilemma between robustness, imperceptibility,
                    and capacity — you can't max all three. Spatial-domain marks
                    (LSB) win capacity and lose robustness. Frequency-domain
                    marks in the Discrete Wavelet Transform (DWT) win robustness
                    because their coefficients survive JPEG recompression and
                    resizing.
                  </p>
                  <p className="zw-small">
                    ZWatermark embeds the robust layer in the <strong>HL2 and
                    LH2</strong> mid-frequency sub-bands of a 2-level DWT — the
                    same sweet spot the classic Cox/Kilian/Leighton/Shamoon{" "}
                    <a href="https://doi.org/10.1109/83.650120" target="_blank" rel="noreferrer">spread-spectrum watermarking paper</a>
                    {" "}(1997) identified: high enough frequency to be
                    invisible to the human eye, low enough to survive
                    aggressive re-encoding. The signal is spread pseudo-randomly
                    across many coefficients, so removing it without visible
                    damage is infeasible.
                  </p>
                </div>
              </Card>
            </Section>
          </section>

          <section ref={setRef("verify")} data-guide-id="verify">
            <Section
              title={<ChapterTitle n={6} icon={<ShieldCheck size={16} />}>Verify</ChapterTitle>}
              description="How reading a marked image tells you who signed it and whether it's been touched."
            >
              <Card>
                <div className="flex flex-col gap-3 text-sm leading-relaxed">
                  <p>Verifying an image runs the mark process in reverse:</p>
                  <ol className="list-decimal pl-6 flex flex-col gap-1.5">
                    <li>
                      Extract the robust payload from the DWT frequency
                      signal (may partially succeed even after compression).
                    </li>
                    <li>
                      Extract the fragile payload from the pixel bits and
                      check its Ed25519 signature against the embedded
                      public key.
                    </li>
                    <li>
                      Look up the embedded pubkey in your local keyring — if
                      found, show the signer's name; if not, show the
                      fingerprint.
                    </li>
                    <li>
                      Check the sibling <code>.zwm</code> sidecar (if
                      present) and verify each RFC 3161 and OpenTimestamps
                      proof.
                    </li>
                  </ol>
                  <p>
                    The <strong>Provenance evidence</strong> card in Verify
                    shows the verdict layer by layer: signature ok, who
                    signed, and when the file demonstrably existed by.
                  </p>
                  <p className="zw-small">
                    <strong>Even without a keyring entry</strong> for the
                    signer, verify still confirms the signature is valid for
                    the embedded pubkey. That means: "this file was signed
                    by <em>whoever holds this key</em>, and it hasn't been
                    edited since." Attaching that key to a real-world name
                    still needs an out-of-band link (their website, a
                    registry, a prior key exchange).
                  </p>
                </div>
              </Card>
            </Section>
          </section>

          <section ref={setRef("timestamps")} data-guide-id="timestamps">
            <Section
              title={<ChapterTitle n={7} icon={<Anchor size={16} />}>Timestamps</ChapterTitle>}
              description="External anchors that prove a file existed by a certain time."
            >
              <Card>
                <div className="flex flex-col gap-3 text-sm leading-relaxed">
                  <p>
                    When you toggle "Request timestamps" on, the app POSTs
                    the marked file's SHA-256 hash to two kinds of external
                    services:
                  </p>
                  <ul className="list-disc pl-6 flex flex-col gap-1.5">
                    <li>
                      <strong>RFC 3161 Time Stamp Authorities</strong>{" "}
                      (FreeTSA, DigiCert by default) — each signs a
                      cryptographic token binding your hash to a
                      TSA-certified timestamp. Verified by checking the
                      TSA's certificate chain.
                    </li>
                    <li>
                      <strong>OpenTimestamps calendars</strong> (Alice, Bob,
                      Finney by default) — commit your hash to a merkle
                      tree that gets published in a Bitcoin block. Later
                      verifiers walk the OTS proof and confirm the tree
                      root against a real Bitcoin block header.
                    </li>
                  </ul>
                  <p>
                    The proofs are archived in a{" "}
                    <code>image.png.zwm</code> sidecar next to your marked
                    image. Distribute the sidecar with the image and any
                    verifier can check the timestamps offline (RFC 3161)
                    plus with a Bitcoin block-header lookup (OTS).
                  </p>
                  <div className="pt-2 border-t border-[color:var(--zw-border-hair)]">
                    <p className="zw-small">
                      <strong>What's inside a <code>.zwm</code> file.</strong>{" "}
                      A small binary bundle (bincode-serialized) containing:
                    </p>
                    <ul className="list-disc pl-4 flex flex-col gap-0.5 zw-small mt-1">
                      <li><strong>SHA-256 of the marked PNG</strong> — the exact bytes the timestamps anchor to.</li>
                      <li><strong>Your public key</strong> (32 bytes, Ed25519) — same one embedded in the image.</li>
                      <li><strong>Creation timestamp</strong> (Unix seconds) — <em>local</em> clock, unsigned; only the external proofs below matter for trust.</li>
                      <li><strong>RFC 3161 tokens</strong> — one raw DER blob per TSA that responded.</li>
                      <li><strong>OpenTimestamps receipts</strong> — one <code>.ots</code>-format proof per calendar.</li>
                    </ul>
                    <p className="zw-small mt-2">
                      The file is renameable but must live next to the image
                      as <code>&lt;image-name&gt;.zwm</code> for Verify to
                      auto-detect it. Losing the sidecar doesn't invalidate
                      the image itself — the pixel-embedded mark still
                      verifies — but you lose the priority-in-time proof.
                    </p>
                  </div>
                  <div className="zw-alert zw-alert--info">
                    <Info size={14} aria-hidden />
                    <div className="zw-small">
                      OpenTimestamps proofs are <em>pending</em> for ~24h
                      after submission, until the Bitcoin block confirms.
                      That's normal. Re-verifying later upgrades the proof.
                    </div>
                  </div>
                  <div className="pt-2 border-t border-[color:var(--zw-border-hair)]">
                    <p className="zw-small">
                      <strong>Where these standards come from.</strong>{" "}
                      <a href="https://datatracker.ietf.org/doc/html/rfc3161" target="_blank" rel="noreferrer">RFC 3161</a>
                      {" "}has been the industry Time-Stamp Protocol since 2001.
                      It's what backs Microsoft Authenticode code signing,
                      Adobe PDF long-term validation (PAdES), and EU eIDAS
                      qualified timestamps. A TSA token is a small signed CMS
                      structure containing your hash + the TSA's certified
                      time.
                    </p>
                    <p className="zw-small mt-1">
                      <a href="https://opentimestamps.org/" target="_blank" rel="noreferrer">OpenTimestamps</a>
                      {" "}was created by Peter Todd in 2016. Calendar servers
                      aggregate submitted hashes into a Merkle tree and commit
                      the tree root to a Bitcoin{" "}
                      <code>OP_RETURN</code> transaction — so proofs are
                      permanent and verifiable using nothing but a Bitcoin
                      block-header chain, with no trusted third party. An
                      "upgraded" proof contains the full Merkle path to a
                      specific block header; a "pending" proof only has the
                      calendar's promise until the next Bitcoin block includes
                      the batch.
                    </p>
                  </div>
                </div>
              </Card>
            </Section>
          </section>

          <section ref={setRef("batch")} data-guide-id="batch">
            <Section
              title={<ChapterTitle n={8} icon={<Boxes size={16} />}>Batch</ChapterTitle>}
              description="Same operations, applied to a whole folder."
            >
              <Card>
                <div className="flex flex-col gap-3 text-sm leading-relaxed">
                  <p>
                    Batch runs Verify or Mark across every image in a
                    folder (non-recursive). Everything you can do in the
                    single-file tabs — identity, device, strength, overlay,
                    timestamps — applies to the whole batch.
                  </p>
                  <p>
                    Verify writes a CSV report you can export. Mark writes{" "}
                    <code>name.zw.png</code> next to each original and (if
                    timestamps are on) a <code>.zwm</code> sidecar per
                    file.
                  </p>
                  <p className="zw-small">
                    Runs happen in the background — you can leave the tab
                    while a job continues. Progress is shown at the bottom
                    of the Batch panel.
                  </p>
                </div>
              </Card>
            </Section>
          </section>

          <section ref={setRef("defense")} data-guide-id="defense">
            <Section
              title={<ChapterTitle n={9} icon={<ShieldAlert size={16} />}>Defending against identity theft</ChapterTitle>}
              description="Someone can strip your mark and re-mark with their own key. Here's how to make sure they lose."
            >
              <Card variant="warning">
                <div className="flex flex-col gap-3 text-sm leading-relaxed">
                  <p>
                    <strong>The attack.</strong> An adversary takes your
                    marked image, aggressively re-encodes it to destroy the
                    fragile signature and damage the robust layer, then
                    marks the result with <em>their own</em> key. Verifiers
                    who look at the attacker's version see it "signed by
                    them." Cryptography alone cannot stop this — you can
                    always sign your own copy of a file.
                  </p>
                  <p>
                    <strong>The defense.</strong> Prove you signed
                    <em> first</em>, publicly, in a way nobody can rewrite:
                  </p>
                  <ol className="list-decimal pl-6 flex flex-col gap-2">
                    <li>
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        <strong className="text-[color:var(--zw-error)]">Publish your identity before your work.</strong>
                        <Badge variant="error">Not yet available</Badge>
                      </span>
                      <div className="mt-1">
                        <em>Planned</em> — the identity registry (Identity tab → Publish) will let you anchor
                        "key P belongs to Alice" independent of any single image. The button exists in the
                        Identity tab today, but the registry backend is <strong>not yet deployed</strong>, so
                        the call fails. Until it lands, publish your key fingerprint out-of-band (your own
                        website, bio, GitHub profile, Nostr pubkey field) — same trust model, manual mirror.
                      </div>
                    </li>
                    <li>
                      <strong>Always mark with timestamps ON.</strong> The
                      external timestamp is what makes your priority claim
                      real. Without it, both "signed by Alice at time T"
                      and "signed by Eve at time T+1" are just claims. With
                      it, TSAs and Bitcoin agree yours came first.
                    </li>
                    <li>
                      <strong>Publish immediately, somewhere public.</strong>
                      {" "}
                      Post the marked image (and if you can, the{" "}
                      <code>.zwm</code> sidecar) to a place with its own
                      timestamps: your own website, Nostr, a socials
                      feed, Mastodon, IPFS. Now your provenance lives in
                      multiple independent public logs.
                    </li>
                    <li>
                      <strong>Ship the sidecar alongside every copy.</strong>
                      {" "}
                      Distribute <code>image.png</code> and{" "}
                      <code>image.png.zwm</code> together. Verifiers who
                      only receive the image alone lose the timestamp
                      proofs — which is exactly what the attacker wants.
                    </li>
                    <li>
                      <strong>Use <em>Both</em> or <em>Max</em> strength
                      for anything you'll distribute widely.</strong> The
                      more aggressively an attacker has to strip your mark,
                      the more visibly damaged their forged version becomes
                      — which is evidence of tampering.
                    </li>
                  </ol>
                  <div className="pt-2 border-t border-[color:var(--zw-border-hair)]">
                    <p className="text-sm">
                      <strong>The courtroom story you're building.</strong>
                    </p>
                    <p className="zw-small mt-1">
                      "Here is my key, registered on 2026-06-01. Here is my
                      image, signed with that key and timestamped by three
                      independent TSAs and the Bitcoin blockchain on
                      2026-07-04 at 14:22 UTC. Here is the alleged thief's
                      version, signed by a different key with timestamps
                      dated 2026-07-05. Their claim of priority is
                      arithmetically impossible."
                    </p>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex flex-col gap-2 text-sm leading-relaxed">
                  <p>
                    <strong>What ZWatermark cannot do.</strong> No embedded
                    mark survives a determined actor who regenerates the
                    image from scratch (e.g., a passable AI copy). That's
                    why the defense is <em>time-based</em>: even if they
                    can produce a plausible-looking forgery, they can't
                    backdate its existence past your timestamps.
                  </p>
                </div>
              </Card>
            </Section>
          </section>

          <section ref={setRef("compare")} data-guide-id="compare">
            <Section
              title={<ChapterTitle n={10} icon={<BookOpen size={16} />}>How this compares to other systems</ChapterTitle>}
              description="Where ZWatermark sits in the wider provenance / watermarking landscape."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="zw-guide-compare-card" data-accent="c2pa" title={<span className="inline-flex items-center gap-2"><Badge variant="neutral">C2PA / Content Credentials</Badge></span>}>
                  <div className="flex flex-col gap-2 text-sm leading-relaxed">
                    <p>
                      Open standard from Adobe, Microsoft, BBC, Intel and
                      others (founded 2021). Attaches a cryptographically
                      signed manifest as a <em>metadata sidecar/box</em> next
                      to the image bytes — not embedded in the pixels.
                    </p>
                    <p className="zw-small">
                      Trade-off: rich structured provenance, but the manifest
                      is stripped by anything that re-encodes without the
                      C2PA-aware library. Best when the whole distribution
                      chain supports it.
                    </p>
                    <p className="zw-small">
                      Spec:{" "}
                      <a href="https://c2pa.org/" target="_blank" rel="noreferrer">c2pa.org</a>.
                    </p>
                  </div>
                </Card>
                <Card className="zw-guide-compare-card" data-accent="iptc" title={<span className="inline-flex items-center gap-2"><Badge variant="neutral">IPTC / XMP metadata</Badge></span>}>
                  <div className="flex flex-col gap-2 text-sm leading-relaxed">
                    <p>
                      The industry-standard fields for creator, copyright,
                      caption, and location — carried in the file's XMP
                      header. Every stock-photo pipeline in the world
                      understands it.
                    </p>
                    <p className="zw-small">
                      Trade-off: purely metadata, trivially editable, and no
                      signature. Useful for cataloguing, not for proof.
                    </p>
                    <p className="zw-small">
                      Spec:{" "}
                      <a href="https://iptc.org/standards/photo-metadata/" target="_blank" rel="noreferrer">iptc.org</a>.
                    </p>
                  </div>
                </Card>
                <Card className="zw-guide-compare-card" data-accent="synthid" title={<span className="inline-flex items-center gap-2"><Badge variant="neutral">Google SynthID</Badge></span>}>
                  <div className="flex flex-col gap-2 text-sm leading-relaxed">
                    <p>
                      Invisible watermark embedded in the pixel domain by a
                      neural network (DeepMind, 2023). Designed to survive
                      crops, filters, and JPEG. Detection is also done by a
                      neural network — closed source.
                    </p>
                    <p className="zw-small">
                      Trade-off: strong pixel robustness, but you cannot
                      verify it yourself without Google's model, and there is
                      no cryptographic identity attached.
                    </p>
                    <p className="zw-small">
                      Docs:{" "}
                      <a href="https://deepmind.google/technologies/synthid/" target="_blank" rel="noreferrer">deepmind.google/technologies/synthid</a>.
                    </p>
                  </div>
                </Card>
                <Card className="zw-guide-compare-card" data-accent="zwatermark" title={<span className="inline-flex items-center gap-2"><Badge variant="success">ZWatermark</Badge></span>}>
                  <div className="flex flex-col gap-2 text-sm leading-relaxed">
                    <p>
                      Pixel-embedded (DWT robust + LSB fragile) + Ed25519
                      identity + optional independent time anchors (RFC 3161
                      TSAs and Bitcoin via OpenTimestamps). Open source,
                      offline verifiable.
                    </p>
                    <p className="zw-small">
                      Trade-off: identity attribution to a real name still
                      needs an out-of-band publication step (your website, a
                      registry). The mark survives without the sidecar; the
                      time proof does not.
                    </p>
                  </div>
                </Card>
              </div>

              <Card>
                <div className="flex flex-col gap-2 text-sm leading-relaxed">
                  <p className="zw-small">
                    Short version: <strong>C2PA</strong> is a signed metadata
                    envelope, <strong>IPTC</strong> is unsigned metadata,{" "}
                    <strong>SynthID</strong> is a closed-source pixel
                    watermark, and <strong>ZWatermark</strong> is an
                    open-source pixel watermark bound to a cryptographic
                    identity and an external time anchor. They can be layered
                    — you can, for example, publish a C2PA-signed image whose
                    pixels also carry a ZWatermark.
                  </p>
                </div>
              </Card>
            </Section>
          </section>
        </div>
      </div>
    </Panel>
  );
}
