

use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand};
use serde::Serialize;
use std::path::{Path, PathBuf};
use zwatermark_core::{
    device::{device_id_bits_from_uuid, Device, DeviceKind},
    identity::{device_id_from_machine_id, KeyRing, PublicIdentity},
    payload::{Strength, CURRENT_VERSION},
    store::{
        default_devices_path, default_identity_path, default_keyring_path, DeviceStore,
        IdentityStore, StoredIdentity,
    },
    Identity, RobustPayload, VerificationResult,
};

#[derive(Parser)]
#[command(name = "zwatermark", version, about = "Invisible screenshot watermarking")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {

    Mark {
        r#in: PathBuf,
        #[arg(long)]
        out: Option<PathBuf>,


        #[arg(long)]
        identity: Option<String>,


        #[arg(long)]
        device: Option<String>,

        #[arg(long, default_value = "both")]
        strength: StrengthArg,

        #[arg(long)]
        json: bool,
    },

    Verify {
        r#in: PathBuf,

        #[arg(long)]
        key_ring: Option<PathBuf>,

        #[arg(long)]
        json: bool,
    },

    Id {
        #[command(subcommand)]
        action: IdAction,
    },

    Batch {
        #[command(subcommand)]
        action: BatchAction,
    },

    Device {
        #[command(subcommand)]
        action: DeviceAction,
    },
}

#[derive(Subcommand)]
enum DeviceAction {

    Create {
        name: String,

        #[arg(long, default_value = "workstation")]
        kind: String,
    },

    List {
        #[arg(long)]
        json: bool,
    },

    Delete { id: String },
}

#[derive(clap::ValueEnum, Clone, Copy, Debug)]
enum StrengthArg {
    Robust,
    Fragile,
    Both,
}

impl From<StrengthArg> for Strength {
    fn from(s: StrengthArg) -> Self {
        match s {
            StrengthArg::Robust => Strength::ROBUST,
            StrengthArg::Fragile => Strength::FRAGILE,
            StrengthArg::Both => Strength::BOTH,
        }
    }
}

#[derive(Subcommand)]
enum IdAction {

    Create {
        display_name: String,
        #[arg(long)]
        email: Option<String>,
    },

    List {
        #[arg(long)]
        json: bool,
    },

    Show { id: String },

    Export {
        id: String,
        #[arg(long)]
        out: PathBuf,
    },

    Import { path: PathBuf },

    Delete { id: String },
}

#[derive(Subcommand)]
enum BatchAction {

    Verify {
        folder: PathBuf,
        #[arg(long)]
        report: PathBuf,
        #[arg(long)]
        key_ring: Option<PathBuf>,
    },

