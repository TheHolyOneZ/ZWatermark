

use anyhow::Result;

mod attacks {
    pub mod jpeg;
    pub mod rescale;
    pub mod crop;
    pub mod phone_photo;
    pub mod print_scan;
    pub mod recompress;
    pub mod color_tweaks;
}

const PASS_THRESHOLD: f32 = 0.75;

fn mark_and_extract_confidence<F>(_fixture: &str, _attack: F) -> Result<f32>
where
    F: Fn(&image::DynamicImage) -> image::DynamicImage,
{
    unimplemented!("M1: hook into zwatermark_core::mark + verify")
}

#[test]
#[ignore = "robustness harness fixtures + attacks pending"]
fn survives_jpeg_q40() -> Result<()> {
    let c = mark_and_extract_confidence("4k-desktop", attacks::jpeg::q40)?;
    assert!(c >= PASS_THRESHOLD, "confidence {c:.3} below {PASS_THRESHOLD}");
    Ok(())
}

#[test]
#[ignore = "robustness harness fixtures + attacks pending"]
fn survives_crop_25pct() -> Result<()> {
    let c = mark_and_extract_confidence("ide-dark", attacks::crop::center_25pct)?;
    assert!(c >= PASS_THRESHOLD, "confidence {c:.3} below {PASS_THRESHOLD}");
    Ok(())
}

#[test]
#[ignore = "robustness harness fixtures + attacks pending"]
fn survives_rescale_down_30pct() -> Result<()> {
    let c = mark_and_extract_confidence("website-light", attacks::rescale::down_30pct)?;
    assert!(c >= PASS_THRESHOLD, "confidence {c:.3} below {PASS_THRESHOLD}");
    Ok(())
}

#[test]
#[ignore = "robustness harness fixtures + attacks pending"]
fn survives_phone_photo_sim() -> Result<()> {
    let c = mark_and_extract_confidence("4k-desktop", attacks::phone_photo::default_sim)?;
    assert!(c >= PASS_THRESHOLD, "confidence {c:.3} below {PASS_THRESHOLD}");
    Ok(())
}

#[test]
#[ignore = "robustness harness fixtures + attacks pending"]
fn survives_print_scan_sim() -> Result<()> {
    let c = mark_and_extract_confidence("website-light", attacks::print_scan::default_sim)?;
    assert!(c >= PASS_THRESHOLD, "confidence {c:.3} below {PASS_THRESHOLD}");
    Ok(())
}

#[test]
#[ignore = "robustness harness fixtures + attacks pending"]
fn survives_discord_recompress() -> Result<()> {
    let c = mark_and_extract_confidence("ide-dark", attacks::recompress::discord)?;
    assert!(c >= PASS_THRESHOLD, "confidence {c:.3} below {PASS_THRESHOLD}");
    Ok(())
}
