# ADR-001: image-composer — a general image-compositing package

This is the pointer document for ADR-001. It always links to the current version.

- **Current version:** [ADR-001 v0.0.1](./ADR-001-image-composer-0.0.1.md)
- **Status:** Accepted
- **Implementation plan:** [imp/ADR-001-image-composer-implementation-plan.md](./imp/ADR-001-image-composer-implementation-plan.md)

## Summary

`image-composer` is a standalone, open-source package (`@atomiclotus/image-composer`) that composes a set of pre-selected images into a single output image through a small, **pure** contract — `composite({ images, layout, meta }) → image` — with **no cloud/storage/DB/network coupling**. It ships a **library and a CLI** over one core. Layouts use a small **notation** — `RxC` grids (rows × cols) and one-level composites joined by `|` (columns) or `/` (rows), e.g. `1 | 3x2` — with sizing supplied separately, CSS-grid style (`--col-sizes "2fr 1fr"`, `gap`, `margin`); the string is sugar over a declarative layout definition rendered by one renderer. Source-format differences are handled by input normalization rather than a class hierarchy. Phase 1 builds and proves the package in isolation; consumers adopt it as a published dependency, and any consumer's own integration is documented in that consumer's repo.

## Version history

| Version                                    | Date       | Status   | Notes                                                                                                                                                 |
| ------------------------------------------ | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0.0.1](./ADR-001-image-composer-0.0.1.md) | 2026-10-18 | Accepted | Initial design of the standalone image-composer package (pure contract, library + CLI, data-driven layouts, full v1 track sizing, two-parser design). |
