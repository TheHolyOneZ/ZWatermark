

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};


pub fn sign(signing_key: &SigningKey, payload: &[u8]) -> Signature {
    signing_key.sign(payload)
}


pub fn verify(verifying_key: &VerifyingKey, payload: &[u8], sig: &Signature) -> bool {
    verifying_key.verify(payload, sig).is_ok()
}


pub fn generate_keypair() -> SigningKey {
    let mut rng = rand::rngs::OsRng;
    SigningKey::generate(&mut rng)
}


pub fn signing_key_to_bytes(k: &SigningKey) -> [u8; 32] {
    k.to_bytes()
}


pub fn signing_key_from_bytes(b: &[u8; 32]) -> SigningKey {
    SigningKey::from_bytes(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_sign_verify() {
        let sk = generate_keypair();
        let vk = sk.verifying_key();
        let msg = b"ZWatermark test payload";
        let sig = sign(&sk, msg);
        assert!(verify(&vk, msg, &sig));
        assert!(!verify(&vk, b"tampered", &sig));
    }

    #[test]
    fn keypair_serde_roundtrip() {
        let sk = generate_keypair();
        let bytes = signing_key_to_bytes(&sk);
        let sk2 = signing_key_from_bytes(&bytes);
        assert_eq!(sk.to_bytes(), sk2.to_bytes());
    }
}
