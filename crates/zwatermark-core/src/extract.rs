

use crate::ecc::{bits_to_bytes, repeat_decode};
use crate::embed::{
    hl_lattice, COEFFS_PER_TILE, QIM_STEP, QIM_STEP_L2, QIM_STEP_MAX_SCALE, TILE_GRID,
    TILE_GRID_L2,
};
use crate::payload::RobustPayload;
use crate::spread::{
    bit_array_to_bytes, pn_table, ss_decode, ss_decode_combined, SS_HL2_CONTEXT, SS_LH2_CONTEXT,
};
use image::{DynamicImage, GenericImageView};
use ndarray::Array2;

#[derive(Clone)]
pub struct Extracted {
    pub payload: Option<RobustPayload>,
    pub confidence: f32,


    pub good_tiles: u32,

    pub total_tiles: u32,
}

pub fn extract_robust(image: &DynamicImage) -> Extracted {
    let direct = extract_robust_direct(image);
    if direct.payload.is_some() {
        return direct;
    }
    extract_robust_with_sync(image, direct)
}


fn extract_robust_direct(image: &DynamicImage) -> Extracted {
    let mut candidates: Vec<Extracted> = Vec::with_capacity(8);


    candidates.push(extract_ss_hl2(image));
    candidates.push(extract_ss_hl2_lh2(image));


    candidates.push(extract_l2_qim(image, QIM_STEP_L2));
    candidates.push(extract_l2_qim(image, QIM_STEP_L2 * QIM_STEP_MAX_SCALE));
    candidates.push(extract_l2_qim(image, 20.0));
    candidates.push(extract_l2_qim(image, 60.0));
    candidates.push(extract_l1_qim(image, QIM_STEP));
    candidates.push(extract_l1_qim(image, QIM_STEP * 1.75));
    candidates.push(extract_l1_qim(image, QIM_STEP * 4.0));

    pick_best(candidates)
}

fn pick_best(candidates: Vec<Extracted>) -> Extracted {


    let with_payload: Vec<_> = candidates.iter().filter(|c| c.payload.is_some()).cloned().collect();
    if let Some(best) = with_payload.into_iter().max_by_key(|c| c.good_tiles) {
        return best;
    }
    candidates
        .into_iter()
        .max_by_key(|c| c.total_tiles)
        .unwrap_or_else(empty)
}


fn extract_robust_with_sync(image: &DynamicImage, mut best: Extracted) -> Extracted {
    let update = |best: &mut Extracted, cand: Extracted| -> bool {
        let cand_better = match (best.payload.is_some(), cand.payload.is_some()) {
            (false, true) => true,
            (true, true) => cand.good_tiles > best.good_tiles,
            (true, false) => false,
            (false, false) => cand.good_tiles > best.good_tiles,
        };
        if cand_better {
            *best = cand;
        }
        best.payload.is_some()
    };


    let reflections = [
        image.fliph(),
        image.rotate90(),
        image.rotate180(),
        image.rotate270(),
    ];
    for cand_img in &reflections {
        if update(&mut best, extract_robust_direct(cand_img)) {
            return best;
        }
    }


    let try_sweep = |best: &mut Extracted, img: &DynamicImage| -> bool {
        let cand = pick_best(vec![extract_ss_hl2(img), extract_ss_hl2_lh2(img)]);
        update(best, cand)
    };

    let (w, h) = image.dimensions();


    if w >= 200 && h >= 200 {
        for scale in [2.0_f32, 1.333, 1.176, 0.85] {
            let new_w = ((w as f32 * scale) as u32).max(64);
            let new_h = ((h as f32 * scale) as u32).max(64);
            if new_w > 4096 || new_h > 4096 {
                continue;
            }
            let resized = image.resize_exact(new_w, new_h, image::imageops::FilterType::Lanczos3);
            if try_sweep(&mut best, &resized) {
                return best;
            }
        }
    }


    if w >= 200 && h >= 200 {
        for (dx_frac, dy_frac) in [
            (0.1_f32, 0.0), (-0.1, 0.0), (0.0, 0.1), (0.0, -0.1),
        ] {
            let dx = (w as f32 * dx_frac) as i32;
            let dy = (h as f32 * dy_frac) as i32;
            let shifted = shift_and_pad(image, dx, dy);
            if try_sweep(&mut best, &shifted) {
                return best;
            }
        }
    }


    if w >= 32 && h >= 32 {
        let rgba = image.to_rgba8();
        for degrees in [-1.0_f32, -0.5, 0.5, 1.0] {
            let rotated = imageproc::geometric_transformations::rotate_about_center(
                &rgba,
                degrees.to_radians(),
                imageproc::geometric_transformations::Interpolation::Bilinear,
                image::Rgba([0, 0, 0, 0]),
            );
            let cand_img = DynamicImage::ImageRgba8(rotated);
            if try_sweep(&mut best, &cand_img) {
                return best;
            }
        }
    }

    best
}


