'use strict';

const { resolveTracks } = require('./track-sizing');

/**
 * @module layout/geometry
 *
 * Turns a layout tree (parse/structure) plus the output size, gap, margin, and
 * track templates into a flat list of cell rectangles in fill order — the
 * geometry the renderer places images into. See ADR-001.
 *
 * Plain grids are uniform. A split sizes its top-level regions with the matching
 * track template (colSizes for a `|` split, rowSizes for a `/` split) and each
 * region is itself a uniform sub-grid. Cells fill region-by-region, each region
 * row-major.
 *
 * @typedef {import('../parse/structure').LayoutNode} LayoutNode
 * @typedef {import('../parse/sizing').TrackSize} TrackSize
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 */

/** Equal (1fr) track list of length `n`. */
const equalTracks = (n) => Array.from({ length: n }, () => ({ type: 'fr', value: 1 }));

/**
 * Subdivide a rectangle into a uniform rows×cols grid, row-major, with `gap`.
 * @param {Rect} rect
 * @param {number} rows
 * @param {number} cols
 * @param {number} gap
 * @returns {Rect[]}
 */
const gridCells = (rect, rows, cols, gap) => {
    const colWidths = resolveTracks(equalTracks(cols), { available: rect.width, gap });
    const rowHeights = resolveTracks(equalTracks(rows), { available: rect.height, gap });

    const cells = [];
    let y = rect.y;
    for (let r = 0; r < rows; r += 1) {
        let x = rect.x;
        for (let c = 0; c < cols; c += 1) {
            cells.push({ x, y, width: colWidths[c], height: rowHeights[r] });
            x += colWidths[c] + gap;
        }
        y += rowHeights[r] + gap;
    }
    return cells;
};

/**
 * Compute the cell geometry for a layout.
 * @param {LayoutNode} layout - from the structure parser.
 * @param {object} opts
 * @param {number} opts.width - output width in px.
 * @param {number} opts.height - output height in px.
 * @param {number} [opts.gap=0] - gap between cells and regions, in px.
 * @param {number} [opts.margin=0] - outer frame inset, in px.
 * @param {TrackSize[]} [opts.colSizes] - region widths for a `|` split (default equal).
 * @param {TrackSize[]} [opts.rowSizes] - region heights for a `/` split (default equal).
 * @returns {{ width: number, height: number, cells: Rect[] }}
 */
const computeGeometry = (
    layout,
    { width, height, gap = 0, margin = 0, colSizes, rowSizes } = {},
) => {
    const inner = {
        x: margin,
        y: margin,
        width: width - 2 * margin,
        height: height - 2 * margin,
    };

    let cells;

    if (layout.kind === 'grid') {
        cells = gridCells(inner, layout.rows, layout.cols, gap);
    } else if (layout.kind === 'split') {
        const regions = layout.regions;
        cells = [];
        if (layout.direction === 'cols') {
            const widths = resolveTracks(colSizes || equalTracks(regions.length), {
                available: inner.width,
                gap,
            });
            let x = inner.x;
            regions.forEach((region, i) => {
                const rect = { x, y: inner.y, width: widths[i], height: inner.height };
                cells.push(...gridCells(rect, region.rows, region.cols, gap));
                x += widths[i] + gap;
            });
        } else {
            const heights = resolveTracks(rowSizes || equalTracks(regions.length), {
                available: inner.height,
                gap,
            });
            let y = inner.y;
            regions.forEach((region, i) => {
                const rect = { x: inner.x, y, width: inner.width, height: heights[i] };
                cells.push(...gridCells(rect, region.rows, region.cols, gap));
                y += heights[i] + gap;
            });
        }
    } else {
        throw new Error(`geometry: unknown layout node kind "${layout.kind}".`);
    }

    return { width, height, cells };
};

module.exports = { computeGeometry };
