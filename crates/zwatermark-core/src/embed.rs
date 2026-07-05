

use crate::ecc::REPETITION;
use crate::payload::RobustPayload;
use crate::spread::{
    pn_table, SS_ALPHA_DEFAULT, SS_ALPHA_MAX, SS_HL2_CONTEXT, SS_LH2_CONTEXT,
};
use image::{DynamicImage, GenericImageView, Rgba};
use ndarray::Array2;


pub const TILE_GRID: usize = 4;


pub const TILE_GRID_L2: usize = 2;


pub const QIM_STEP: f32 = 12.0;


pub const QIM_STEP_L2: f32 = 26.0;


pub const QIM_STEP_MAX_SCALE: f32 = 3.0;


pub const COEFFS_PER_TILE: usize = 128 * REPETITION;


pub fn hl_lattice(bh: usize, bw: usize, n: usize) -> Vec<(usize, usize)> {
    let mut out = Vec::with_capacity(n);
    if bh == 0 || bw == 0 || n == 0 {
        return out;
    }
    let aspect = (bw as f32 / bh as f32).max(0.01);
    let ny = (((n as f32) / aspect).sqrt().ceil() as usize).max(1);
    let nx = n.div_ceil(ny).max(1);
    let dy = (bh / ny).max(1);
    let dx = (bw / nx).max(1);
    let oy = dy / 2;
    let ox = dx / 2;
    for i in 0..n {
        let gx = i % nx;
        let gy = i / nx;
        let y = (oy + gy * dy).min(bh - 1);
        let x = (ox + gx * dx).min(bw - 1);
        out.push((y, x));
    }
    out
}

pub fn embed_robust(image: &mut DynamicImage, payload: &RobustPayload) {
    embed_robust_with(image, payload, SS_ALPHA_DEFAULT);
}


pub fn embed_robust_with(image: &mut DynamicImage, payload: &RobustPayload, alpha: f32) {
    let bits_bytes = payload.to_bits();
    let bits = crate::spread::bytes_to_bit_array(&bits_bytes);

    let (w, h) = image.dimensions();


    let tw = (w as usize / TILE_GRID_L2) & !3;
    let th = (h as usize / TILE_GRID_L2) & !3;
    if tw < 64 || th < 64 {
        return;
    }


    let embed_lh2 = alpha >= SS_ALPHA_MAX * 0.9;


    let hl_table = pn_table(SS_HL2_CONTEXT);
    let lh_table = if embed_lh2 {
        Some(pn_table(SS_LH2_CONTEXT))
    } else {
        None
    };

    let mut rgba = image.to_rgba8();
    for ty in 0..TILE_GRID_L2 {
        for tx in 0..TILE_GRID_L2 {
            let x0 = tx * tw;
            let y0 = ty * th;
            let mut lum = extract_luminance(&rgba, x0, y0, tw, th);
            let mut multi = crate::dwt::forward_2level(&lum, crate::dwt::Family::Haar);


            let mask = crate::spread::perceptual_mask(
                &multi.level2.hl,
                &multi.level2.lh,
                &multi.level2.hh,
            );

            crate::spread::ss_embed_masked(&mut multi.level2.hl, &bits, alpha, &hl_table, &mask);
            if let Some(ref lh) = lh_table {
                crate::spread::ss_embed_masked(&mut multi.level2.lh, &bits, alpha, lh, &mask);
            }

            let recon = crate::dwt::inverse_2level(&multi, crate::dwt::Family::Haar);
            lum.assign(&recon);
            apply_luminance_delta(&mut rgba, x0, y0, tw, th, &lum);
        }
    }
    *image = DynamicImage::ImageRgba8(rgba);
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
            let l = 0.299 * px[0] as f32 + 0.587 * px[1] as f32 + 0.114 * px[2] as f32;
            a[[y, x]] = l;
        }
    }
    a
}

fn apply_luminance_delta(
    rgba: &mut image::RgbaImage,
    x0: usize,
    y0: usize,
    tw: usize,
    th: usize,
    new_lum: &Array2<f32>,
) {
    for y in 0..th {
        for x in 0..tw {
            let px = rgba.get_pixel((x0 + x) as u32, (y0 + y) as u32).0;
            let old_l = 0.299 * px[0] as f32 + 0.587 * px[1] as f32 + 0.114 * px[2] as f32;
            let delta = new_lum[[y, x]] - old_l;
            let out = apply_delta_with_headroom(px, delta);
            rgba.put_pixel((x0 + x) as u32, (y0 + y) as u32, Rgba(out));
        }
    }
}


fn apply_delta_with_headroom(px: [u8; 4], delta: f32) -> [u8; 4] {
    let w = [0.299_f32, 0.587, 0.114];
    let mut fp = [
        px[0] as f32 + delta,
        px[1] as f32 + delta,
        px[2] as f32 + delta,
    ];
    let mut lum_lost = 0.0_f32;
    for i in 0..3 {
        if fp[i] > 255.0 {
            lum_lost += w[i] * (fp[i] - 255.0);
            fp[i] = 255.0;
        } else if fp[i] < 0.0 {
            lum_lost += w[i] * fp[i];
            fp[i] = 0.0;
        }
    }
    if lum_lost.abs() > 1e-4 {
        let up = lum_lost > 0.0;
        let mut w_sum = 0.0_f32;
        for i in 0..3 {
            let can = if up { fp[i] < 255.0 } else { fp[i] > 0.0 };
            if can {
                w_sum += w[i];
            }
        }
        if w_sum > 1e-4 {
            let per_channel = lum_lost / w_sum;
            for ch in fp.iter_mut().take(3) {
                let can = if up { *ch < 255.0 } else { *ch > 0.0 };
                if can {
                    *ch = (*ch + per_channel).clamp(0.0, 255.0);
                }
            }
        }
    }
    [
        fp[0].round() as u8,
        fp[1].round() as u8,
        fp[2].round() as u8,
        px[3],
    ]
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qim_encodes_bit() {


        for bit in [0u8, 1] {
            for input in [-100.0f32, -12.3, 0.1, 7.5, 42.0, 500.0] {
                let q = quantize_to_bit(input, bit, QIM_STEP);
                let k = (q / QIM_STEP).round() as i32;
                assert_eq!((k & 1) as u8, bit, "input={input} bit={bit} q={q}");
            }
        }
    }
}
