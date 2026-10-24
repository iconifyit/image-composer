# ADR-001 Implementation Plan — image-composer package (v1)

- **Governs:** [ADR-001 v0.0.1](../ADR-001-image-composer-0.0.1.md) (Accepted).
- **Repo:** `iconifyit/image-composer` (this repo); npm `@atomiclotus/image-composer`.
- **Scope contract:** _Build the `image-composer` package — the pure `composite()` library + CLI, the layout DSL (structure + full v1 track sizing), the layout engine, and the renderer, with tests — and nothing else._ No vectoricons integration (that is ADR-033 / Phase 2, a separate repo).

## Resolved implementation choices

- **Rendering:** `sharp` (libvips) — rasterizes SVG and raster inputs, composites by position, outputs PNG/WebP. One modern dependency; no node-canvas.
- **Sizing tokenizer:** `postcss-value-parser` (tokenizes `fr`/length/`%`/`minmax()`/`auto`); a thin semantic layer maps tokens to track sizes.
- **Structure parser:** hand-written recursive-descent (v1 grammar is tiny). A PEG generator is a v2 concern.
- **Module format:** CommonJS, to match the consumers (the api and a Node Lambda). Dual ESM can come later if wanted.
- **Test runner:** jest, matching the org's ecosystem; golden-image tests for the renderer.

## Build order (each step is a commit; TDD where it fits)

1. **Scaffold.** `package.json` (`@atomiclotus/image-composer`, `main`, `bin`, scripts), `VERSION` (0.1.0), eslint + prettier, jest config, directory layout `src/` · `cli/` · `tests/` (matches `.agent-review`). Deps: `sharp`, `postcss-value-parser`. Dev: `jest`, `eslint`, `prettier`.
2. **Contract + layout-definition shape.** The `composite({ images, layout, meta }) → { buffer, contentType }` contract and the internal layout-definition tree the parsers produce and the engine consumes. Document the shape; validate at the boundary.
3. **Structure parser** (`src/parse/structure.js`, a class). DSL → layout tree. v1 grammar: `RxC` / `1`; single-operator `|` (columns) **or** `/` (rows) composites; one level; regions are grids or single cells. Validation + actionable errors. Unit tests (happy, each malformed class, the deferred-v2 forms rejected cleanly).
4. **Sizing parser** (`src/parse/sizing.js`, a class). Track template → ordered track sizes via `postcss-value-parser`, with the `fr`/`px`/`%`/`minmax()`/`auto` semantic layer; default equal (`1fr`); count must match region count. Unit tests per size kind + arity mismatch.
5. **Track-sizing engine** (`src/layout/track-sizing.js`). Given region count, parsed sizes, available length, and gap → pixel size per track: resolve fixed (`px`/`%`), clamp `minmax()`, size `auto`, then distribute remaining space across `fr` by weight. The CSS-grid-style algorithm; the highest-risk logic. Thorough unit tests (fr distribution, minmax clamping, auto, mixed, zero-leftover).
6. **Geometry** (`src/layout/geometry.js`). Structure tree + column track-sizing + row track-sizing + gap + margin → absolute rectangles per cell. Unit tests (grid, `|`, `/`, sub-grid cells uniform).
7. **Renderer** (`src/render/renderer.js`). Normalize each source image (rasterize/resize via sharp, SVG supported, aspect handling), place into its rect, output buffer. Golden-image tests.
8. **Public API** (`src/index.js`). `composite()` + file-output and base64 variants, wiring parse → size → geometry → render.
9. **CLI** (`cli/`, `bin`). `--layout`, `--col-sizes` / `--row-sizes`, `--gap`, `--margin`, `--images`, `--out`, `--format png|webp`. Thin wrapper over the library. CLI smoke test.
10. **README + package meta.** Usage (library + CLI), the DSL and sizing notation; `files`/`prepublish`; a `publish-to-layer.sh` stub for the Lambda layer (publishing itself is Scott's).

## Testing strategy

- Unit: parsers, track-sizing, geometry (deterministic, exhaustive on the sizing math).
- Golden-image: the renderer, for representative layouts (`3x4`; `1 | 3x2` with `--col-sizes "2fr 1fr"`; a `minmax()` case).
- CLI smoke: the examples above produce the expected files.
- Full suite green before the PR. `.agent-review` governs review scope; archie → koala → tess on the PR.

## Verification (end to end)

- `npm test` green.
- CLI: `image-composer --layout "1 | 3x2" --col-sizes "2fr 1fr" --gap 20 --images <12 pngs> --out /tmp/out.png` produces the expected composite; golden images match.

## Out of scope / later

- ADR-033 integration (new SQS queue, Lambda, `images_meta`, the editor) — Phase 2, in the api/stacks repos, planned when this package's contract is proven.
- v2 layout features: grouping `()`, mixing `|`/`/`, deeper nesting, named grid areas.
