

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::timestamp::TimestampBundle;


pub const MAGIC: [u8; 4] = *b"ZWMS";

pub const VERSION: u16 = 1;

#[derive(Debug, thiserror::Error)]
pub enum SidecarError {
    #[error("i/o: {0}")]
    Io(#[from] std::io::Error),
    #[error("bad magic (not a ZWatermark sidecar)")]
    BadMagic,
    #[error("unsupported sidecar version {0} (this build supports {}) ", VERSION)]
    UnsupportedVersion(u16),
    #[error("bincode: {0}")]
    Bincode(#[from] bincode::Error),
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarV1 {

    pub image_digest_sha256: [u8; 32],


    pub pubkey: [u8; 32],

    pub created_epoch_s: u64,

    #[serde(default)]
    pub timestamps: TimestampBundle,
}


pub fn image_digest_from_bytes(bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().into()
}

pub fn image_digest_from_path(path: &Path) -> Result<[u8; 32], SidecarError> {
    let mut f = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().into())
}


pub fn sidecar_path_for(image_path: &Path) -> PathBuf {
    let mut s = image_path.as_os_str().to_owned();
    s.push(".zwm");
    PathBuf::from(s)
}

pub fn write_sidecar(image_path: &Path, sidecar: &SidecarV1) -> Result<PathBuf, SidecarError> {
    let out = sidecar_path_for(image_path);
    let payload = bincode::serialize(sidecar)?;

    let mut buf = Vec::with_capacity(payload.len() + 6);
    buf.extend_from_slice(&MAGIC);
    buf.extend_from_slice(&VERSION.to_le_bytes());
    buf.extend_from_slice(&payload);

    fs::write(&out, &buf)?;
    Ok(out)
}

pub fn read_sidecar(path: &Path) -> Result<SidecarV1, SidecarError> {
    let bytes = fs::read(path)?;
    if bytes.len() < 6 {
        return Err(SidecarError::BadMagic);
    }
    if bytes[..4] != MAGIC {
        return Err(SidecarError::BadMagic);
    }
    let ver = u16::from_le_bytes([bytes[4], bytes[5]]);
    if ver != VERSION {
        return Err(SidecarError::UnsupportedVersion(ver));
    }
    let payload: SidecarV1 = bincode::deserialize(&bytes[6..])?;
    Ok(payload)
}


pub fn read_sidecar_next_to(image_path: &Path) -> Result<Option<SidecarV1>, SidecarError> {
    let p = sidecar_path_for(image_path);
    if !p.exists() {
        return Ok(None);
    }
    Some(read_sidecar(&p)).transpose()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::timestamp::{Rfc3161Token, TimestampBundle};
    use tempfile::tempdir;

    #[test]
    fn roundtrip() {
        let dir = tempdir().unwrap();
        let image = dir.path().join("foo.png");
        std::fs::write(&image, b"not really a png but ok").unwrap();

        let sidecar = SidecarV1 {
            image_digest_sha256: image_digest_from_path(&image).unwrap(),
            pubkey: [7u8; 32],
            created_epoch_s: 1_783_209_600,
            timestamps: TimestampBundle {
                rfc3161_tokens: vec![Rfc3161Token {
                    tsa_url: "https://tsa.example/".into(),
                    response_der: vec![0x30, 0x03, 0x02, 0x01, 0x00],
                    obtained_epoch_s: 1_783_209_601,
                }],
                ots_receipts: vec![],
            },
        };
        let path = write_sidecar(&image, &sidecar).unwrap();
        assert!(path.ends_with("foo.png.zwm"));

        let back = read_sidecar(&path).unwrap();
        assert_eq!(back.pubkey, sidecar.pubkey);
        assert_eq!(back.timestamps.rfc3161_tokens.len(), 1);
    }

    #[test]
    fn rejects_bad_magic() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("bad.zwm");
        std::fs::write(&p, b"NOTZWM\x01\x00").unwrap();
        assert!(matches!(read_sidecar(&p), Err(SidecarError::BadMagic)));
    }
}
