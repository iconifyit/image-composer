# ADR-002: Composite placement model — consistent square cells, centered block

This is the pointer document for ADR-002. It always links to the current version.

- **Current version:** [ADR-002-composite-placement-model-0.0.1.md](./ADR-002-composite-placement-model-0.0.1.md)
- **Status:** Accepted

## Summary

Within each region, cells are equal squares; within a split, the primary columns are distributed across the full image by their visible (live) content, so the outer margins and inter-column gutters are a single consistent value measured between what the eye actually sees — not the padded cells. This replaces ADR-001's region-filling sub-grid so composites read as evenly spaced instead of letting icons float against the region edges. Supersedes the cell-placement behavior in ADR-001 §3 and §4.

## Version history

- **0.0.1** (2026-10-24) — Accepted.