fn shift_and_pad(image: &DynamicImage, dx: i32, dy: i32) -> DynamicImage {
    let (w, h) = image.dimensions();
    let mut canvas = image::RgbaImage::from_pixel(w, h, image::Rgba([0, 0, 0, 255]));
    let src = image.to_rgba8();
    for y in 0..h {
        for x in 0..w {
            let sx = x as i32 - dx;
            let sy = y as i32 - dy;
            if sx >= 0 && sx < w as i32 && sy >= 0 && sy < h as i32 {
                let px = src.get_pixel(sx as u32, sy as u32);
                canvas.put_pixel(x, y, *px);
            }
        }
    }
    DynamicImage::ImageRgba8(canvas)
}


fn extract_ss_hl2(image: &DynamicImage) -> Extracted {
    let (w, h) = image.dimensions();
    let tw = (w as usize / TILE_GRID_L2) & !3;
    let th = (h as usize / TILE_GRID_L2) & !3;
    if tw < 64 || th < 64 {
        return empty();
    }
    let rgba = image.to_rgba8();


    let mut hl2_bands: Vec<Array2<f32>> = Vec::with_capacity(TILE_GRID_L2 * TILE_GRID_L2);
    for ty in 0..TILE_GRID_L2 {
        for tx in 0..TILE_GRID_L2 {
            let x0 = tx * tw;
            let y0 = ty * th;
            let lum = extract_luminance(&rgba, x0, y0, tw, th);
            let multi = crate::dwt::forward_2level(&lum, crate::dwt::Family::Haar);
            hl2_bands.push(multi.level2.hl);
        }
    }

    let hl_table = pn_table(SS_HL2_CONTEXT);


    let mut candidates: Vec<RobustPayload> = Vec::new();
    for band in &hl2_bands {
        let (bits, _conf) = ss_decode(band, &hl_table);
        let bytes = bit_array_to_bytes(&bits);
        if let Some(p) = RobustPayload::from_bits(&bytes) {
            candidates.push(p);
        }
    }


    let refs: Vec<(&Array2<f32>, &[i8])> =
        hl2_bands.iter().map(|b| (b, hl_table.as_slice())).collect();
    let (combined_bits, _conf) = ss_decode_combined(&refs);
    let combined_bytes = bit_array_to_bytes(&combined_bits);
    if let Some(p) = RobustPayload::from_bits(&combined_bytes) {
        candidates.push(p);
    }

    let total = (TILE_GRID_L2 * TILE_GRID_L2) as u32 + 1;
    finalize(candidates, total)
}