    Mark {
        folder: PathBuf,
        #[arg(long)]
        identity: String,

        #[arg(long)]
        device: Option<String>,
        #[arg(long, default_value = "both")]
        strength: StrengthArg,
    },
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .try_init()
        .ok();

    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Mark { r#in, out, identity, device, strength, json } => {
            cmd_mark(&r#in, out.as_deref(), identity.as_deref(), device.as_deref(), strength.into(), json)
        }
        Cmd::Verify { r#in, key_ring, json } => {
            cmd_verify(&r#in, key_ring.as_deref(), json)
        }
        Cmd::Id { action } => cmd_id(action),
        Cmd::Batch { action } => cmd_batch(action),
        Cmd::Device { action } => cmd_device(action),
    }
}


fn cmd_mark(
    input: &Path,
    output: Option<&Path>,
    id_selector: Option<&str>,
    device_selector: Option<&str>,
    strength: Strength,
    json: bool,
) -> Result<()> {
    let store_path = default_identity_path()?;
    let store = IdentityStore::load(&store_path)
        .with_context(|| format!("loading identity store {}", store_path.display()))?;
    if store.identities.is_empty() {
        return Err(anyhow!(
            "no identities in store — run `zwatermark id create <name>` first"
        ));
    }

    let stored = pick_identity(&store, id_selector)?;
    let identity = stored
        .to_identity()
        .context("failed to load identity")?;

    let device_store = DeviceStore::load(&default_devices_path()?).unwrap_or_default();
    let picked_device = resolve_device(&device_store, device_selector, stored.default_device_id);
    let (device_bits, device_name) = match &picked_device {
        Some(d) => (d.device_id_bits(), Some(d.name.clone())),
        None => (device_id_from_machine_id(&machine_id()), None),
    };

    let img = image::open(input).with_context(|| format!("reading {}", input.display()))?;

    let payload = RobustPayload {
        version: CURRENT_VERSION,
        user_id: identity.user_id(),
        device_id: device_bits,
        epoch_min: zwatermark_core::current_epoch_min(),
        counter: 0,
    };

    let marked = zwatermark_core::mark(&img, &payload, &identity, strength, device_name.as_deref(), None)
        .context("watermark embed failed")?;

    let out_path = output.map(PathBuf::from).unwrap_or_else(|| input.to_path_buf());
    save_image(&marked, &out_path)
        .with_context(|| format!("writing {}", out_path.display()))?;

    if json {
        let report = MarkReport {
            input: input.display().to_string(),
            output: out_path.display().to_string(),
            identity: stored.id.to_string(),
            display_name: stored.display_name.clone(),
            user_id_hex: hex::encode(identity.user_id()),
            epoch_min: payload.epoch_min,
        };
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!(
            "  \x1b[32m✓\x1b[0m marked {} → {}",
            input.display(),
            out_path.display()
        );
        println!("    identity  {} ({})", stored.display_name, stored.id);
        println!("    user_id   {}", hex::encode(identity.user_id()));
        println!("    strength  {}", strength_label(strength));
    }
    Ok(())
}


fn cmd_verify(input: &Path, key_ring_path: Option<&Path>, json: bool) -> Result<()> {
    let ring = load_keyring_with_fallback(key_ring_path)?;
    let img = image::open(input).with_context(|| format!("reading {}", input.display()))?;

    let result = zwatermark_core::verify(&img, &ring).context("verify failed")?;

    if json {
        let report = VerifyReport::from_result(input, &result);
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    print_verify_human(input, &result);
    Ok(())
}

fn print_verify_human(input: &Path, r: &VerificationResult) {
    let icon = if r.signature_ok {
        "\x1b[32m✓ verified\x1b[0m"
    } else if r.robust.is_some() {
        "\x1b[33m~ watermark found (unsigned or unknown signer)\x1b[0m"
    } else if r.confidence > 0.25 {
        "\x1b[33m~ partial watermark residue\x1b[0m"
    } else {
        "\x1b[31m✗ no watermark\x1b[0m"
    };
    println!("  {}  {}", icon, input.display());
    if let Some(p) = &r.robust {
        println!("    version   {}", p.version);
        println!("    user_id   {}", hex::encode(p.user_id));
        println!("    device_id {}", hex::encode(p.device_id));
        println!("    epoch_min {} ({})", p.epoch_min, format_epoch_min(p.epoch_min));
        println!("    counter   {}", p.counter);
    }
    if let Some(o) = &r.originator {
        let attrib = if r.identity_verified {
            ", signature ok"
        } else if r.signature_ok {
            ", signature mismatch"
        } else {
            ", claimed via fingerprint — signature not verifiable"
        };
        println!(
            "    signer    {} ({}{})",
            o.display_name,
            o.email.as_deref().unwrap_or("no-email"),
            attrib
        );
    }
    println!("    confidence {}", confidence_bar(r.confidence));
}

fn confidence_bar(c: f32) -> String {
    let n = (c.clamp(0.0, 1.0) * 20.0).round() as usize;
    let filled = "█".repeat(n);
    let empty = "░".repeat(20 - n);
    format!("[{}{}] {:.0}%", filled, empty, c * 100.0)
}


fn cmd_id(action: IdAction) -> Result<()> {
    match action {
        IdAction::Create { display_name, email } => {
            let store_path = default_identity_path()?;
            let mut store = IdentityStore::load(&store_path)?;

            let new_id = Identity::generate(&display_name, email.as_deref());
            let stored = StoredIdentity::from_identity(&new_id)?;
            let uuid = stored.id;
            store.insert(stored);
            store.save(&store_path)?;

            println!("\x1b[32m✓\x1b[0m created identity {}", uuid);
            println!("    stored at {}", store_path.display());
            Ok(())
        }
        IdAction::List { json } => {
            let store_path = default_identity_path()?;
            let store = IdentityStore::load(&store_path)?;
            if json {
                let items: Vec<_> = store
                    .identities
                    .iter()
                    .map(|i| IdentitySummary {
                        id: i.id.to_string(),
                        display_name: i.display_name.clone(),
                        email: i.email.clone(),
                        verifying_key: i.verifying_key_hex.clone(),
                        created_epoch_s: i.created_epoch_s,
                    })
                    .collect();
                println!("{}", serde_json::to_string_pretty(&items)?);
                return Ok(());
            }
            if store.identities.is_empty() {
                println!("(no identities — try `zwatermark id create <name>`)");
                return Ok(());
            }
            for i in &store.identities {
                println!(
                    "  {}  {} <{}>",
                    &i.id.to_string()[..8],
                    i.display_name,
                    i.email.as_deref().unwrap_or("no-email")
                );
                println!("    pubkey {}", &i.verifying_key_hex[..16]);
            }
            Ok(())
        }
        IdAction::Show { id } => {
            let store = IdentityStore::load(&default_identity_path()?)?;
            let stored = store
                .find_by_prefix(&id)
                .ok_or_else(|| anyhow!("no identity matches '{}'", id))?;
            println!("{}", serde_json::to_string_pretty(&stored.to_public()?)?);
            Ok(())
        }
        IdAction::Export { id, out } => {
            let store = IdentityStore::load(&default_identity_path()?)?;
            let stored = store
                .find_by_prefix(&id)
                .ok_or_else(|| anyhow!("no identity matches '{}'", id))?;
            let json = serde_json::to_vec_pretty(stored)?;
            std::fs::write(&out, json)?;
            println!("\x1b[32m✓\x1b[0m exported {} to {}", stored.id, out.display());
            Ok(())
        }
        IdAction::Import { path } => {
            let bytes = std::fs::read(&path)
                .with_context(|| format!("reading {}", path.display()))?;
            let stored: StoredIdentity = serde_json::from_slice(&bytes)?;
            let store_path = default_identity_path()?;
            let mut store = IdentityStore::load(&store_path)?;
            store.insert(stored.clone());
            store.save(&store_path)?;
            println!("\x1b[32m✓\x1b[0m imported {} ({})", stored.display_name, stored.id);
            Ok(())
        }
        IdAction::Delete { id } => {
            let store_path = default_identity_path()?;
            let mut store = IdentityStore::load(&store_path)?;
            let target = store
                .find_by_prefix(&id)
                .ok_or_else(|| anyhow!("no identity matches '{}'", id))?
                .id;
            if store.remove(&target) {
                store.save(&store_path)?;
                println!("\x1b[32m✓\x1b[0m deleted {}", target);
            }
            Ok(())
        }
    }
}


fn cmd_batch(action: BatchAction) -> Result<()> {
    match action {
        BatchAction::Verify { folder, report, key_ring } => {
            let ring = load_keyring_with_fallback(key_ring.as_deref())?;
            let files = list_images(&folder);
            let pb = indicatif::ProgressBar::new(files.len() as u64);
            pb.set_style(
                indicatif::ProgressStyle::with_template(
                    "  {spinner} [{bar:32.green}] {pos}/{len}  {wide_msg}",
                )
                .unwrap()
                .progress_chars("█░ "),
            );

            let mut writer = csv::Writer::from_path(&report)
                .with_context(|| format!("opening {}", report.display()))?;
            writer.write_record([
                "file",
                "status",
                "confidence",
                "signature_ok",
                "user_id",
                "signer",
                "epoch_min",
            ])?;

            for path in files {
                pb.set_message(path.file_name().unwrap_or_default().to_string_lossy().to_string());
                let status = match image::open(&path) {
                    Ok(img) => zwatermark_core::verify(&img, &ring).ok(),
                    Err(_) => None,
                };
                let (state, conf, sig, uid, signer, epoch) = match status {
                    Some(r) => (
                        classify(&r),
                        r.confidence,
                        r.signature_ok,
                        r.robust.map(|p| hex::encode(p.user_id)).unwrap_or_default(),
                        r.originator.map(|o| o.display_name).unwrap_or_default(),
                        r.robust.map(|p| p.epoch_min).unwrap_or_default(),
                    ),
                    None => ("read_error", 0.0, false, String::new(), String::new(), 0),
                };
                writer.write_record([
                    path.display().to_string().as_str(),
                    state,
                    &format!("{:.3}", conf),
                    &sig.to_string(),
                    &uid,
                    &signer,
                    &epoch.to_string(),
                ])?;
                pb.inc(1);
            }
            writer.flush()?;
            pb.finish_with_message(format!("wrote {}", report.display()));
            Ok(())
        }
        BatchAction::Mark { folder, identity, device, strength } => {
            let store = IdentityStore::load(&default_identity_path()?)?;
            let stored = store
                .find_by_prefix(&identity)
                .ok_or_else(|| anyhow!("no identity matches '{}'", identity))?
                .clone();
            let id = stored.to_identity().context("failed to load identity")?;
            let device_store = DeviceStore::load(&default_devices_path()?).unwrap_or_default();
            let picked_device = resolve_device(&device_store, device.as_deref(), stored.default_device_id);
            let device_name = picked_device.as_ref().map(|d| d.name.clone());
            let files = list_images(&folder);
            let pb = indicatif::ProgressBar::new(files.len() as u64);
            pb.set_style(
                indicatif::ProgressStyle::with_template(
                    "  {spinner} [{bar:32.green}] {pos}/{len}  {wide_msg}",
                )
                .unwrap()
                .progress_chars("█░ "),
            );

            let device_id = picked_device
                .as_ref()
                .map(|d| d.device_id_bits())
                .unwrap_or_else(|| device_id_from_machine_id(&machine_id()));
            let epoch_min = zwatermark_core::current_epoch_min();
            let mut counter: u16 = 0;
            let strength: Strength = strength.into();
            let mut failed = 0usize;

            for path in files {
                pb.set_message(path.file_name().unwrap_or_default().to_string_lossy().to_string());
                let img = match image::open(&path) {
                    Ok(i) => i,
                    Err(_) => {
                        failed += 1;
                        pb.inc(1);
                        continue;
                    }
                };
                let payload = RobustPayload {
                    version: CURRENT_VERSION,
                    user_id: id.user_id(),
                    device_id,
                    epoch_min,
                    counter,
                };
                counter = counter.wrapping_add(1) % 4096;
                match zwatermark_core::mark(&img, &payload, &id, strength, device_name.as_deref(), None) {
                    Ok(marked) => {
                        if save_image(&marked, &path).is_err() {
                            failed += 1;
                        }
                    }
                    Err(_) => failed += 1,
                }
                pb.inc(1);
            }
            pb.finish_with_message(if failed == 0 {
                format!("all marked ({})", stored.display_name)
            } else {
                format!("{} failed", failed)
            });
            Ok(())
        }
    }
}


fn classify(r: &VerificationResult) -> &'static str {
    if r.signature_ok {
        "verified"
    } else if r.robust.is_some() {
        "unsigned"
    } else if r.confidence > 0.25 {
        "partial"
    } else {
        "no_watermark"
    }
}

fn cmd_device(action: DeviceAction) -> Result<()> {
    match action {
        DeviceAction::Create { name, kind } => {
            let path = default_devices_path()?;
            let mut store = DeviceStore::load(&path)?;
            let kind = parse_device_kind(&kind);
            let device = Device::new(&name, kind, None, Default::default());
            let uuid = device.id;
            let bits = device.device_id_bits();
            store.insert(device);
            store.save(&path)?;
            println!("\x1b[32m✓\x1b[0m created device {}", uuid);
            println!("    stored at    {}", path.display());
            println!("    device bits  {}", hex::encode(bits));
            Ok(())
        }
        DeviceAction::List { json } => {
            let store = DeviceStore::load(&default_devices_path()?)?;
            if json {
                #[derive(Serialize)]
                struct Row {
                    id: String,
                    name: String,
                    kind: String,
                    device_id_hex: String,
                }
                let rows: Vec<_> = store
                    .devices
                    .iter()
                    .map(|d| Row {
                        id: d.id.to_string(),
                        name: d.name.clone(),
                        kind: format!("{:?}", d.kind).to_lowercase(),
                        device_id_hex: hex::encode(d.device_id_bits()),
                    })
                    .collect();
                println!("{}", serde_json::to_string_pretty(&rows)?);
            } else {
                if store.devices.is_empty() {
                    println!("(no devices yet — run `zwatermark device create <name>`)");
                } else {
                    for d in &store.devices {
                        println!(
                            "  {}  {:<20}  {:?}  bits={}",
                            d.id,
                            d.name,
                            d.kind,
                            hex::encode(d.device_id_bits())
                        );
                    }
                }
            }
            Ok(())
        }
        DeviceAction::Delete { id } => {
            let path = default_devices_path()?;
            let mut store = DeviceStore::load(&path)?;
            let uuid = store
                .devices
                .iter()
                .find(|d| d.id.to_string().starts_with(&id.to_ascii_lowercase()))
                .map(|d| d.id)
                .ok_or_else(|| anyhow!("no device matches '{}'", id))?;
            store.remove(&uuid);
            store.save(&path)?;
            println!("\x1b[32m✓\x1b[0m removed device {}", uuid);
            Ok(())
        }
    }
}

fn parse_device_kind(s: &str) -> DeviceKind {
    match s.to_ascii_lowercase().as_str() {
        "laptop" => DeviceKind::Laptop,
        "camera" => DeviceKind::Camera,
        "phone" => DeviceKind::Phone,
        "server" => DeviceKind::Server,
        "custom" => DeviceKind::Custom,
        _ => DeviceKind::Workstation,
    }
}

fn resolve_device<'a>(
    store: &'a DeviceStore,
    explicit: Option<&str>,
    fallback: Option<uuid::Uuid>,
) -> Option<&'a Device> {
    if let Some(sel) = explicit {
        let sel = sel.to_ascii_lowercase();
        return store
            .devices
            .iter()
            .find(|d| d.id.to_string().starts_with(&sel));
    }
    let id = fallback?;
    store.devices.iter().find(|d| d.id == id)
}


