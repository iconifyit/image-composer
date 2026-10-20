# @atomiclotus/image-composer

Compose a set of images into a single output image using a small layout DSL — grids, side-by-side / stacked regions, and CSS-grid-style track sizing. A pure library (images in, image out — no storage, network, or domain knowledge) with a matching CLI.

## Install

```sh
npm install @atomiclotus/image-composer
```

Rendering is backed by [sharp](https://sharp.pixelplumbing.com/); PNG and WebP output are supported.

## Library

```js
const { composite, compositeToFile, compositeToDataUrl } = require('@atomiclotus/image-composer');

// Buffer + content type:
const { buffer, contentType } = await composite({
    images: ['a.png', 'b.png', 'c.png', /* ... */], // paths or Buffers, in fill order
    layout: '1 | 3x2',          // one cell beside a 3x2 grid
    colSizes: '2fr 1fr',        // the feature cell is twice the grid's width
    width: 800,
    height: 600,
    gap: 20,
    margin: 24,
    background: '#ffffff',
    format: 'png',              // or 'webp'
});

// Or write straight to a file / get a data URL:
await compositeToFile({ /* ...same options... */, out: 'out.png' });
const dataUrl = await compositeToDataUrl({ /* ...same options... */ });
```

Each image is scaled to fit its cell (aspect preserved, no crop) and centered. Cells beyond the images are left as background; images beyond the cells are ignored — the caller controls placement by the order of `images`.

## CLI

```sh
image-composer --layout "1 | 3x2" --col-sizes "2fr 1fr" --gap 20 \
  --width 800 --height 600 --out out.png  img1.png img2.png img3.png ...
```

Image inputs are positional arguments (in fill order). Run `image-composer --help` for all options. The output format is inferred from the `--out` extension (`.webp` → WebP, else PNG) unless `--format` is given.

## Layout notation

The layout string describes **structure**; sizing is supplied separately, so the structure stays readable.

- **Grid:** `RxC` — rows × cols (e.g. `3x4`). `1` is a single cell.
- **Composite (one level):** regions joined by a single operator — `|` (columns, side by side) **or** `/` (rows, stacked), not both. Each region is a grid or a single cell. Examples: `1 | 3x2`, `2x2 | 2x2`, `1x4 / 1x4`.

### Sizing (separate from structure)

`--col-sizes` sizes the regions of a `|` split; `--row-sizes` sizes the regions of a `/` split. It mirrors `grid-template-columns` / `grid-template-rows` and defaults to equal (`1fr`); the track count must match the number of regions.

Supported track sizes: `fr`, `px`, `%`, `auto`, and `minmax(min, max)`. A pixel compositor has no content flow, so `auto` is a weight‑1 flexible track (effectively `1fr`), and `minmax(min, max)` is flexible, floored at `min` and capped at `max` (unbounded when the max is `fr`).

Spacing: `--gap` between cells and regions; `--margin` for the outer frame; `--inset` for padding inside each cell.

## Scope (v1)

v1 is a **single-operator, one-level** layout with full track sizing. Deferred to v2: grouping `()`, mixing `|` and `/` in one layout, nesting beyond one level, named grid areas, and richer sizing (`repeat()`, `fit-content()`).

See `docs/adr/ADR-001-image-composer/` for the design.

## License

MIT
