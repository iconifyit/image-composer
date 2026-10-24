# ADR-002: Composite placement model — consistent square cells, centered block

- **Status:** Accepted
- **Date:** 2026-10-24
- **Supersedes:** the cell-placement behavior described in ADR-001 §3 ("Layout model and notation") and §4 ("Internal design"). ADR-001 otherwise stands; only how cells are sized and positioned within a region changes.

## Context

The v1 renderer (ADR-001) sizes each top-level region with a CSS-grid track template (`colSizes` for a `|` split, `rowSizes` for a `/` split), then subdivides each region into a uniform sub-grid whose **cells fill the region**. Each image is scaled to fit inside its cell (aspect preserved) and centered in that cell.

On a region whose aspect ratio is far from its grid's aspect ratio, that model reads as unbalanced. In a `1 | 2x3` split with `--col-sizes "2fr 1fr"`, the right `1fr` region is narrow and tall, so its 2×3 cells become large and non-square. Each icon then fits inside a large cell and _floats_: the outer columns hug the region's left and right edges, and the two rows leave a large vertical gap between them. The single-cell `2fr` feature region fills its whole rectangle, so the feature art sits with uneven space around it. The composite's inked content is not balanced left-to-right or top-to-bottom.

The established in-house compositor (`composite-image-generator`, `@vectopus.com/composite-image-generator`) does not have this problem. It sizes every icon to a single consistent square and distributes the remaining space as even gaps, so the icons form a compact block that sits balanced in the frame. The square cell is a math convenience; because the icon sources are square-canvassed, drawing them in square cells does not change their proportions.

### Illustration: before and after

Both composites below are the same `1 | 2x3` layout with the same images and `--col-sizes "2fr 1fr"`. The difference is the sub-grid placement this ADR changes. A thin gray rule marks each canvas edge — it is not part of the composite (whose background is white) and is added only so the balance between content and the frame is visible against the page.

**Before** — the current region-filling model. The right-hand icons float against the region's edges, the two rows pull apart vertically, and the feature sits in a sea of space:

![Before: cells fill the region, so icons float against the edges and whitespace is unbalanced](assets/before-cells-fill-region.png)

**After** — the target. Each region's icons form a consistent, evenly-gapped block centered within its region, so the live area reads as balanced left-to-right and top-to-bottom:

![After: consistent square cells laid out as a block centered in each region](assets/after-centered-square-block.png)

## Decision

Within each region, cells are a block of **equal squares**. Within a split, the primary columns are then **distributed across the full image by their visible (live) content**, so the outer margins and the gaps between columns are one consistent value. The region-split sizing is unchanged; the sub-grid placement and the cross-region distribution change.

1. **Region sizing is unchanged.** Track templates (`fr`, `px`, `%`, `auto`, `minmax`) size the top-level regions of a split within the margin-inset area; a plain grid is a single region. The sizing DSL is untouched.

2. **Square cell size.** For a region of `rows × cols` with inter-cell `gap`, every cell is a square whose side is the largest value that lets the whole grid (cells plus gaps) fit the region on both axes:

    ```text
    box = min( (regionW - (cols - 1) * gap) / cols,
               (regionH - (rows - 1) * gap) / rows )
    ```

    `box` is floored at 1 pixel. Each image is scaled to fit inside its square cell (aspect preserved) and centered; `inset` still pads within the cell. A square source fills a square cell exactly; a non-square source letterboxes within it. Nothing is cropped or distorted.

3. **Content measurement.** Before layout, each source image's **inked bounds** — the bounding box of its visible, non-background content — are measured. Sources routinely carry transparent or solid padding, and that padding is not part of a column's live area; counting it would make the gutters wrong.

4. **Live column width.** A column's (region's) live extent along the split axis is its block extent minus the padding on its outermost cells. For each outermost track, an icon's drawn inked extent in a square cell is `box × inked / max(srcW, srcH)`; half of `box − thatExtent` is the padding trimmed from that edge. So the live extent spans from the first visible pixel to the last:

    ```text
    block   = cols * box + (cols - 1) * gap            // along the split axis
    leadPad = (box - maxDrawnInked(leading track)) / 2
    trailPad= (box - maxDrawnInked(trailing track)) / 2
    live    = block - leadPad - trailPad
    ```

5. **Even distribution by live content.** The columns are placed across the full image span so the gap before the first, between each pair, and after the last are a single equal value:

    ```text
    gutter = (imageSpan - Σ live) / (numColumns + 1)
    ```

    Each column is positioned so its live content begins one gutter after the previous column's live content ends — its block shifted back by its own `leadPad`. The gutters are therefore measured between the **visible content**, not the padded cells.

