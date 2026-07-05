

use image::{DynamicImage, GenericImageView, Rgba};


pub fn embed_fragile(image: &mut DynamicImage, payload: &[u8], seed: &[u8; 32]) -> bool {
    let (w, h) = image.dimensions();
    let capacity_bits = (w as usize) * (h as usize) * 3;
    let payload_bits = payload.len() * 8;
    if payload_bits > capacity_bits {
        return false;
    }

    let order = permuted_order(seed, capacity_bits);
    let mut rgba = image.to_rgba8();

    for (bit_idx, target) in order.iter().take(payload_bits).enumerate() {
        let byte = payload[bit_idx / 8];
        let bit = (byte >> (7 - (bit_idx % 8))) & 1;
        let (pixel_idx, channel) = (target / 3, target % 3);
        let x = (pixel_idx % w as usize) as u32;
        let y = (pixel_idx / w as usize) as u32;
        let mut px = rgba.get_pixel(x, y).0;
        px[channel] = (px[channel] & 0xFE) | bit;
        rgba.put_pixel(x, y, Rgba(px));
    }

    *image = DynamicImage::ImageRgba8(rgba);
    true
}


pub fn extract_fragile(image: &DynamicImage, nbytes: usize, seed: &[u8; 32]) -> Option<Vec<u8>> {
    let (w, h) = image.dimensions();
    let capacity_bits = (w as usize) * (h as usize) * 3;
    let want_bits = nbytes * 8;
    if want_bits > capacity_bits {
        return None;
    }

    let order = permuted_order(seed, capacity_bits);
    let rgba = image.to_rgba8();

    let mut bits = Vec::with_capacity(want_bits);
    for target in order.iter().take(want_bits) {
        let (pixel_idx, channel) = (target / 3, target % 3);
        let x = (pixel_idx % w as usize) as u32;
        let y = (pixel_idx / w as usize) as u32;
        let px = rgba.get_pixel(x, y).0;
        bits.push(px[channel] & 1);
    }

    let mut out = vec![0u8; nbytes];
    for (i, b) in bits.iter().enumerate() {
        out[i / 8] |= b << (7 - (i % 8));
    }
    Some(out)
}


fn permuted_order(seed: &[u8; 32], n: usize) -> Vec<usize> {
    let mut out: Vec<usize> = (0..n).collect();
    let mut xof = blake3::Hasher::new_keyed(seed).finalize_xof();


    let mut buf = [0u8; 8];
    for i in (1..n).rev() {
        xof.fill(&mut buf);
        let r = u64::from_le_bytes(buf);
        let j = (r % ((i as u64) + 1)) as usize;
        out.swap(i, j);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    fn synthetic_image(w: u32, h: u32) -> DynamicImage {
        let mut buf = ImageBuffer::new(w, h);
        for y in 0..h {
            for x in 0..w {
                buf.put_pixel(x, y, Rgba([((x * 7) % 256) as u8, ((y * 13) % 256) as u8, 128, 255]));
            }
        }
        DynamicImage::ImageRgba8(buf)
    }

    #[test]
    fn fragile_roundtrip() {
        let mut img = synthetic_image(64, 64);
        let seed = [0x42u8; 32];
        let payload = b"Hello, ZWatermark! 0123456789 abcdefgh";
        assert!(embed_fragile(&mut img, payload, &seed));
        let back = extract_fragile(&img, payload.len(), &seed).unwrap();
        assert_eq!(&back[..], &payload[..]);
    }

    #[test]
    fn fragile_wrong_seed_fails() {
        let mut img = synthetic_image(64, 64);
        let seed = [0x42u8; 32];
        let wrong = [0x43u8; 32];
        let payload = b"secret payload bytes here!!";
        embed_fragile(&mut img, payload, &seed);
        let back = extract_fragile(&img, payload.len(), &wrong).unwrap();
        assert_ne!(&back[..], &payload[..]);
    }
}
