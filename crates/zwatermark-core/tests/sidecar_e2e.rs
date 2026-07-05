use std::fs;
use tempfile::tempdir;
use zwatermark_core::sidecar::{
    self, image_digest_from_path, read_sidecar_next_to, sidecar_path_for, write_sidecar, SidecarV1,
};
use zwatermark_core::timestamp::{Rfc3161Token, TimestampBundle};

#[test]
fn sidecar_written_next_to_image_and_read_back() {
    let dir = tempdir().unwrap();
    let image_path = dir.path().join("sample.png");
    fs::write(&image_path, b"fake-png-bytes-for-hashing").unwrap();

    let sc = SidecarV1 {
        image_digest_sha256: image_digest_from_path(&image_path).unwrap(),
        pubkey: [0x42u8; 32],
        created_epoch_s: 1_783_209_600,
        timestamps: TimestampBundle {
            rfc3161_tokens: vec![Rfc3161Token {
                tsa_url: "https://freetsa.example/".into(),
                response_der: vec![0x30, 0x03, 0x02, 0x01, 0x00],
                obtained_epoch_s: 1_783_209_601,
            }],
            ots_receipts: vec![],
        },
    };

    let written = write_sidecar(&image_path, &sc).unwrap();
    assert_eq!(written, sidecar_path_for(&image_path));
    assert!(written.ends_with("sample.png.zwm"));
    assert!(written.exists());

    let round = read_sidecar_next_to(&image_path).unwrap().expect("sidecar found");
    assert_eq!(round.image_digest_sha256, sc.image_digest_sha256);
    assert_eq!(round.pubkey, sc.pubkey);
    assert_eq!(round.timestamps.rfc3161_tokens.len(), 1);
    assert_eq!(
        round.timestamps.rfc3161_tokens[0].tsa_url,
        "https://freetsa.example/"
    );
}

#[test]
fn verify_detects_digest_mismatch_when_image_modified_after_sidecar() {
    let dir = tempdir().unwrap();
    let image_path = dir.path().join("image.png");
    fs::write(&image_path, b"original-image-bytes").unwrap();

    let original_digest = image_digest_from_path(&image_path).unwrap();
    let sc = SidecarV1 {
        image_digest_sha256: original_digest,
        pubkey: [1u8; 32],
        created_epoch_s: 1_783_209_600,
        timestamps: TimestampBundle::default(),
    };
    write_sidecar(&image_path, &sc).unwrap();

    fs::write(&image_path, b"tampered-image-bytes-different-length").unwrap();
    let new_digest = image_digest_from_path(&image_path).unwrap();
    assert_ne!(original_digest, new_digest);

    let round = read_sidecar_next_to(&image_path).unwrap().expect("sidecar still readable");
    assert_eq!(round.image_digest_sha256, original_digest);
    assert_ne!(round.image_digest_sha256, new_digest);
}

#[test]
fn no_sidecar_returns_none() {
    let dir = tempdir().unwrap();
    let image_path = dir.path().join("bare.png");
    fs::write(&image_path, b"no sidecar next to me").unwrap();

    let result = read_sidecar_next_to(&image_path).unwrap();
    assert!(result.is_none(), "expected None when .zwm absent");
}

#[test]
fn sidecar_path_uses_full_extension_convention() {
    let p = std::path::PathBuf::from("/tmp/foo.zw.png");
    let sc_path = sidecar::sidecar_path_for(&p);
    assert_eq!(sc_path.to_string_lossy(), "/tmp/foo.zw.png.zwm");
}
