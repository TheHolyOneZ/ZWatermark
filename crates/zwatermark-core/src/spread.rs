

use ndarray::Array2;


pub const SS_HL2_CONTEXT: &str = "zwatermark.ss.hl2.v1";
pub const SS_LH2_CONTEXT: &str = "zwatermark.ss.lh2.v1";


pub const SS_ALPHA_DEFAULT: f32 = 14.0;


pub const SS_ALPHA_MAX: f32 = 28.0;


const BIT_STRIDE_Y: usize = 7919;
const BIT_STRIDE_X: usize = 6763;


const PN_TABLE_SIZE: usize = 1 << 16;
const PN_TABLE_MASK: usize = PN_TABLE_SIZE - 1;


pub fn pn_table(context: &str) -> Vec<i8> {
    let mut hasher = blake3::Hasher::new_derive_key(context);
    hasher.update(b"pn-table-v2");
    let mut reader = hasher.finalize_xof();
    let mut buf = vec![0u8; PN_TABLE_SIZE / 8];
    reader.fill(&mut buf);
    let mut out = Vec::with_capacity(PN_TABLE_SIZE);
    for i in 0..PN_TABLE_SIZE {
        let byte = buf[i / 8];
        let bit = (byte >> (i % 8)) & 1;
        out.push(if bit == 0 { -1 } else { 1 });
    }
    out
}


#[inline]
pub fn chip_at(table: &[i8], y: usize, x: usize) -> i8 {


    let h = y.wrapping_mul(2654435761).wrapping_add(x.wrapping_mul(2246822519));
    table[h & PN_TABLE_MASK]
}


#[inline]
pub fn bit_index_at(y: usize, x: usize) -> usize {
    y.wrapping_mul(BIT_STRIDE_Y)
        .wrapping_add(x.wrapping_mul(BIT_STRIDE_X))
        % 128
}


pub fn ss_embed(band: &mut Array2<f32>, bits: &[u8; 128], alpha: f32, table: &[i8]) {
    debug_assert_eq!(table.len(), PN_TABLE_SIZE);
    let (bh, bw) = band.dim();
    for y in 0..bh {
        for x in 0..bw {
            let bit_idx = bit_index_at(y, x);
            let sign = if bits[bit_idx] == 1 { 1.0 } else { -1.0 };
            let chip = chip_at(table, y, x) as f32;
            band[[y, x]] += alpha * sign * chip;
        }
    }
}


pub fn perceptual_mask(
    hl: &Array2<f32>,
    lh: &Array2<f32>,
    hh: &Array2<f32>,
) -> Array2<f32> {
    let (bh, bw) = hl.dim();
    debug_assert_eq!(lh.dim(), (bh, bw));
    debug_assert_eq!(hh.dim(), (bh, bw));


    let mut mask = Array2::<f32>::zeros((bh, bw));
    let floor = MASK_FLOOR;
    let knee = MASK_KNEE;
    for y in 0..bh {
        for x in 0..bw {
            let y0 = y.saturating_sub(1);
            let y1 = (y + 1).min(bh - 1);
            let x0 = x.saturating_sub(1);
            let x1 = (x + 1).min(bw - 1);
            let mut sum = 0.0f32;
            let mut n = 0u32;
            for yy in y0..=y1 {
                for xx in x0..=x1 {
                    sum += hl[[yy, xx]].abs()
                        + lh[[yy, xx]].abs()
                        + hh[[yy, xx]].abs();
                    n += 1;
                }
            }
            let activity = sum / n as f32;
            let m = (activity / knee).clamp(floor, 1.0);
            mask[[y, x]] = m;
        }
    }
    mask
}


pub const MASK_FLOOR: f32 = 0.15;


pub const MASK_KNEE: f32 = 25.0;


pub fn ss_embed_masked(
    band: &mut Array2<f32>,
    bits: &[u8; 128],
    alpha: f32,
    table: &[i8],
    mask: &Array2<f32>,
) {
    debug_assert_eq!(table.len(), PN_TABLE_SIZE);
    let (bh, bw) = band.dim();
    debug_assert_eq!(mask.dim(), (bh, bw));
    for y in 0..bh {
        for x in 0..bw {
            let bit_idx = bit_index_at(y, x);
            let sign = if bits[bit_idx] == 1 { 1.0 } else { -1.0 };
            let chip = chip_at(table, y, x) as f32;
            band[[y, x]] += alpha * mask[[y, x]] * sign * chip;
        }
    }
}


pub fn ss_decode(band: &Array2<f32>, table: &[i8]) -> ([u8; 128], f32) {
    debug_assert_eq!(table.len(), PN_TABLE_SIZE);
    let whitened = whiten(band);
    let (bh, bw) = whitened.dim();
    let mut r = [0.0f64; 128];
    let mut counts = [0u32; 128];
    for y in 0..bh {
        for x in 0..bw {
            let bit_idx = bit_index_at(y, x);
            let chip = chip_at(table, y, x) as f64;
            r[bit_idx] += whitened[[y, x]] as f64 * chip;
            counts[bit_idx] += 1;
        }
    }
    let mut bits = [0u8; 128];
    let mut conf_sum = 0.0f32;
    let mut conf_count = 0u32;
    for i in 0..128 {
        bits[i] = if r[i] > 0.0 { 1 } else { 0 };
        if counts[i] > 0 {
            conf_sum += (r[i].abs() / (counts[i] as f64).sqrt()) as f32;
            conf_count += 1;
        }
    }
    let mean_conf = if conf_count > 0 {
        conf_sum / conf_count as f32
    } else {
        0.0
    };
    (bits, mean_conf)
}


