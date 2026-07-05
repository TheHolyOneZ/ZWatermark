# Demo images

Test images used for the README strength-mode showcase.

## showcase.png

- **Source:** [Picsum Photos](https://picsum.photos/) ID 1015 — pulled from Unsplash's catalogue.
- **License:** [Unsplash License](https://unsplash.com/license) — free for commercial and personal use, no attribution required, cannot be sold unmodified. Effectively CC0-equivalent for our purposes.
- **Original format:** JPEG. Converted to PNG (lossless) so the fragile LSB layer isn't wiped by JPEG re-encoding.
- **Dimensions:** 1600 × 1067, 8-bit RGB, non-interlaced.
- **Why this image:** Mix of high-frequency detail (foliage, water texture) and flat regions (sky, calm water) — the ideal stress-test for embedding visibility. Flat sky is the worst case for any watermark; detailed foliage is where it hides best.

## How to regenerate

```bash
curl -sL -o demo/showcase.jpg "https://picsum.photos/id/1015/1600/1067"
magick demo/showcase.jpg demo/showcase.png
rm demo/showcase.jpg
```