#[allow(dead_code)]
fn _unused_device_id_bits(id: uuid::Uuid) -> [u8; 2] {
    device_id_bits_from_uuid(id)
}

fn pick_identity<'a>(
    store: &'a IdentityStore,
    selector: Option<&str>,
) -> Result<&'a StoredIdentity> {
    match selector {
        Some(sel) => store
            .find_by_prefix(sel)
            .ok_or_else(|| anyhow!("no identity matches '{}'", sel)),
        None => store
            .identities
            .first()
            .ok_or_else(|| anyhow!("no identities in store")),
    }
}

fn save_image(img: &image::DynamicImage, path: &Path) -> Result<()> {
    img.save(path).map_err(Into::into)
}

fn load_keyring_with_fallback(explicit: Option<&Path>) -> Result<KeyRing> {
    let path = match explicit {
        Some(p) => p.to_path_buf(),
        None => default_keyring_path()?,
    };


    let store = IdentityStore::load(&default_identity_path()?)?;
    let mut ring = KeyRing::new();
    for stored in &store.identities {
        if let Ok(pub_id) = stored.to_public() {
            ring.insert(pub_id);
        }
    }
    if !path.exists() {
        return Ok(ring);
    }
    let bytes = std::fs::read(&path)?;
    let extra: Vec<PublicIdentity> = serde_json::from_slice(&bytes)
        .with_context(|| format!("parsing key ring {}", path.display()))?;
    for e in extra {
        ring.insert(e);
    }
    Ok(ring)
}

