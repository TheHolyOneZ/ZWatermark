

use ab_glyph::{FontRef, PxScale};
use image::{imageops, DynamicImage, GenericImageView, Rgba, RgbaImage};
use imageproc::drawing::draw_text_mut;
use serde::{Deserialize, Serialize};

const FONT_BYTES: &[u8] = include_bytes!("../../assets/DejaVuSans-Bold.ttf");
const DEFAULT_LOGO: &[u8] = include_bytes!("../../assets/zw-logo.png");
const BADGE_TEXT: &str = "Signed with ZWatermark";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OverlayMode {
    Text,
    Image,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Corner {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    Center,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisibleOverlay {
    pub enabled: bool,
    pub mode: OverlayMode,

    pub text: Option<String>,


    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub image_bytes: Option<Vec<u8>>,
    pub position: Corner,

    pub opacity: f32,


    pub size_pct: f32,

    pub zw_badge: bool,
}

impl Default for VisibleOverlay {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: OverlayMode::Image,
            text: None,
            image_bytes: None,
            position: Corner::BottomRight,
            opacity: 0.75,
            size_pct: 0.12,
            zw_badge: false,
        }
    }
}


pub fn apply_overlay(image: &mut DynamicImage, config: &VisibleOverlay) {
    if !config.enabled {
        return;
    }
    let (w, h) = image.dimensions();
    if w < 64 || h < 64 {
        return;
    }
    let opacity = config.opacity.clamp(0.05, 1.0);
    let short = w.min(h) as f32;
    let target = (short * config.size_pct.clamp(0.02, 0.5)).max(24.0);

    match config.mode {
        OverlayMode::Text => {
            let text = config.text.as_deref().unwrap_or("").trim();
            if text.is_empty() {

            } else {
                draw_text_layer(image, text, target, opacity, config.position);
            }
        }
        OverlayMode::Image => {
            let bytes = config
                .image_bytes
                .as_deref()
                .filter(|b| !b.is_empty())
                .unwrap_or(DEFAULT_LOGO);
            if let Ok(logo) = image::load_from_memory(bytes) {
                draw_image_layer(image, &logo, target, opacity, config.position);
            }
        }
    }

    if config.zw_badge {
        let badge_scale = (short * 0.025).clamp(12.0, 40.0);
        draw_text_layer(
            image,
            BADGE_TEXT,
            badge_scale,
            (opacity * 0.9).clamp(0.3, 1.0),
            opposite(config.position),
        );
    }
}

fn draw_image_layer(
    image: &mut DynamicImage,
    logo: &DynamicImage,
    target_short: f32,
    opacity: f32,
    corner: Corner,
) {
    let (lw, lh) = logo.dimensions();
    if lw == 0 || lh == 0 {
        return;
    }
    let target = target_short.max(1.0) as u32;

    let scale = target as f32 / lw.min(lh) as f32;
    let new_w = ((lw as f32) * scale).round().max(1.0) as u32;
    let new_h = ((lh as f32) * scale).round().max(1.0) as u32;
    let scaled = logo.resize_exact(new_w, new_h, imageops::FilterType::Lanczos3);
    let mut layer: RgbaImage = scaled.to_rgba8();
    apply_alpha(&mut layer, opacity);

    let (w, h) = image.dimensions();
    let pad = (w.min(h) as f32 * 0.03).round() as i64;
    let (x, y) = anchor(corner, w, h, new_w, new_h, pad);
    let mut base = image.to_rgba8();
    imageops::overlay(&mut base, &layer, x, y);
    *image = DynamicImage::ImageRgba8(base);
}