pub fn whiten(band: &Array2<f32>) -> Array2<f32> {
    let (bh, bw) = band.dim();
    let mut out = Array2::<f32>::zeros((bh, bw));
    for y in 0..bh {
        for x in 0..bw {
            let mut sum = 0.0f32;
            let mut count = 0u32;
            let y_start = y.saturating_sub(1);
            let x_start = x.saturating_sub(1);
            let y_end = (y + 1).min(bh - 1);
            let x_end = (x + 1).min(bw - 1);
            for yy in y_start..=y_end {
                for xx in x_start..=x_end {
                    sum += band[[yy, xx]];
                    count += 1;
                }
            }
            let local_mean = if count > 0 { sum / count as f32 } else { 0.0 };
            out[[y, x]] = band[[y, x]] - local_mean;
        }
    }
    out
}


pub fn ss_decode_combined(bands: &[(&Array2<f32>, &[i8])]) -> ([u8; 128], f32) {
    let mut r = [0.0f64; 128];
    let mut counts = [0u32; 128];
    for (band, table) in bands {
        debug_assert_eq!(table.len(), PN_TABLE_SIZE);
        let whitened = whiten(band);
        let (bh, bw) = whitened.dim();
        for y in 0..bh {
            for x in 0..bw {
                let bit_idx = bit_index_at(y, x);
                let chip = chip_at(table, y, x) as f64;
                r[bit_idx] += whitened[[y, x]] as f64 * chip;
                counts[bit_idx] += 1;
            }
        }
    }
    let mut bits = [0u8; 128];
    let mut conf_sum = 0.0f32;
    let mut conf_count = 0u32;
    for i in 0..128 {
        bits[i] = if r[i] > 0.0 { 1 } else { 0 };
        if counts[i] > 0 {
            conf_sum += (r[i].abs() / (counts[i] as f64).sqrt()) as f32;
            conf_count += 1;
        }
    }
    let mean_conf = if conf_count > 0 {
        conf_sum / conf_count as f32
    } else {
        0.0
    };
    (bits, mean_conf)
}


pub fn bytes_to_bit_array(bytes: &[u8; 16]) -> [u8; 128] {
    let mut out = [0u8; 128];
    for i in 0..128 {
        out[i] = (bytes[i / 8] >> (7 - (i % 8))) & 1;
    }
    out
}


pub fn bit_array_to_bytes(bits: &[u8; 128]) -> [u8; 16] {
    let mut out = [0u8; 16];
    for i in 0..128 {
        out[i / 8] |= (bits[i] & 1) << (7 - (i % 8));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::Array2;

    #[test]
    fn pn_table_is_deterministic() {
        let a = pn_table("test");
        let b = pn_table("test");
        assert_eq!(a, b);
        assert_eq!(a.len(), PN_TABLE_SIZE);
        assert!(a.iter().all(|&v| v == -1 || v == 1));

        let c = pn_table("test-other");
        assert_ne!(a, c);
    }

    #[test]
    fn embed_decode_roundtrip_zero_noise() {
        let (bh, bw) = (64, 48);
        let mut band = Array2::<f32>::zeros((bh, bw));
        let table = pn_table("roundtrip");
        let bits: [u8; 128] = std::array::from_fn(|i| ((i * 37) % 2) as u8);
        ss_embed(&mut band, &bits, 10.0, &table);
        let (decoded, _conf) = ss_decode(&band, &table);
        assert_eq!(decoded, bits);
    }

    #[test]
    fn decode_survives_moderate_noise() {

        let (bh, bw) = (128, 96);
        let mut band = Array2::<f32>::zeros((bh, bw));
        let table = pn_table("noise-test");
        let bits: [u8; 128] = std::array::from_fn(|i| (i as u8) & 1);
        ss_embed(&mut band, &bits, 8.0, &table);
        for j in 0..(bh * bw) {
            let y = j / bw;
            let x = j % bw;
            let n = ((j.wrapping_mul(0x9E37_79B9) & 0xFF) as f32 - 128.0) / 16.0;
            band[[y, x]] += n;
        }
        let (decoded, _) = ss_decode(&band, &table);
        let matches = decoded.iter().zip(bits.iter()).filter(|(a, b)| a == b).count();
        assert!(matches >= 120, "matched {}/128 under noise", matches);
    }

    #[test]
    fn bytes_bit_array_roundtrip() {
        let bytes = [0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF, 0xFE, 0xDC, 0xBA, 0x98];
        let bits = bytes_to_bit_array(&bytes);
        let back = bit_array_to_bytes(&bits);
        assert_eq!(back, bytes);
    }
}
