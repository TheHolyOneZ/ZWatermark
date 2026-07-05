

use image::{imageops, DynamicImage};
use imageproc::noise::gaussian_noise;
use serde::{Deserialize, Serialize};
use std::io::Cursor;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Attack {
    JpegRecompress { quality: u8 },
    Resize { scale: f32 },
    Crop { keep_pct: f32 },
    GaussianNoise { sigma: f32 },
    GaussianBlur { sigma: f32 },
    Brightness { delta: i32 },
    Contrast { factor: f32 },
    Grayscale,
    HorizontalFlip,
    Rotate { degrees: f32 },
}

impl Attack {

    pub fn label(&self) -> String {
        match self {
            Attack::JpegRecompress { quality } => format!("JPEG q={quality}"),
            Attack::Resize { scale } => format!("Resize ×{scale:.2}"),
            Attack::Crop { keep_pct } => format!("Crop {}%", (keep_pct * 100.0) as u32),
            Attack::GaussianNoise { sigma } => format!("Noise σ={sigma:.1}"),
            Attack::GaussianBlur { sigma } => format!("Blur σ={sigma:.1}"),
            Attack::Brightness { delta } => format!("Bright {delta:+}"),
            Attack::Contrast { factor } => format!("Contrast {factor:+}"),
            Attack::Grayscale => "Grayscale".into(),
            Attack::HorizontalFlip => "H-flip".into(),
            Attack::Rotate { degrees } => format!("Rotate {degrees:.1}°"),
        }
    }
}


pub fn apply_attack(image: &DynamicImage, attack: &Attack) -> DynamicImage {
    match attack {
        Attack::JpegRecompress { quality } => jpeg_roundtrip(image, *quality),
        Attack::Resize { scale } => resize(image, *scale),
        Attack::Crop { keep_pct } => center_crop(image, *keep_pct),
        Attack::GaussianNoise { sigma } => {
            let rgba = image.to_rgba8();
            let out = gaussian_noise(&rgba, 0.0, (*sigma).into(), 0xC0FFEE_u64);
            DynamicImage::ImageRgba8(out)
        }
        Attack::GaussianBlur { sigma } => image.blur(*sigma),
        Attack::Brightness { delta } => image.brighten(*delta),
        Attack::Contrast { factor } => image.adjust_contrast(*factor),
        Attack::Grayscale => DynamicImage::ImageLuma8(image.to_luma8()).to_rgba8().into(),
        Attack::HorizontalFlip => image.fliph(),
        Attack::Rotate { degrees } => small_rotate(image, *degrees),
    }
}

fn jpeg_roundtrip(image: &DynamicImage, quality: u8) -> DynamicImage {
    let mut buf = Vec::with_capacity(1 << 20);
    let rgb = image.to_rgb8();
    let mut cursor = Cursor::new(&mut buf);
    let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, quality.max(1));
    if enc
        .encode(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
        .is_err()
    {
        return image.clone();
    }
    match image::load_from_memory_with_format(&buf, image::ImageFormat::Jpeg) {
        Ok(d) => d,
        Err(_) => image.clone(),
    }
}

fn resize(image: &DynamicImage, scale: f32) -> DynamicImage {
    let s = scale.clamp(0.05, 4.0);
    if (s - 1.0).abs() < 1e-3 {
        return image.clone();
    }
    let (w, h) = image::GenericImageView::dimensions(image);
    let nw = ((w as f32) * s).round().max(8.0) as u32;
    let nh = ((h as f32) * s).round().max(8.0) as u32;
    image.resize_exact(nw, nh, imageops::FilterType::Triangle)
}

fn center_crop(image: &DynamicImage, keep_pct: f32) -> DynamicImage {
    let k = keep_pct.clamp(0.1, 1.0);
    let (w, h) = image::GenericImageView::dimensions(image);
    let nw = ((w as f32) * k).round().max(8.0) as u32;
    let nh = ((h as f32) * k).round().max(8.0) as u32;
    let x = (w.saturating_sub(nw)) / 2;
    let y = (h.saturating_sub(nh)) / 2;
    image.crop_imm(x, y, nw, nh)
}

fn small_rotate(image: &DynamicImage, degrees: f32) -> DynamicImage {


    let normalized = ((degrees.rem_euclid(360.0)) * 100.0).round() as i32;
    match normalized {
        0 => image.clone(),
        9000 => image.rotate90(),
        18000 => image.rotate180(),
        27000 => image.rotate270(),
        _ => {
            let rgba = image.to_rgba8();
            let radians = degrees.to_radians();
            let rotated = imageproc::geometric_transformations::rotate_about_center(
                &rgba,
                radians,
                imageproc::geometric_transformations::Interpolation::Bilinear,
                image::Rgba([0, 0, 0, 0]),
            );
            DynamicImage::ImageRgba8(rotated)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    fn synth(w: u32, h: u32) -> DynamicImage {
        let mut buf = ImageBuffer::new(w, h);
        for y in 0..h {
            for x in 0..w {
                buf.put_pixel(x, y, Rgba([(x % 256) as u8, (y % 256) as u8, 128, 255]));
            }
        }
        DynamicImage::ImageRgba8(buf)
    }

    #[test]
    fn attacks_produce_output() {
        let img = synth(256, 256);
        let attacks = [
            Attack::JpegRecompress { quality: 70 },
            Attack::Resize { scale: 0.5 },
            Attack::Crop { keep_pct: 0.8 },
            Attack::GaussianNoise { sigma: 5.0 },
            Attack::GaussianBlur { sigma: 1.0 },
            Attack::Brightness { delta: 10 },
            Attack::Contrast { factor: 1.2 },
            Attack::Grayscale,
            Attack::HorizontalFlip,
            Attack::Rotate { degrees: 2.0 },
            Attack::Rotate { degrees: 90.0 },
        ];
        for a in attacks {
            let out = apply_attack(&img, &a);
            let (w, h) = image::GenericImageView::dimensions(&out);
            assert!(w > 0 && h > 0, "{:?} produced empty output", a);
        }
    }
}
