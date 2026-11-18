# Sweet Times stamps

A static, mobile-first gallery for Sweet Times company stamps. The home page opens the current eight-design comparison. All 128 earlier cards are available through the **Archive** button at `archive.html`.

## Current designs

The default `index.html` page contains **8 designs**: four relative text-size levels, each in Standard and Bold. Every card uses **borderless**, a horizontal divider, the literal caption **JAKARTA - INDONESIA** (U+002D hyphen), and the fixed **40 × 13 mm** Store B size.

| Level | Sweet Times size relative to the lower line | Cards |
| --- | --- | --- |
| Original | 100% of the original proportion | Standard + Bold |
| Level 2 | 90% of the original proportion (10% smaller) | Standard + Bold |
| Level 3 | 80% of the original proportion (20% smaller) | Standard + Bold |
| Level 4 | 70% of the original proportion (30% smaller) | Standard + Bold |

The Original pair exactly matches the corresponding archived designs. The next three levels make Sweet Times progressively smaller relative to JAKARTA - INDONESIA, using `wordmarkScale` values 0.9, 0.8, and 0.7. The percentages describe the relationship between the two lines. Both lines are fitted within the same stamp canvas, including cases where the lower caption is wider than the wordmark, without stretching the lettering. The 2 mm text gap, 0.25 mm divider, and physical outline weights stay fixed.

`focus.js` builds the current page and identifies the level and weight in every download filename. The home page has ink, raster-resolution, and transparent-preview settings. SVG/PDF pages remain exactly 40 × 13 mm; default PNG/JPG exports remain 4,000 × 1,300 pixels.

## Archive designs

`archive.html` uses the existing `app.js` gallery controller. Its **Current designs** button returns to the home page. All previous styles, captions, weights, dividers, size menus, store filters, and downloads remain available there:

- Borderless
- Rectangle
- Rounded rectangle
- Oval
- Double oval

All five shapes are available in four text sets, two lettering weights, and with or without a horizontal divider, for **80 base designs**. Rectangular base designs have a size menu. A separate **40 × 13 mm set** adds **48 fixed-size cards**, bringing the archive to **128 cards**:

| Set | Lower line |
| --- | --- |
| Original | JAKARTA |
| Hyphen (U+002D) | JAKARTA - INDONESIA |
| En dash (U+2013) | JAKARTA – INDONESIA |
| Em dash (U+2014) | JAKARTA — INDONESIA |

Each lettering weight has **Without divider** and **With divider** base collections of 20 designs each. The fixed-size set adds 12 cards to each weight/divider combination. The divider is a centered horizontal line between Sweet Times and the lower caption. It is 0.25 mm thick and 76% of the visible wordmark width, with equal clearance above and below in the 2 mm gap. Lettering, borders, dimensions, and resolution are identical between each pair. Download filenames identify both the weight and the divider option.

Every design uses **Sweet Times** in Playlist Script above the selected lower line in Outfit. The three country captions use identical glyph size and tracking within each weight profile so that only the actual dash changes. Lettering keeps its natural proportions when fitted to each template. Download filenames also identify the text set, shape, and physical size.

### 13 × 40 mm supplier size

The requested supplier size is 13 mm high × 40 mm wide. The gallery consistently displays this as **40 × 13 mm (width × height)**, or **4 × 1.3 cm**, with the exact **40:13** ratio. It is listed by **Store B**.

The archived dedicated set is at `archive.html?store=b-only#size-40x13` and includes borderless, rectangle, and rounded rectangle styles, all four captions, both weights, and both divider options: **3 × 4 × 2 × 2 = 48 cards**. These cards have fixed dimensions and no size menu. Reset keeps them at 40 × 13 mm. SVG/PDF artboards are exactly that size; default PNG/JPG exports are 4,000 × 1,300 pixels. The existing 80 cards and their IDs remain unchanged.

## Font weights

The referenced Playlist Script OTF contains one static weight, **400**, with no variable weight axis. The reference page declares the font as 400 but requests 800 for its heading; that requests browser-synthesized bold rather than an actual bold font file. This gallery applies explicit, controlled outlines consistently in all export formats.

