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
  image-composer --layout 3x5 --margin <px> --images <paths…> --out <file>
  ```

  A grid layout is given as `{rows}x{cols}` (e.g. `3x5`, `2x3`); margins are settable; named non-grid layouts (such as a vertical stack) are also selectable.

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

### 3. Internal design — data-driven layouts, composition over inheritance

- **Layouts are data, not subclasses.** Each layout is a declarative definition (a `{rows}x{cols}` grid or a vertical stack, each with margins, inset, and background). One renderer reads a layout definition and places images into it — no method-per-layout.
- **Source-format differences are input normalization, not a type hierarchy.** Differences between source image kinds (for example rasterizing and sizing SVG vs. raster inputs) are handled when normalizing the input images, not by a class per kind.
- The result is a small package: input normalization, a set of layout definitions, a renderer, and the library/CLI entry points.

### 4. Packaging and distribution

- Published to npm as **`@atomiclotus/image-composer`**, open source (`github.com/iconifyit/image-composer`).
- Also buildable as an AWS Lambda layer, so serverless consumers can load it without bundling.
- Semantic versioning; the library and CLI ship from the same package.

### 5. Phasing

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