fn extract_ss_hl2_lh2(image: &DynamicImage) -> Extracted {
    let (w, h) = image.dimensions();
    let tw = (w as usize / TILE_GRID_L2) & !3;
    let th = (h as usize / TILE_GRID_L2) & !3;
    if tw < 64 || th < 64 {
        return empty();
    }
    let rgba = image.to_rgba8();

    let mut hl2_bands: Vec<Array2<f32>> = Vec::with_capacity(4);
    let mut lh2_bands: Vec<Array2<f32>> = Vec::with_capacity(4);
    for ty in 0..TILE_GRID_L2 {
        for tx in 0..TILE_GRID_L2 {
            let x0 = tx * tw;
            let y0 = ty * th;
            let lum = extract_luminance(&rgba, x0, y0, tw, th);
            let multi = crate::dwt::forward_2level(&lum, crate::dwt::Family::Haar);
            hl2_bands.push(multi.level2.hl);
            lh2_bands.push(multi.level2.lh);
        }
    }
    let hl_table = pn_table(SS_HL2_CONTEXT);
    let lh_table = pn_table(SS_LH2_CONTEXT);


    let mut refs: Vec<(&Array2<f32>, &[i8])> = Vec::with_capacity(8);
    for b in &hl2_bands {
        refs.push((b, hl_table.as_slice()));
    }
    for b in &lh2_bands {
        refs.push((b, lh_table.as_slice()));
    }
    let (bits, _conf) = ss_decode_combined(&refs);
    let bytes = bit_array_to_bytes(&bits);

    let mut candidates: Vec<RobustPayload> = Vec::new();
    if let Some(p) = RobustPayload::from_bits(&bytes) {
        candidates.push(p);
    }


    for i in 0..hl2_bands.len() {
        let per_tile: Vec<(&Array2<f32>, &[i8])> = vec![
            (&hl2_bands[i], hl_table.as_slice()),
            (&lh2_bands[i], lh_table.as_slice()),
        ];
        let (b, _c) = ss_decode_combined(&per_tile);
        let by = bit_array_to_bytes(&b);
        if let Some(p) = RobustPayload::from_bits(&by) {
            candidates.push(p);
        }
    }

    let total = (TILE_GRID_L2 * TILE_GRID_L2) as u32 + 1;
    finalize(candidates, total)
}


fn extract_l1_qim(image: &DynamicImage, step: f32) -> Extracted {
    let (w, h) = image.dimensions();
    let tw = (w as usize / TILE_GRID) & !1;
    let th = (h as usize / TILE_GRID) & !1;
    if tw < 16 || th < 16 {
        return empty();
    }
    let rgba = image.to_rgba8();
    let total = (TILE_GRID * TILE_GRID) as u32;
    let mut candidates: Vec<RobustPayload> = Vec::new();
    for ty in 0..TILE_GRID {
        for tx in 0..TILE_GRID {
            let x0 = tx * tw;
            let y0 = ty * th;
            let lum = extract_luminance(&rgba, x0, y0, tw, th);
            let bands = crate::dwt::forward(&lum, crate::dwt::Family::Haar);
            if let Some(p) = decode_tile_qim(&bands.hl, step) {
                candidates.push(p);
            }
        }
    }
    finalize(candidates, total)
}

fn extract_l2_qim(image: &DynamicImage, step: f32) -> Extracted {
    let (w, h) = image.dimensions();
    let tw = (w as usize / TILE_GRID_L2) & !3;
    let th = (h as usize / TILE_GRID_L2) & !3;
    if tw < 64 || th < 64 {
        return empty();
    }
    let rgba = image.to_rgba8();
    let total = (TILE_GRID_L2 * TILE_GRID_L2) as u32;
    let mut candidates: Vec<RobustPayload> = Vec::new();
    for ty in 0..TILE_GRID_L2 {
        for tx in 0..TILE_GRID_L2 {
            let x0 = tx * tw;
            let y0 = ty * th;
            let lum = extract_luminance(&rgba, x0, y0, tw, th);
            let multi = crate::dwt::forward_2level(&lum, crate::dwt::Family::Haar);
            if let Some(p) = decode_tile_qim(&multi.level2.hl, step) {
                candidates.push(p);
            }
        }
    }
    finalize(candidates, total)
}

fn decode_tile_qim(hl: &Array2<f32>, step: f32) -> Option<RobustPayload> {
    let stream = decode_stream_from_hl(hl, COEFFS_PER_TILE, step);
    let bits = repeat_decode(&stream, 128);
    let bytes = bits_to_bytes(&bits);
    if bytes.len() != 16 {
        return None;
    }
    let mut arr = [0u8; 16];
    arr.copy_from_slice(&bytes);
    RobustPayload::from_bits(&arr)
}

fn decode_stream_from_hl(hl: &Array2<f32>, count: usize, step: f32) -> Vec<u8> {
    let (bh, bw) = hl.dim();
    let lattice = hl_lattice(bh, bw, count);
    let mut out = Vec::with_capacity(lattice.len());
    for (y, x) in lattice {
        let k = (hl[[y, x]] / step).round() as i32;
        out.push((k & 1) as u8);
    }
    out
}


