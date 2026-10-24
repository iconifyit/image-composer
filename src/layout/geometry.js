'use strict';

const { resolveTracks } = require('./track-sizing');

/**
 * @module layout/geometry
 *
 * Turns a layout tree (parse/structure) plus the output size, gap, margin, track
 * templates, and per-image content sizes into a flat list of cell rectangles in
 * fill order — the geometry the renderer places images into. See ADR-002.
 *
 * Within a region, cells are equal squares laid out as a block. A plain grid
 * centers that block in the margin-inset area. A split sizes each region's cells
 * from the matching track template (colSizes for `|`, rowSizes for `/`), then
 * distributes the regions across the full image by their LIVE content — each
 * region's block minus the padding on its outermost icons — so the gutter before
 * the first, between each pair, and after the last are one value. Cells fill
 * region-by-region, each region row-major.
 *
 * @typedef {import('../parse/structure').LayoutNode} LayoutNode
 * @typedef {import('../parse/sizing').TrackSize} TrackSize
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 */

/** Equal (1fr) track list of length `n`. */
const equalTracks = (n) => Array.from({ length: n }, () => ({ type: 'fr', value: 1 }));

/**
 * The side of the largest square cell that lets a rows×cols block (cells plus
 * gaps) fit `width` × `height` on both axes. See ADR-002.
 * @param {number} width
 * @param {number} height
 * @param {number} rows
 * @param {number} cols
 * @param {number} gap
 * @returns {number}
 */
const squareBox = (width, height, rows, cols, gap) =>
    Math.max(1, Math.min((width - (cols - 1) * gap) / cols, (height - (rows - 1) * gap) / rows));

/** Length a line of `count` cells of side `box` occupies, including the gaps between them. */
const blockExtent = (box, count, gap) => count * box + (count - 1) * gap;

/**
 * The largest drawn-inked extent, along one axis, among the images at `indices`.
 * The renderer fits each image inside the cell's inner box — the square side minus
 * `inset` on each edge — so content is scaled by `(box - 2*inset) / max(src)`. This
 * is how far the visible content reaches inside the outermost cells of a block, so
 * half the leftover `box - thisExtent` is the padding to trim off the block edge
 * when measuring a column's live area. Missing/absent images contribute nothing.
 * @param {number[]} indices - image indices occupying the cells of interest.
 * @param {{srcW:number,srcH:number,inkedW:number,inkedH:number}[]|undefined} contentSizes
 * @param {number} box - square cell side.
 * @param {number} inset - padding inside each cell (the renderer's `inset`).
 * @param {'w'|'h'} axis - measure inked width or inked height.
 * @returns {number}
 */
const maxDrawnInked = (indices, contentSizes, box, inset, axis) => {
    const innerBox = Math.max(0, box - 2 * inset);
    let max = 0;
    for (const index of indices) {
        const content = contentSizes && contentSizes[index];
        if (!content) {
            continue;
        }
        const scale = innerBox / Math.max(content.srcW, content.srcH);
        const drawn = (axis === 'w' ? content.inkedW : content.inkedH) * scale;
        if (drawn > max) {
            max = drawn;
        }
    }
    return max;
};

/**
 * Subdivide a rectangle into a rows×cols block of equal square cells, row-major,
 * separated by `gap`, with the block centered in the rectangle on both axes. See
 * ADR-002.
 *
 * @param {Rect} rect
 * @param {number} rows
 * @param {number} cols
 * @param {number} gap
 * @returns {Rect[]}
 */
const gridCells = (rect, rows, cols, gap) => {
    const box = squareBox(rect.width, rect.height, rows, cols, gap);
    const originX = rect.x + (rect.width - blockExtent(box, cols, gap)) / 2;
    const originY = rect.y + (rect.height - blockExtent(box, rows, gap)) / 2;

    const cells = [];
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            cells.push({
                x: originX + c * (box + gap),
                y: originY + r * (box + gap),
                width: box,
                height: box,
            });
        }
    }
    return cells;
};

