# Sweet Times stamps

A static, mobile-first gallery for Sweet Times company stamps.

## Designs

- Borderless
- Rectangle
- Rounded rectangle
- Oval
- Double oval

All five shapes are available in four text sets, for **20 designs**:

| Set | Lower line |
| --- | --- |
| Original | JAKARTA |
| Hyphen (U+002D) | JAKARTA - INDONESIA |
| En dash (U+2013) | JAKARTA – INDONESIA |
| Em dash (U+2014) | JAKARTA — INDONESIA |

Every design uses **Sweet Times** in Playlist Script above the selected lower line in Outfit Semibold. The three country captions use identical glyph size and tracking so that only the actual dash changes. The original JAKARTA designs retain their original lettering and proportions. Download filenames identify the text set and shape.

## Downloads

Each card supports SVG, PDF, transparent PNG, white-background PNG, and white-background JPG. SVG and PDF contain vector outlines, so recipients do not need the fonts installed. Raster exports support 300, 600, and 1200 DPI, including physical-resolution metadata.

Export settings control the overall width, ink color, border thickness, and raster resolution. The displayed dimensions include a 1.5 mm margin on every side. The transparent-preview setting affects the preview only; the selected download format determines the file background.

All preview rendering and file generation run in the browser. The page has no external runtime dependencies, analytics, backend, or build step. Mobile tap highlights and long-press selection are disabled for controls and previews; keyboard focus indicators remain available.

## Publishing

GitHub Pages serves the root of the `gh-pages` branch. Apply future website updates to that branch.

## Font sources

- Playlist Script: the exact [font asset](https://stsweettimes.github.io/links/assets/fonts/Playlist%20Script.otf) used by the [Sweet Times links page](https://stsweettimes.github.io/links/). Font metadata credits Artimasa, 2016.
- Outfit Semibold: the sans-serif family used by the same reference page; [Outfit source](https://github.com/Outfitio/Outfit-Fonts).

The site distributes outlines for these fixed words, not font binaries. `scripts/build-geometry.py` records how the original font glyphs were shaped with HarfBuzz and converted into cubic paths using fontTools. `scripts/verify-exports.mjs` checks all 20 designs, exact dash characters, alignment, clipping bounds, vector independence, and physical export dimensions.
