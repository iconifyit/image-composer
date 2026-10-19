# ADR-001: image-composer — a general image-compositing package

- **Status:** Proposed
- **Date:** 2026-10-18
- **Deciders:** Scott (owner), Claude (author)

## Context

Many applications need to compose a set of source images into a single output image — a grid of thumbnails, a stacked card, a contact sheet — at defined dimensions with margins and insets. This is a general, reusable capability, but it is usually re-implemented ad hoc and entangled with the surrounding application's domain logic (which images to pick, where to store the result), which makes it hard to test, reuse, or run outside that application.

`image-composer` is a standalone, open-source package that provides just the compositing capability behind a small, pure contract, usable both as a library and as a command-line tool. It has no knowledge of any particular application's domain: the caller decides *which* images and *which* layout; the package only knows how to render them.

## Decision

Build `image-composer` as a focused, pure package with a dual (library + CLI) interface over one core.

### 1. Dual interface — library and CLI

- **Library:** `composite(input) → output`, imported by any Node consumer (including a serverless function).
- **CLI:** a `bin` entry so the same core runs from the command line for local use and testing:

  ```text
  image-composer --layout "1 | 3x2" --col-sizes "2fr 1fr" --gap 20 --images <paths…> --out <file>
  ```

  The `--layout` value uses the layout notation defined below; sizing, gaps, and margins are supplied as separate flags (see "Layout model and notation").

### 2. A pure contract — images in, image out

The package is **pure**: it takes pre-selected images plus a layout/config and returns a composite image. It has **no cloud, storage, database, or network coupling** — those belong to the consumer. Shape:

```text
composite({
  images,   // ordered list of source images (paths or buffers), already selected by the caller
  layout,   // the layout to render: a {rows}x{cols} grid or a named layout, with margins / inset / background
  meta,     // optional per-render inputs the chosen layout needs
}) -> { buffer, contentType }   // file-output and base64 variants are also provided
```

Selection and placement policy stay in the caller; geometry and rendering stay in the package.

### 3. Layout model and notation (v1)

A layout is described by a small text notation. The string carries *structure*; sizing is supplied separately (below), so the structure stays instantly readable.

**Structure.**
- **Plain grid:** `RxC` — rows × cols (e.g. `3x4`). `1` is a single cell. Axis order is **rows first**, matching the common `numRows, numCols` convention; the CLI also accepts `--rows` / `--cols` as the unambiguous long form.
- **Composite (one level of nesting):** regions joined by a **single** operator — `|` (columns, side by side) **or** `/` (rows, stacked), not both in one layout. Each region is a grid `RxC` or a cell `1`. Examples: `1 | 3x2` (a cell beside a 3×2 grid), `2x2 | 2x2`, `1x4 / 1x4`. A region cannot itself contain a further split.

**Sizing — separate templates, CSS-grid style.** Proportions live in their own flags, not in the structure string:
- `--col-sizes` for a `|` split, `--row-sizes` for a `/` split, using `fr` and fixed `px` (e.g. `"2fr 1fr"`, `"200px 1fr"`), defaulting to equal (`1fr` each). The count must match the number of regions. This mirrors `grid-template-columns` / `grid-template-rows`.
- Cells within a sub-grid are uniform in v1.

**Spacing / frame.** `gap` between cells and regions; `margin` / `padding` for the outer frame — CSS naming.

**Deferred to v2 (not needed for the first version):** v1 is a **single-operator, one-level** layout. Grouping (`()`), mixing `|` and `/` in the same layout, and nesting beyond one level are facets of the same capability — all three need a grouping mechanism — so they arrive together in v2. The one independent deferral is **advanced sizing** (`minmax()`, `auto`, named grid areas); v1 sizing is `fr` and fixed `px` only. Keeping v1 to this scope makes the parser and validator trivial.

### 4. Internal design — data-driven layouts, composition over inheritance

- **Layouts are data, not subclasses.** The notation above is sugar over a declarative layout definition (regions, their grids, sizes, gaps, background). One renderer reads a layout definition and places images into it — no method-per-layout.
- **Source-format differences are input normalization, not a type hierarchy.** Differences between source image kinds (for example rasterizing and sizing SVG vs. raster inputs) are handled when normalizing the input images, not by a class per kind.
- **Two parsers, each its own class.** Parsing mirrors the structure/sizing split: a **structure parser** turns the layout DSL (`1 | 3x2`, operators, grids) into the layout tree; a **sizing parser** turns the track templates (`2fr 1fr`, `200px 1fr`) into track sizes. Separate classes keep each independently testable.
- **Reuse for sizing; hand-write structure.** The sizing templates are CSS track-list syntax, so the sizing parser reuses the mature `postcss-value-parser` to tokenize (it handles space-separated lists and functions like `minmax()`/`repeat()`), adding only a thin layer that maps each token to a track size (`1fr` → `{fr:1}`, `200px` → `{px:200}`). `css-tree` is the heavier full-CSS alternative if typed nodes are ever needed; no dedicated `fr`/`minmax` track parser exists, so the semantic mapping is ours regardless. The structure DSL has no off-the-shelf parser — for v1's single-operator, one-level grammar it is a small hand-written recursive-descent parser, with a PEG generator (peggy/ohm-js) deferred to v2 when grouping and nesting arrive.
- The result is a small package: input normalization, the two parsers, a set of layout definitions, a renderer, and the library/CLI entry points.

### 5. Packaging and distribution

- Published to npm as **`@atomiclotus/image-composer`**, open source (`github.com/iconifyit/image-composer`).
- Also buildable as an AWS Lambda layer, so serverless consumers can load it without bundling.
- Semantic versioning; the library and CLI ship from the same package.

### 6. Phasing

- **Phase 1:** build and prove the package in isolation — the contract, library, and CLI, with unit tests plus CLI and golden-image checks, developed and run locally before any consumer depends on it.
- **Later:** consumers adopt the published package as a dependency. (Any specific consumer's integration — queues, storage, persistence — is that consumer's design, documented in that consumer's repo, not here.)

## Consequences

### Positive

- A clean, pure, independently-tested and -versioned capability, reusable by any consumer and runnable from the command line.
- A small surface: data-driven layouts and input normalization avoid a class tree while remaining extensible with new layout definitions.
- No domain coupling, enforced by being a public, general-purpose package.

### Negative

- A published package to maintain (versioning, release, Lambda-layer build).

## Alternatives considered

### A class taxonomy (a base composer with per-kind subclasses)
Not needed. Because the package is pure (images + layout in, image out), what varies between use cases — which images, which layout — is a caller concern, and source-format differences are input normalization. Declarative layout definitions plus one renderer express the variation with far less surface than a class hierarchy.

### Embedding the capability inside a consumer and extracting later
Rejected in favor of a standalone package from the start: a clean boundary and independent tests/versioning from day one, with no deferred extraction.

## Open questions / TBD (implementation detail)

1. Rendering implementation (the raster/SVG library used under the hood) — an implementation choice to settle in the build, not an architectural decision here.

## Code being removed

None. This is a new package.