fn empty() -> Extracted {
    Extracted {
        payload: None,
        confidence: 0.0,
        good_tiles: 0,
        total_tiles: 0,
    }
}

fn finalize(candidates: Vec<RobustPayload>, total: u32) -> Extracted {
    let good = candidates.len() as u32;


    let confidence = if good == 0 || total == 0 {
        0.0
    } else if total == 1 {
        1.0
    } else {
        let extra = (good - 1) as f32 / (total - 1) as f32;
        0.6 + 0.4 * extra
    };


    let payload = if candidates.is_empty() {
        None
    } else {
        let mut best: Option<(RobustPayload, u32)> = None;
        let mut ambiguous = false;
        for c in &candidates {
            let count = candidates.iter().filter(|x| *x == c).count() as u32;
            match best {
                Some((_, best_count)) if best_count > count => {}
                Some((prev, best_count)) if best_count == count && prev != *c => {
                    ambiguous = true;
                }
                _ => {
                    best = Some((*c, count));
                    ambiguous = false;
                }
            }
        }
        if ambiguous {
            None
        } else {
            best.map(|(p, _)| p)
        }
    };

    Extracted {
        payload,
        confidence,
        good_tiles: good,
        total_tiles: total,
    }
}

fn extract_luminance(
    rgba: &image::RgbaImage,
    x0: usize,
    y0: usize,
    tw: usize,
    th: usize,
) -> Array2<f32> {
    let mut a = Array2::<f32>::zeros((th, tw));
    for y in 0..th {
        for x in 0..tw {
            let px = rgba.get_pixel((x0 + x) as u32, (y0 + y) as u32).0;
            a[[y, x]] = 0.299 * px[0] as f32 + 0.587 * px[1] as f32 + 0.114 * px[2] as f32;
        }
    }
    a
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::embed::embed_robust;
    use crate::payload::CURRENT_VERSION;
    use image::{ImageBuffer, Rgba};

    fn synthetic_image(w: u32, h: u32) -> DynamicImage {
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

    fn sample_payload() -> RobustPayload {
        RobustPayload {
            version: CURRENT_VERSION,
            user_id: [0xAA, 0xBB, 0xCC, 0xDD, 0xEE],
            device_id: [0x11, 0x22],
            epoch_min: 29_000_100,
            counter: 7,
        }
    }

    fn embed_larger(w: u32, h: u32) -> (DynamicImage, RobustPayload) {
        let mut img = synthetic_image(w, h);
        let p = sample_payload();
        embed_robust(&mut img, &p);
        (img, p)
    }

    #[test]
    fn embed_extract_roundtrip() {


        let mut img = synthetic_image(1024, 768);
        let p = RobustPayload {
            version: CURRENT_VERSION,
            user_id: [1, 2, 3, 4, 5],
            device_id: [6, 7],
            epoch_min: 29_000_000,
            counter: 42,
        };
        embed_robust(&mut img, &p);
        let r = extract_robust(&img);
        assert_eq!(r.payload, Some(p));


        assert!(r.confidence >= 0.6, "confidence {}", r.confidence);
    }

    #[test]
    fn sync_recovers_hflip() {
        let (img, p) = embed_larger(1024, 768);
        let flipped = img.fliph();
        let r = extract_robust(&flipped);
        assert_eq!(r.payload, Some(p), "sync search should recover h-flip");
    }

    #[test]
    fn sync_recovers_rotate90() {
        let (img, p) = embed_larger(1024, 768);
        let rotated = img.rotate90();
        let r = extract_robust(&rotated);
        assert_eq!(r.payload, Some(p), "sync search should recover 90° rotation");
    }

    #[test]
    fn sync_recovers_rotate180() {
        let (img, p) = embed_larger(1024, 768);
        let rotated = img.rotate180();
        let r = extract_robust(&rotated);
        assert_eq!(r.payload, Some(p), "sync search should recover 180° rotation");
    }

    #[test]
    fn survives_crop_to_50pct() {
        let (img, _) = embed_larger(1024, 768);

        let cropped = img.crop_imm(256, 192, 512, 384);
        let r = extract_robust(&cropped);
        assert!(r.total_tiles > 0);
    }
}