Outfit supports a genuine variable weight axis from **100 to 900**, as recorded in [Google Fonts metadata](https://github.com/google/fonts/blob/main/ofl/outfit/METADATA.pb). The previous captions used 600. The updated standard set uses 650 for a slight increase, and the new bold set uses 700.

| Profile | Sweet Times | Lower caption | Archive cards |
| --- | --- | --- | --- |
| Standard | Playlist Script 400 + 0.06 mm outline | Native Outfit 650 | 64 |
| Bold | Playlist Script 400 + 0.18 mm outline | Native Outfit 700 Bold | 64 |

The outline values are full stroke widths: the added ink extends half that distance on each side of the original contour. Only the script lettering receives this stroke. The layout includes the full ink bounds when fitting the text and positioning the divider. Borders and divider thicknesses are independent of the font weight.

`scripts/build-geometry.py` instantiates Outfit 650 and 700 from `outfit-variable.ttf` before shaping the four captions. The source variable font and the earlier static 600 file both identify as version 1.100. The 650 interpolation is not a named stock style; it is labeled Outfit 650. Font binaries remain build inputs only. The shipped geometry preserves the old 600 captions for provenance and provides separate 650/700 outline sets.

## Supplier sizes

**Store A** is the first supplier chart and **Store B** is the second. Dimensions below and on the page are **width × height in millimetres**. Store A's centimetres have been converted to millimetres; Store B's values (13, 17, 22, etc.) are interpreted as millimetres. The rectangular labels in both charts put height before width.

The archived default sizes remain unchanged:

| Design | Stamp size | Aspect ratio | Listed store |
| --- | --- | --- | --- |
| Borderless | 43 × 17 mm / 4.3 × 1.7 cm | 43:17 | A + B |
| Rectangle | 55 × 22 mm / 5.5 × 2.2 cm | 5:2 | A + B |
| Rounded rectangle | 55 × 22 mm / 5.5 × 2.2 cm | 5:2 | A + B |
| Oval | 35 × 24 mm / 3.5 × 2.4 cm | 35:24 | A; B unconfirmed |
| Double oval | 35 × 24 mm / 3.5 × 2.4 cm | 35:24 | A; B unconfirmed |

The first three shapes can use every confirmed rectangle size below, for every caption, weight, and divider option. Changing a card's size refits its actual lettering and border, updates its dimensions and store label, and uses that same size for all downloads. Each card keeps its own selection. Reset restores the original default sizes. The five base shapes and 80 existing card IDs remain intact; the full size menu provides **992 valid shape/size/caption/weight/divider combinations**.

The visible **Size availability** filter offers **All sizes**, **Both stores**, **Store A only**, and **Store B only**. These choices refer to exact sizes listed in the supplied charts. Each view restricts the size menus and shows only compatible cards; when a current base-card size is excluded, the replacement uses the closest proportion to that design's original default. The Store B view exposes its 13 exclusive rectangle sizes across 48 rectangular base designs, plus all 48 fixed-size cards. It also explicitly lists Store B's two oval models as awaiting printable dimensions. Visible totals are All: **128**, Both stores: **48**, Store A only: **80**, Store B only: **96**. The fixed-size group and its headings hide together when excluded. Reset returns to All sizes, restores original base dimensions, and retains 40 × 13 mm for the dedicated cards. The `store` URL parameter makes filtered views shareable (`?store=b-only`, `?store=a-only`, or `?store=shared`).

`stamp-sizes.js` is the canonical catalogue. It contains 20 rectangle sizes: **6 shared, 1 listed only by A, and 13 listed only by B**. All 13 additional B sizes have aspect ratios different from A's rectangles. Nearby ratios such as 55:22 and 67:27 are not treated as equal.

| Width × height (mm) | Exact ratio | Listed store |
| --- | --- | --- |
| 40 × 13 | 40:13 | B |
| 43 × 13 | 43:13 | A |
| 55 × 13 | 55:13 | A + B |
| 78 × 13 | 6:1 | B |
| 43 × 17 | 43:17 | A + B |
| 55 × 17 | 55:17 | A + B |
| 67 × 17 | 67:17 | B |
| 43 × 22 | 43:22 | A + B |
| 55 × 22 | 5:2 | A + B |
| 43 × 27 | 43:27 | A + B |
| 55 × 27 | 55:27 | B |
| 67 × 27 | 67:27 | B |
| 78 × 27 | 26:9 | B |
| 55 × 32 | 55:32 | B |
| 67 × 32 | 67:32 | B |
| 78 × 32 | 39:16 | B |
| 55 × 43 | 55:43 | B |
| 67 × 43 | 67:43 | B |
| 78 × 43 | 78:43 | B |
| 103 × 43 | 103:43 | B |

SVG artboards and PDF pages match the selected dimensions exactly. The canvas has no added outside margin; the outer frame is inset proportionally on each axis so that its aspect ratio also matches the template. Text is fitted and centered without horizontal or vertical stretching. Borders, script outlines, and divider thicknesses retain their physical millimetre values at each size. Filenames identify the selected size, and the asynchronous raster export captures that selection before rendering so a later menu change cannot mislabel the file.

Store labels report what is listed in the supplied charts, not a claim that the other supplier cannot make a custom size. Store B's oval labels, `Oval 1/45` and `Oval 1/50`, do not supply both dimensions. No height or ratio is inferred from those codes or the pictured ellipse. The existing oval designs show **Store A**, with **Store B dimensions unconfirmed**. Store A's larger oval height is printed as `2.3.2`, so it also remains excluded.

The gemstone convention `1.45:1` / `1.50:1` is not evidence that Store B's slash labels carry that meaning. Primary stamp catalogues specify dimensions separately: [Stempelwarna lists Oval 45 with a 44 × 31 mm printing area](https://stempelwarna.com/harga-stempel-warna/), while [Printku's nominal 45 mm oval has a 42 × 30 mm artwork area](https://www.printku.co.id/p/stempel-oval-diameter-45mm). These examples establish that a stamp's model/nominal size and printable area can differ; they do not identify Store B's exact models. Store B's printable width and height are still needed before adding confirmed oval exports.

For completeness, A lists circle diameters 25/28/35 mm; B lists 23/28/35/40/45 mm. All circles have 1:1 proportions, with 28 and 35 mm exact matches. A also lists 30 × 30 and 35 × 35 mm squares; B does not list squares. These shapes appear in the comparison panel but do not replace or expand the existing five design styles. A square and circle sharing 1:1 proportions does not establish shape compatibility.

## Downloads

Each card supports SVG, PDF, transparent PNG, white-background PNG, and white-background JPG. SVG and PDF contain vector outlines, so recipients do not need the fonts installed.

Export settings control ink color and PNG/JPG minimum pixel width, with a border-thickness setting also available in the archive. Physical stamp sizes come from the selected supplier template. PNG/JPG default to at least **4,000 pixels wide**, with 2,000 and 6,000 options; the width rounds up to the next whole multiple of the reduced aspect ratio so both pixel dimensions are integers and the ratio is exact. A smaller physical stamp does not automatically reduce the image resolution. The export records the corresponding physical-resolution metadata. The transparent-preview setting affects the preview only; the selected download format determines the file background.

All preview rendering and file generation run in the browser. The page has no external runtime dependencies, analytics, backend, or build step. Mobile tap highlights and long-press selection are disabled for controls and previews; keyboard focus indicators remain available.

## Publishing

GitHub Pages serves the root of the `gh-pages` branch. `index.html` is the default current-design page; the archive is an explicit separate page, with no automatic redirect from the home page. Apply future website updates to that branch.

## Font sources

- Playlist Script: the exact [font asset](https://stsweettimes.github.io/links/assets/fonts/Playlist%20Script.otf) used by the [Sweet Times links page](https://stsweettimes.github.io/links/). Font metadata credits Artimasa, 2016.
- Outfit: the sans-serif family used by the same reference page; [Outfit source](https://github.com/Outfitio/Outfit-Fonts) and [variable font metadata](https://github.com/google/fonts/blob/main/ofl/outfit/METADATA.pb).

The site distributes outlines for these fixed words, not font binaries. `scripts/build-geometry.py` records how the original font glyphs were shaped with HarfBuzz and converted into cubic paths using fontTools. `scripts/verify-exports.mjs` checks all 992 size variations, store availability, actual native caption weights, script strokes in SVG/PDF, divider placement, full ink bounds, exact dash characters, supplier sizes and aspect ratios, undistorted lettering, border clearance, vector independence, and physical and raster export dimensions. The original 80 default SVG and PDF files are byte-for-byte unchanged by the supplier size addition.