fn strength_label(s: Strength) -> &'static str {
    if s == Strength::BOTH {
        "robust + fragile"
    } else if s == Strength::ROBUST {
        "robust only"
    } else if s == Strength::FRAGILE {
        "fragile only"
    } else {
        "none"
    }
}

fn format_epoch_min(m: u32) -> String {
    let secs = m as u64 * 60;
    let d = std::time::UNIX_EPOCH + std::time::Duration::from_secs(secs);
    match d.duration_since(std::time::UNIX_EPOCH) {
        Ok(dt) => {
            let s = dt.as_secs();
            format!("epoch+{}s", s)
        }
        Err(_) => "?".into(),
    }
}


fn machine_id() -> String {
    #[cfg(target_os = "linux")]
    if let Ok(s) = std::fs::read_to_string("/etc/machine-id") {
        return s.trim().to_string();
    }
    hostname()
}

fn hostname() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown".into())
}

fn list_images(root: &Path) -> Vec<PathBuf> {
    walkdir::WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| {
            let p = e.into_path();
            let ext = p.extension()?.to_string_lossy().to_ascii_lowercase();
            matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "bmp").then_some(p)
        })
        .collect()
}


#[derive(Serialize)]
struct MarkReport {
    input: String,
    output: String,
    identity: String,
    display_name: String,
    user_id_hex: String,
    epoch_min: u32,
}