/**
 * Measure one region of a split for live-area distribution. Produces the region's
 * block extent along the split axis, the live (visible-content) extent inside that
 * block, and the padding from the block's leading edge to where the live content
 * starts — so the caller can distribute columns by their live content, not by the
 * padding each source carries. Images fill the region's cells in row-major order
 * starting at `imageStart`. See ADR-002.
 *
 * @param {{rows:number, cols:number}} region
 * @param {number} box - square cell side for this region.
 * @param {number} gap
 * @param {number} imageStart - index of the first image in this region.
 * @param {object[]|undefined} contentSizes - per-image measured sizes, or undefined.
 * @param {number} inset - padding inside each cell (the renderer's `inset`).
 * @param {'cols'|'rows'} direction - split axis.
 * @returns {{ block: number, live: number, leadPad: number }}
 */
const measureRegion = (region, box, gap, imageStart, contentSizes, inset, direction) => {
    const [tracks, lines, axis] =
        direction === 'cols' ? [region.cols, region.rows, 'w'] : [region.rows, region.cols, 'h'];
    const block = blockExtent(box, tracks, gap);

    if (!contentSizes) {
        return { block, live: block, leadPad: 0 };
    }

    // Image indices occupying the leading and trailing track (column for `cols`,
    // row for `rows`) across all lines of the region.
    const leading = [];
    const trailing = [];
    for (let line = 0; line < lines; line += 1) {
        const base = imageStart + line * (direction === 'cols' ? region.cols : 1);
        const step = direction === 'cols' ? 1 : region.cols;
        leading.push(base);
        trailing.push(base + (tracks - 1) * step);
    }

    const leadPad = (box - maxDrawnInked(leading, contentSizes, box, inset, axis)) / 2;
    const trailPad = (box - maxDrawnInked(trailing, contentSizes, box, inset, axis)) / 2;
    return { block, live: block - leadPad - trailPad, leadPad };
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
 * @param {number} [opts.inset=0] - padding inside each cell; the live-area measurement
 *   accounts for it so split gutters stay uniform when `inset` is set.
 * @param {object[]} [opts.contentSizes] - per-image measured source and inked sizes,
 *   in fill order; enables live-area column distribution.
 * @returns {{ width: number, height: number, cells: Rect[] }}
 */
const computeGeometry = (
    layout,
    { width, height, gap = 0, margin = 0, inset = 0, colSizes, rowSizes, contentSizes } = {},
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

        // Track templates size each region's block (unchanged). The blocks are then
        // distributed across the FULL axis by their LIVE content width: one equal
        // gutter before the first column, between each pair, and after the last, where
        // every gutter is measured between the visible content — not the padded cells —
        // so the outer margins and inter-column gutters are a single consistent value.
        // See ADR-002.
        const tracks = resolveTracks(
            (layout.direction === 'cols' ? colSizes : rowSizes) || equalTracks(regions.length),
            { available: layout.direction === 'cols' ? inner.width : inner.height, gap },
        );

        let imageStart = 0;
        const columns = regions.map((region, i) => {
            const box =
                layout.direction === 'cols'
                    ? squareBox(tracks[i], inner.height, region.rows, region.cols, gap)
                    : squareBox(inner.width, tracks[i], region.rows, region.cols, gap);
            const measured = measureRegion(
                region,
                box,
                gap,
                imageStart,
                contentSizes,
                inset,
                layout.direction,
            );
            imageStart += region.rows * region.cols;
            return { region, ...measured };
        });

        const totalLive = columns.reduce((sum, col) => sum + col.live, 0);
        const span = layout.direction === 'cols' ? width : height;
        const gutter = (span - totalLive) / (regions.length + 1);

        let liveStart = gutter;
        columns.forEach((col) => {
            const blockStart = liveStart - col.leadPad;
            const rect =
                layout.direction === 'cols'
                    ? { x: blockStart, y: 0, width: col.block, height }
                    : { x: 0, y: blockStart, width, height: col.block };
            cells.push(...gridCells(rect, col.region.rows, col.region.cols, gap));
            liveStart += col.live + gutter;
        });
    } else {
        throw new Error(`geometry: unknown layout node kind "${layout.kind}".`);
    }

    return { width, height, cells };
};

module.exports = { computeGeometry };