A plain grid (no split) centers its single square-cell block in the margin-inset area.

The effect: every column's visible content is separated from its neighbours and from the image edges by the same gutter, regardless of the transparent padding each source carries — the feature and the icon grid read as evenly spaced.

## Why square cells and live-area distribution

A square cell gives every icon in a region one consistent scale and is axis-symmetric, so a centered block balances whitespace on all sides. But square cells alone are not enough: because sources carry their own padding, distributing by the padded cell leaves the gutters uneven (the padding is counted as column width). Measuring the inked content and distributing by it is what makes the gutters between what the eye actually sees uniform. Squareness is a placement convenience, not a constraint on the image: fit-inside preserves each image's aspect ratio, so square cells never distort.

## Scope and consequences

- **Splits distribute by live content; plain grids center a square-cell block.** A `|` or `/` split measures each column's visible content and distributes the columns with one uniform gutter; a plain grid centers its single square-cell block in the margin-inset area.
- **Track-sizing semantics are preserved.** `fr`/`px`/`%`/`minmax`/`auto` continue to govern the _region split_ (which sets each region's cell scale). Only the sub-grid placement and the cross-region distribution change.
- **Layout is now content-aware.** `composite()` measures each image's inked bounds (one `sharp` trim per image) before computing geometry and passes the measurements in. The geometry module stays pure — it operates on the measured numbers, not on pixels. Without measurements (a direct `computeGeometry` call omitting `contentSizes`), a split falls back to distributing by the padded block, which is the correct degenerate behaviour.
- **The gutter is the spacing on the split axis.** For a split, the uniform gutter governs the margins and inter-column gaps; the `margin` option insets the area used to _size_ each region's cells. Icon sizes are unchanged from the square-cell model.
- **Public contract is unchanged.** `composite()`, `compositeToFile()`, `compositeToDataUrl()`, the CLI, and the `renderComposite({ width, height, cells, ... })` shape are all unchanged. `computeGeometry` still returns a flat list of cell rectangles; it gains an optional `contentSizes` input and computes different rectangles.

## Code being removed

No files, modules, or exports are removed or become dead.

- `src/layout/geometry.js` — `gridCells` changes from region-filling tracks (`resolveTracks(equalTracks(...))`) to one square cell size with a centered block; the split branch changes from track-positioned regions to live-area distribution (new helpers `squareBox`, `blockExtent`, `maxDrawnInked`, `measureRegion`). `computeGeometry` gains an optional `contentSizes` parameter.
- `src/index.js` — `composite()` measures each image's inked bounds (new `measureContent`, using `sharp`) and passes `contentSizes` to `computeGeometry`; `sharp` is now imported here as well as in the renderer.
- `resolveTracks` remains in use for the region-split track sizing, so `src/layout/track-sizing.js` is unchanged and fully reachable. `src/render/renderer.js` is unaffected — it consumes cell rectangles as before.

## Testing

- `tests/geometry.test.js`: assert cells are square and equally sized; for a split with `contentSizes`, assert the gutters between the live content of adjacent columns (and to the image edges) are equal; assert the no-`contentSizes` fallback distributes by the block. Region-split track-sizing assertions remain.
- `tests/golden.test.js`: regenerate the committed references (`UPDATE_GOLDEN=1`); they now show the live-area-distributed layouts. Review the new references visually before committing — a reference is correct only if the new rendering is correct.
- `tests/composite.test.js`: update the split pixel-sampling tests to the new positions, and add a sample asserting the uniform live-area gutters (a background pixel in each gutter).
- Track-sizing and structure tests are unaffected.

## Alternatives considered

### Keep fill-the-region cells and only add per-cell padding

Adding `inset` or a per-cell pad does not fix the problem: the cells are still large and non-square, so icons still hug the region edges and the rows still float apart. The imbalance is a property of region-filling cells, not of cell padding.

### Force each image to a square by cropping (comp-gen's literal `resize(square, square)`)

`composite-image-generator` resizes each source straight to the square cell. For its square-canvassed icon sources this is lossless, but as a general rule for this package it would crop or distort a non-square input. Fitting inside the square cell (aspect preserved) yields the same result for square sources and stays safe for any input, so fit-inside is kept.

### Re-cut ADR-001 to version 0.0.2 instead of a new ADR

ADR-001 is the omnibus "build the package" decision covering the interface, contract, DSL, internal design, packaging, and phasing. Re-versioning the whole document for a placement-model change would re-publish the unchanged decisions alongside the one that changed and bury the decision. The placement model is a discrete decision, so it is recorded as its own ADR that supersedes the relevant ADR-001 sections; ADR-001 carries a pointer to this ADR for the superseded behavior.