fn draw_text_layer(
    image: &mut DynamicImage,
    text: &str,
    px_scale: f32,
    opacity: f32,
    corner: Corner,
) {
    let font = match FontRef::try_from_slice(FONT_BYTES) {
        Ok(f) => f,
        Err(_) => return,
    };
    let scale = PxScale::from(px_scale.max(8.0));
    let (tw, th) = text_bounds(&font, scale, text);
    if tw == 0 || th == 0 {
        return;
    }

    let (iw, ih) = image.dimensions();
    let pad_i = (iw.min(ih) as f32 * 0.03).round() as i64;
    let (ax, ay) = anchor(corner, iw, ih, tw, th, pad_i);


    let mut plate: RgbaImage =
        RgbaImage::from_pixel(tw + (px_scale * 0.6) as u32, th + (px_scale * 0.6) as u32, Rgba([0, 0, 0, 0]));

    let plate_alpha = (opacity * 130.0) as u8;
    for pix in plate.pixels_mut() {
        pix.0 = [0, 0, 0, plate_alpha];
    }
    let text_alpha = (opacity * 255.0) as u8;
    draw_text_mut(
        &mut plate,
        Rgba([255, 255, 255, text_alpha]),
        (px_scale * 0.3) as i32,
        (px_scale * 0.2) as i32,
        scale,
        &font,
        text,
    );

    let mut base = image.to_rgba8();
    imageops::overlay(&mut base, &plate, ax, ay);
    *image = DynamicImage::ImageRgba8(base);
}

fn text_bounds(font: &FontRef<'_>, scale: PxScale, text: &str) -> (u32, u32) {
    use ab_glyph::{Font, ScaleFont};
    let scaled = font.as_scaled(scale);
    let mut width = 0.0f32;
    for c in text.chars() {
        let gid = scaled.glyph_id(c);
        width += scaled.h_advance(gid);
    }
    let height = scaled.height();
    (width.ceil() as u32, height.ceil() as u32)
}

fn apply_alpha(layer: &mut RgbaImage, opacity: f32) {
    let mult = opacity.clamp(0.0, 1.0);
    for pix in layer.pixels_mut() {
        let a = pix.0[3] as f32 * mult;
        pix.0[3] = a.round().clamp(0.0, 255.0) as u8;
    }
}

fn anchor(corner: Corner, iw: u32, ih: u32, ow: u32, oh: u32, pad: i64) -> (i64, i64) {
    let iw = iw as i64;
    let ih = ih as i64;
    let ow = ow as i64;
    let oh = oh as i64;
    match corner {
        Corner::TopLeft => (pad, pad),
        Corner::TopRight => (iw - ow - pad, pad),
        Corner::BottomLeft => (pad, ih - oh - pad),
        Corner::BottomRight => (iw - ow - pad, ih - oh - pad),
        Corner::Center => ((iw - ow) / 2, (ih - oh) / 2),
    }
}

fn opposite(corner: Corner) -> Corner {
    match corner {
        Corner::TopLeft => Corner::BottomRight,
        Corner::TopRight => Corner::BottomLeft,
        Corner::BottomLeft => Corner::TopRight,
        Corner::BottomRight => Corner::TopLeft,
        Corner::Center => Corner::BottomRight,
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
                buf.put_pixel(x, y, Rgba([128, 128, 128, 255]));
            }
        }
        DynamicImage::ImageRgba8(buf)
    }

    fn count_nongray(image: &DynamicImage) -> usize {
        let rgba = image.to_rgba8();
        rgba.pixels().filter(|p| p.0 != [128, 128, 128, 255]).count()
    }

    #[test]
    fn disabled_overlay_is_noop() {
        let img = synth(400, 400);
        let mut out = img.clone();
        apply_overlay(&mut out, &VisibleOverlay::default());
        assert_eq!(count_nongray(&out), 0);
    }

    #[test]
    fn image_overlay_touches_pixels() {
        let mut out = synth(400, 400);
        let cfg = VisibleOverlay {
            enabled: true,
            mode: OverlayMode::Image,
            ..Default::default()
        };
        apply_overlay(&mut out, &cfg);
        assert!(count_nongray(&out) > 0, "image overlay must modify pixels");
    }

    #[test]
    fn text_overlay_touches_pixels() {
        let mut out = synth(600, 400);
        let cfg = VisibleOverlay {
            enabled: true,
            mode: OverlayMode::Text,
            text: Some("Hello".into()),
            size_pct: 0.15,
            ..Default::default()
        };
        apply_overlay(&mut out, &cfg);
        assert!(count_nongray(&out) > 0, "text overlay must modify pixels");
    }
}
