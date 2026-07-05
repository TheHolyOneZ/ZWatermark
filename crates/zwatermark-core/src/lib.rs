

pub mod attack;
pub mod device;
pub mod dwt;
pub mod ecc;
pub mod embed;
pub mod envelope;
pub mod extract;
pub mod identity;
pub mod overlay;
pub mod payload;
pub mod sidecar;
pub mod sign;
pub mod spread;
pub mod stego;
pub mod store;
pub mod timestamp;
pub mod vault;

pub use identity::{user_id_from_pubkey, Identity, KeyRing, PublicIdentity};
pub use overlay::{Corner as OverlayCorner, OverlayMode, VisibleOverlay};
pub use payload::{FragilePayload, RobustPayload, Strength};

use image::DynamicImage;
use thiserror::Error;


pub const FRAGILE_BLOB_LEN: usize = 512;


const FRAGILE_SEED_CONTEXT: &str = "zwatermark.fragile.seed.v1";

#[derive(Debug, Error)]
pub enum Error {
    #[error("image too small for watermark ({0}x{1} — minimum 200x200)")]
    ImageTooSmall(u32, u32),
    #[error("no watermark detected")]
    NotFound,
    #[error("payload decode failed after error correction")]
    Undecodable,
    #[error("signature invalid")]
    BadSignature,
    #[error("identity has no signing key loaded (unlock first)")]
    LockedIdentity,
    #[error("i/o: {0}")]
    Io(#[from] std::io::Error),
    #[error("image codec: {0}")]
    Image(#[from] image::ImageError),
}

pub type Result<T> = std::result::Result<T, Error>;


#[derive(Debug, Clone)]
pub struct VerificationResult {

    pub robust: Option<RobustPayload>,

    pub fragile: Option<FragilePayload>,

    pub confidence: f32,


    pub signature_ok: bool,


    pub originator: Option<PublicIdentity>,


    pub identity_verified: bool,


    pub self_contained: Option<SelfContainedVerification>,
}


#[derive(Debug, Clone)]
pub struct SelfContainedVerification {
    pub pubkey: [u8; 32],
    pub signature_ok: bool,
    pub known_identity: Option<PublicIdentity>,
}


pub fn mark(
    image: &DynamicImage,
    payload: &RobustPayload,
    identity: &Identity,
    strength: Strength,
    device_name: Option<&str>,
    overlay: Option<&VisibleOverlay>,
) -> Result<DynamicImage> {
    let (w, h) = image::GenericImageView::dimensions(image);
    if w < 200 || h < 200 {
        return Err(Error::ImageTooSmall(w, h));
    }

    let mut out = image.clone();

    if let Some(cfg) = overlay {
        overlay::apply_overlay(&mut out, cfg);
    }

    if strength.contains(Strength::ROBUST) {
        let alpha = if strength.contains(Strength::BOOST) {
            spread::SS_ALPHA_MAX
        } else {
            spread::SS_ALPHA_DEFAULT
        };
        embed::embed_robust_with(&mut out, payload, alpha);
    }

    if strength.contains(Strength::FRAGILE) {
        let sk = identity.signing_key.as_ref().ok_or(Error::LockedIdentity)?;
        let now_ns = current_time_ns();
        let mut fragile = FragilePayload {
            pubkey: identity.verifying_key,
            timestamp_ns: now_ns,
            screen_serial: None,
            region: None,
            device_name: device_name.map(str::to_string),
            signature: [0u8; 64],
        };
        let sig = sign::sign(sk, &fragile.signable());
        fragile.signature = sig.to_bytes();

        let seed = fragile_seed_for(&identity.verifying_key);
        let mut blob = bincode::serialize(&fragile).unwrap_or_default();
        blob.resize(FRAGILE_BLOB_LEN, 0);
        stego::embed_fragile(&mut out, &blob, &seed);
    }

    Ok(out)
}


pub fn verify(image: &DynamicImage, key_ring: &KeyRing) -> Result<VerificationResult> {
    let robust = extract::extract_robust(image);
    let confidence = robust.confidence;
    let robust_payload = robust.payload;

    let mut fragile: Option<FragilePayload> = None;
    let mut signature_ok = false;
    let mut originator: Option<PublicIdentity> = None;
    let mut identity_verified = false;
    let mut self_contained: Option<SelfContainedVerification> = None;

    if let Some(rp) = robust_payload {


        if let Some(match_) = key_ring.lookup(&rp.user_id) {
            originator = Some(match_.clone());
        }


        let seed = fragile_seed_from_user_id(&rp.user_id);
        if let Some(blob) = stego::extract_fragile(image, FRAGILE_BLOB_LEN, &seed) {
            if let Ok(fp) = bincode::deserialize::<FragilePayload>(&blob) {
                let embedded_pubkey = fp.pubkey;


                let sc_signature_ok = ed25519_dalek::VerifyingKey::from_bytes(&embedded_pubkey)
                    .ok()
                    .map(|vk| {
                        let sig = ed25519_dalek::Signature::from_bytes(&fp.signature);
                        sign::verify(&vk, &fp.signable(), &sig)
                    })
                    .unwrap_or(false);


                let user_id_ok = user_id_from_pubkey(&embedded_pubkey) == rp.user_id;

                if sc_signature_ok && user_id_ok {
                    signature_ok = true;
                }

                let known = key_ring.lookup_by_pubkey(&embedded_pubkey).cloned();
                if signature_ok {


                    originator = known.clone();
                    identity_verified = true;
                }

                self_contained = Some(SelfContainedVerification {
                    pubkey: embedded_pubkey,
                    signature_ok: sc_signature_ok && user_id_ok,
                    known_identity: known,
                });
                fragile = Some(fp);
            }
        }
    }

    Ok(VerificationResult {
        robust: robust_payload,
        fragile,
        confidence,
        signature_ok,
        originator,
        identity_verified,
        self_contained,
    })
}


fn fragile_seed_for(pubkey: &[u8; 32]) -> [u8; 32] {
    fragile_seed_from_user_id(&user_id_from_pubkey(pubkey))
}


fn fragile_seed_from_user_id(user_id: &[u8; 5]) -> [u8; 32] {
    let mut hasher = blake3::Hasher::new_derive_key(FRAGILE_SEED_CONTEXT);
    hasher.update(user_id);
    let out = hasher.finalize();
    let mut seed = [0u8; 32];
    seed.copy_from_slice(out.as_bytes());
    seed
}

fn current_time_ns() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}


#[derive(Debug, Clone, Default)]
pub struct TimestampConfig {
    pub request_timestamps: bool,
    pub tsa_urls: Vec<String>,
    pub ots_calendar_urls: Vec<String>,
}


pub struct MarkOutput {
    pub image: DynamicImage,
    pub sidecar: Option<sidecar::SidecarV1>,

