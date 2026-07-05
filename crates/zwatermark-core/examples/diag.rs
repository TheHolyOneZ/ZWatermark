use image::DynamicImage;
use zwatermark_core::payload::{RobustPayload, CURRENT_VERSION};
use zwatermark_core::{mark, verify, Identity, KeyRing, Strength};

fn run(path: &str) {
    let identity = Identity::generate("Diag", None);
    let mut ring = KeyRing::new();
    ring.insert(identity.export_public());

    let img: DynamicImage = image::open(path).unwrap();
    println!("== {}  {}x{}", path, img.width(), img.height());
    let payload = RobustPayload {
        version: CURRENT_VERSION,
        user_id: identity.user_id(),
        device_id: [0, 0],
        epoch_min: zwatermark_core::current_epoch_min(),
        counter: 0,
    };

    for (label, strength) in [("ROBUST", Strength::ROBUST), ("BOTH", Strength::BOTH)] {
        let marked = mark(&img, &payload, &identity, strength, None, None).unwrap();
        let r_mem = verify(&marked, &ring).unwrap();
        let tmp = std::env::temp_dir().join("zw_diag_run.png");
        marked.save(&tmp).unwrap();
        let reloaded = image::open(&tmp).unwrap();
        let r_pn = verify(&reloaded, &ring).unwrap();
        println!(
            "  {}  in-mem conf={:.2} sig={}  png-reload conf={:.2} sig={}",
            label, r_mem.confidence, r_mem.signature_ok, r_pn.confidence, r_pn.signature_ok
        );
    }
}

fn main() {
    for path in std::env::args().skip(1) {
        run(&path);
    }
}
