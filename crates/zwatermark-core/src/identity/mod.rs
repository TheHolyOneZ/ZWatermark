

use ed25519_dalek::{SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::sign;


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Identity {
    pub id: uuid::Uuid,
    pub display_name: String,
    pub email: Option<String>,
    #[serde(skip)]
    pub signing_key: Option<SigningKey>,

    pub verifying_key: [u8; 32],
    pub created_epoch_s: u64,
}

impl Identity {
    pub fn generate(display_name: &str, email: Option<&str>) -> Self {
        let sk = sign::generate_keypair();
        let vk = sk.verifying_key().to_bytes();
        Self {
            id: uuid::Uuid::new_v4(),
            display_name: display_name.to_string(),
            email: email.map(|s| s.to_string()),
            signing_key: Some(sk),
            verifying_key: vk,
            created_epoch_s: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        }
    }


    pub fn user_id(&self) -> [u8; 5] {
        user_id_from_pubkey(&self.verifying_key)
    }

    pub fn export_public(&self) -> PublicIdentity {
        PublicIdentity {
            id: self.id,
            display_name: self.display_name.clone(),
            email: self.email.clone(),
            verifying_key: self.verifying_key,
        }
    }
}

pub fn user_id_from_pubkey(pk: &[u8; 32]) -> [u8; 5] {
    let hash = blake3::hash(pk);
    let mut out = [0u8; 5];
    out.copy_from_slice(&hash.as_bytes()[..5]);
    out
}

pub fn device_id_from_machine_id(mid: &str) -> [u8; 2] {
    let hash = blake3::hash(mid.as_bytes());
    let mut out = [0u8; 2];
    out.copy_from_slice(&hash.as_bytes()[..2]);
    out
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicIdentity {
    pub id: uuid::Uuid,
    pub display_name: String,
    pub email: Option<String>,
    pub verifying_key: [u8; 32],
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct KeyRing {
    pub entries: HashMap<[u8; 5], PublicIdentity>,
}

impl KeyRing {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&mut self, identity: PublicIdentity) {
        let prefix = user_id_from_pubkey(&identity.verifying_key);
        self.entries.insert(prefix, identity);
    }

    pub fn lookup(&self, user_id_prefix: &[u8; 5]) -> Option<&PublicIdentity> {
        self.entries.get(user_id_prefix)
    }


    pub fn lookup_by_pubkey(&self, pubkey: &[u8; 32]) -> Option<&PublicIdentity> {
        let prefix = user_id_from_pubkey(pubkey);
        self.entries.get(&prefix).filter(|p| &p.verifying_key == pubkey)
    }

    pub fn verifying_key(&self, user_id_prefix: &[u8; 5]) -> Option<VerifyingKey> {
        self.lookup(user_id_prefix)
            .and_then(|p| VerifyingKey::from_bytes(&p.verifying_key).ok())
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_user_id_stable() {
        let id = Identity::generate("Test", None);
        let u = id.user_id();
        assert_eq!(u, user_id_from_pubkey(&id.verifying_key));
    }

    #[test]
    fn keyring_roundtrip() {
        let id = Identity::generate("Test", Some("test@example.com"));
        let mut ring = KeyRing::new();
        ring.insert(id.export_public());
        assert_eq!(ring.len(), 1);
        assert!(ring.lookup(&id.user_id()).is_some());
    }
}