    pub timestamp_errors: Vec<(String, String)>,
}


pub fn mark_with_sidecar(
    image: &DynamicImage,
    payload: &RobustPayload,
    identity: &Identity,
    strength: Strength,
    device_name: Option<&str>,
    overlay: Option<&VisibleOverlay>,
    ts_config: &TimestampConfig,
) -> Result<MarkOutput> {
    let marked = mark(image, payload, identity, strength, device_name, overlay)?;

    if !ts_config.request_timestamps
        || (ts_config.tsa_urls.is_empty() && ts_config.ots_calendar_urls.is_empty())
    {
        return Ok(MarkOutput {
            image: marked,
            sidecar: None,
            timestamp_errors: Vec::new(),
        });
    }


    let mut png_bytes: Vec<u8> = Vec::new();
    marked
        .write_to(
            &mut std::io::Cursor::new(&mut png_bytes),
            image::ImageFormat::Png,
        )
        .map_err(Error::Image)?;
    let digest = sidecar::image_digest_from_bytes(&png_bytes);

    let mut tokens = Vec::new();
    let mut ots_receipts = Vec::new();
    let mut errors = Vec::new();
    for url in &ts_config.tsa_urls {
        match timestamp::request_rfc3161(url, &digest) {
            Ok(t) => tokens.push(t),
            Err(e) => errors.push((url.clone(), e.to_string())),
        }
    }
    for url in &ts_config.ots_calendar_urls {
        match timestamp::submit_ots(url, &digest) {
            Ok(r) => ots_receipts.push(r),
            Err(e) => errors.push((url.clone(), e.to_string())),
        }
    }

    let sidecar_v1 = sidecar::SidecarV1 {
        image_digest_sha256: digest,
        pubkey: identity.verifying_key,
        created_epoch_s: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        timestamps: timestamp::TimestampBundle {
            rfc3161_tokens: tokens,
            ots_receipts,
        },
    };

    Ok(MarkOutput {
        image: marked,
        sidecar: Some(sidecar_v1),
        timestamp_errors: errors,
    })
}


pub fn current_epoch_min() -> u32 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| (d.as_secs() / 60) as u32)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    fn synthetic(w: u32, h: u32) -> DynamicImage {
        let mut buf = ImageBuffer::new(w, h);
        for y in 0..h {
            for x in 0..w {
                let r = ((x * 5 + y * 3) % 256) as u8;
                let g = ((x * 11 + y * 7) % 256) as u8;
                let b = ((x * 17 + y * 13) % 256) as u8;
                buf.put_pixel(x, y, Rgba([r, g, b, 255]));
            }
        }
        DynamicImage::ImageRgba8(buf)
    }

    #[test]
    fn mark_verify_roundtrip() {
        let identity = Identity::generate("Test User", Some("t@example.com"));
        let mut ring = KeyRing::new();
        ring.insert(identity.export_public());

        let img = synthetic(1024, 768);
        let payload = RobustPayload {
            version: payload::CURRENT_VERSION,
            user_id: identity.user_id(),
            device_id: [0xDE, 0xAD],
            epoch_min: current_epoch_min(),
            counter: 1,
        };
        let marked = mark(&img, &payload, &identity, Strength::BOTH, Some("Test Rig"), None).unwrap();

        let result = verify(&marked, &ring).unwrap();
        assert_eq!(result.robust, Some(payload));
        assert!(result.fragile.is_some());
        assert!(result.signature_ok, "signature must verify");


        assert!(
            result.confidence >= 0.6,
            "confidence {}",
            result.confidence
        );
    }

    #[test]
    fn verify_unmarked_returns_empty() {
        let ring = KeyRing::new();
        let img = synthetic(1024, 768);
        let result = verify(&img, &ring).unwrap();
        assert_eq!(result.robust, None);
        assert!(result.confidence < 0.5);
    }
}
