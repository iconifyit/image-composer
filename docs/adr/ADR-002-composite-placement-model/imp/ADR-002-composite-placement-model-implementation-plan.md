# ADR-002 Implementation Plan — Composite placement model

Implements [ADR-002](../ADR-002-composite-placement-model.md). Scope contract: **this change replaces the sub-grid placement and split distribution in the geometry, measures each image's live content, and distributes split columns by that live content — and nothing else.** The public API, CLI, layout DSL, track-sizing, and renderer contract are unchanged.

## Steps

1. **`src/layout/geometry.js` — square cells.** Replace the region-filling `gridCells` (which divided a region into `resolveTracks(equalTracks(...))` tracks) with one square cell size and a centered block. Factor the cell-side math into `squareBox(width, height, rows, cols, gap)` and the line length into `blockExtent(box, count, gap)`.

2. **`src/layout/geometry.js` — live-area measurement.** Add `maxDrawnInked(indices, contentSizes, box, axis)` (largest drawn inked extent among the images in a set of cells) and `measureRegion(region, box, gap, imageStart, contentSizes, direction)` (a region's block extent, live extent, and leading padding along the split axis).

3. **`src/layout/geometry.js` — live-area distribution.** Rewrite the split branch of `computeGeometry` to: size each region's cells from the track template (unchanged), measure each region's live extent, compute `gutter = (imageSpan − Σ live) / (numColumns + 1)`, and position each region's block so its live content starts one gutter after the previous region's live content ends. Add the optional `contentSizes` parameter; when absent, fall back to distributing by the block (live = block, leadPad = 0).

4. **`src/index.js` — content measurement.** Add `measureContent(image)` using `sharp` (`.metadata()` + `.trim()`, falling back to full size for a uniform image). In `composite()`, measure every image into `contentSizes` and pass it to `computeGeometry`. Import `sharp` in this module.

5. **Tests.** Update `tests/geometry.test.js` (square cells; equal live-area gutters for a split with `contentSizes`; block fallback without `contentSizes`; region track-sizing retained). Update `tests/composite.test.js` split pixel-sampling to the new positions and add a uniform-gutter assertion. Regenerate `tests/golden.test.js` references (`UPDATE_GOLDEN=1`) and review them visually. Structure and track-sizing tests are unaffected.

6. **Verify.** `npm test`, `npm run lint`, `npm run format:check` all green. Exercise the real CLI on sample icons across every layout to confirm the comfort behaviour.

## Verification evidence

On `1 | 3x2` at 1040×640 with `--col-sizes "2fr 1fr"`, the feature live width (482) + grid live width (306) = 788, so the gutter is `(1040 − 788) / 3 = 84px`, and the measured gutters between visible content (left margin, inter-column, right margin) are each 84px.

## Out of scope / follow-ups

- Plain grids keep the centered square-cell block (no live-area redistribution); a single centered block already has symmetric margins.
- The `inset` option and the renderer are untouched.
