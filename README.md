# Sweet Times stamps

A static, mobile-first gallery for Sweet Times company stamps.

## Designs

- Borderless
- Rectangle
- Rounded rectangle
- Oval
- Double oval

Every design uses the same two lines: **Sweet Times** in Playlist Script, and **JAKARTA** in Outfit Semibold.

## Downloads

Each card supports SVG, PDF, transparent PNG, white-background PNG, and white-background JPG. SVG and PDF contain vector outlines, so recipients do not need the fonts installed. Raster exports support 300, 600, and 1200 DPI, including physical-resolution metadata.

Export settings control the overall width, ink color, border thickness, and raster resolution. The displayed dimensions include a 1.5 mm margin on every side. The transparent-preview setting affects the preview only; the selected download format determines the file background.

All preview rendering and file generation run in the browser. The page has no external runtime dependencies, analytics, backend, or build step. Mobile tap highlights and long-press selection are disabled for controls and previews; keyboard focus indicators remain available.

## Publishing

GitHub Pages serves the root of the `gh-pages` branch. Apply future website updates to that branch.

## Font sources

- Playlist Script: the exact [font asset](https://stsweettimes.github.io/links/assets/fonts/Playlist%20Script.otf) used by the [Sweet Times links page](https://stsweettimes.github.io/links/). Font metadata credits Artimasa, 2016.
- Outfit Semibold: the sans-serif family used by the same reference page; [Outfit source](https://github.com/Outfitio/Outfit-Fonts).

The site distributes outlines for these fixed words, not font binaries. `scripts/build-geometry.py` records how the original font glyphs were shaped with HarfBuzz and converted into cubic paths using fontTools. `scripts/verify-exports.mjs` checks the five variants, alignment, clipping bounds, vector independence, and physical export dimensions.