#[derive(Serialize)]
struct IdentitySummary {
    id: String,
    display_name: String,
    email: Option<String>,
    verifying_key: String,
    created_epoch_s: u64,
}

#[derive(Serialize)]
struct VerifyReport {
    file: String,
    status: &'static str,
    confidence: f32,
    signature_ok: bool,
    identity_verified: bool,
    user_id_hex: Option<String>,
    device_id_hex: Option<String>,
    epoch_min: Option<u32>,
    counter: Option<u16>,
    signer: Option<String>,
    signer_email: Option<String>,
}

impl VerifyReport {
    fn from_result(input: &Path, r: &VerificationResult) -> Self {
        Self {
            file: input.display().to_string(),
            status: classify(r),
            confidence: r.confidence,
            signature_ok: r.signature_ok,
            identity_verified: r.identity_verified,
            user_id_hex: r.robust.as_ref().map(|p| hex::encode(p.user_id)),
            device_id_hex: r.robust.as_ref().map(|p| hex::encode(p.device_id)),
            epoch_min: r.robust.as_ref().map(|p| p.epoch_min),
            counter: r.robust.as_ref().map(|p| p.counter),
            signer: r.originator.as_ref().map(|o| o.display_name.clone()),
            signer_email: r.originator.as_ref().and_then(|o| o.email.clone()),
        }
    }
}
