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

Every design uses **Sweet Times** in Playlist Script above the selected lower line in Outfit Semibold. The three country captions use identical glyph size and tracking so that only the actual dash changes. Lettering keeps its natural proportions when fitted to each template. Download filenames identify the text set, shape, and physical size.

## Supplier sizes

The five templates use these clearly printed sizes from the supplied stamp catalogue. Dimensions below and on the page are **width × height**; the catalogue prints the rectangular and oval dimensions in height × width order.

| Design | Stamp size | Aspect ratio |
| --- | --- | --- |
| Borderless | 43 × 17 mm / 4.3 × 1.7 cm | 43:17 |
| Rectangle | 55 × 22 mm / 5.5 × 2.2 cm | 5:2 |
| Rounded rectangle | 55 × 22 mm / 5.5 × 2.2 cm | 5:2 |
| Oval | 35 × 24 mm / 3.5 × 2.4 cm | 35:24 |
| Double oval | 35 × 24 mm / 3.5 × 2.4 cm | 35:24 |

Each template uses the same size for all four caption sets. SVG artboards and PDF pages match the listed dimensions exactly. The canvas has no added outside margin; the outer frame is inset proportionally on each axis so that its aspect ratio also matches the template. Text is fitted and centered without horizontal or vertical stretching.

The larger oval's height is printed as `2.3.2` in the supplied chart, so it is not treated as a verified size. Both oval designs use the clearly stated 35 × 24 mm option.

## Downloads

Each card supports SVG, PDF, transparent PNG, white-background PNG, and white-background JPG. SVG and PDF contain vector outlines, so recipients do not need the fonts installed.

Export settings control ink color, border thickness, and PNG/JPG minimum pixel width. Physical stamp sizes stay fixed to the supplier templates. PNG/JPG default to at least **4,000 pixels wide**, with 2,000 and 6,000 options; the width rounds up to the next whole multiple of the reduced aspect ratio so both pixel dimensions are integers and the ratio is exact. A smaller physical stamp does not automatically reduce the image resolution. The export records the corresponding physical-resolution metadata. The transparent-preview setting affects the preview only; the selected download format determines the file background.

All preview rendering and file generation run in the browser. The page has no external runtime dependencies, analytics, backend, or build step. Mobile tap highlights and long-press selection are disabled for controls and previews; keyboard focus indicators remain available.

## Publishing

GitHub Pages serves the root of the `gh-pages` branch. Apply future website updates to that branch.

## Font sources

- Playlist Script: the exact [font asset](https://stsweettimes.github.io/links/assets/fonts/Playlist%20Script.otf) used by the [Sweet Times links page](https://stsweettimes.github.io/links/). Font metadata credits Artimasa, 2016.
- Outfit Semibold: the sans-serif family used by the same reference page; [Outfit source](https://github.com/Outfitio/Outfit-Fonts).

The site distributes outlines for these fixed words, not font binaries. `scripts/build-geometry.py` records how the original font glyphs were shaped with HarfBuzz and converted into cubic paths using fontTools. `scripts/verify-exports.mjs` checks all 20 designs, exact dash characters, supplier sizes and aspect ratios, undistorted lettering, alignment, border clearance, vector independence, and physical and raster export dimensions.
