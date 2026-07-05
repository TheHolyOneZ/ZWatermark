

use aes_gcm::{aead::Aead, aead::KeyInit, Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use rand::RngCore;
use zeroize::Zeroize;

pub const MAGIC: &[u8; 4] = b"ZWK1";
pub const VERSION: u8 = 0x01;


const KDF_MEMORY_KIB: u32 = 64 * 1024;
const KDF_ITERATIONS: u32 = 3;
const KDF_PARALLELISM: u32 = 1;

const HEADER_LEN: usize = 4 + 1 + 4 + 4 + 4 + 16 + 12;
const CIPHERTEXT_LEN: usize = 32 + 16;

#[derive(Debug, thiserror::Error)]
pub enum EnvelopeError {
    #[error("bad envelope magic")]
    BadMagic,
    #[error("unsupported envelope version: {0}")]
    BadVersion(u8),
    #[error("envelope truncated")]
    Truncated,
    #[error("argon2 kdf failed")]
    Kdf,
    #[error("aes-gcm authentication failed (wrong passphrase or corrupt data)")]
    BadAuth,
}


pub fn seal_seed(seed: &[u8; 32], passphrase: &str) -> Result<Vec<u8>, EnvelopeError> {
    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut salt);
    rand::rngs::OsRng.fill_bytes(&mut nonce);

    let mut key = derive_key(passphrase.as_bytes(), &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| EnvelopeError::Kdf)?;
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), seed.as_ref())
        .map_err(|_| EnvelopeError::BadAuth)?;
    key.zeroize();

    let mut out = Vec::with_capacity(HEADER_LEN + ct.len());
    out.extend_from_slice(MAGIC);
    out.push(VERSION);
    out.extend_from_slice(&KDF_MEMORY_KIB.to_le_bytes());
    out.extend_from_slice(&KDF_ITERATIONS.to_le_bytes());
    out.extend_from_slice(&KDF_PARALLELISM.to_le_bytes());
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Ok(out)
}


pub fn open_seed(envelope: &[u8], passphrase: &str) -> Result<[u8; 32], EnvelopeError> {
    if envelope.len() < HEADER_LEN + CIPHERTEXT_LEN {
        return Err(EnvelopeError::Truncated);
    }
    if &envelope[..4] != MAGIC {
        return Err(EnvelopeError::BadMagic);
    }
    if envelope[4] != VERSION {
        return Err(EnvelopeError::BadVersion(envelope[4]));
    }
    let m = u32::from_le_bytes(envelope[5..9].try_into().unwrap());
    let t = u32::from_le_bytes(envelope[9..13].try_into().unwrap());
    let p = u32::from_le_bytes(envelope[13..17].try_into().unwrap());
    let salt = &envelope[17..33];
    let nonce = &envelope[33..45];
    let ct = &envelope[45..];

    let params = Params::new(m, t, p, Some(32)).map_err(|_| EnvelopeError::Kdf)?;
    let mut key = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|_| EnvelopeError::Kdf)?;

    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| EnvelopeError::Kdf)?;
    let pt = cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|_| EnvelopeError::BadAuth)?;
    key.zeroize();

    if pt.len() != 32 {
        return Err(EnvelopeError::Truncated);
    }
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&pt);
    Ok(seed)
}

fn derive_key(pass: &[u8], salt: &[u8]) -> Result<[u8; 32], EnvelopeError> {
    let params = Params::new(KDF_MEMORY_KIB, KDF_ITERATIONS, KDF_PARALLELISM, Some(32))
        .map_err(|_| EnvelopeError::Kdf)?;
    let mut key = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(pass, salt, &mut key)
        .map_err(|_| EnvelopeError::Kdf)?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_roundtrip() {
        let seed = [42u8; 32];
        let env = seal_seed(&seed, "correct horse battery staple").unwrap();
        let back = open_seed(&env, "correct horse battery staple").unwrap();
        assert_eq!(seed, back);
    }

    #[test]
    fn wrong_passphrase_fails() {
        let seed = [0xab; 32];
        let env = seal_seed(&seed, "right").unwrap();
        assert!(matches!(open_seed(&env, "wrong"), Err(EnvelopeError::BadAuth)));
    }

    #[test]
    fn tamper_detected() {
        let seed = [0x77; 32];
        let mut env = seal_seed(&seed, "pw").unwrap();
        let last = env.len() - 1;
        env[last] ^= 0x01;
        assert!(matches!(open_seed(&env, "pw"), Err(EnvelopeError::BadAuth)));
    }
}
