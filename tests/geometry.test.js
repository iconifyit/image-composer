'use strict';

const { computeGeometry } = require('../src/layout/geometry');

const grid = (rows, cols) => ({ kind: 'grid', rows, cols });
const split = (direction, regions) => ({ kind: 'split', direction, regions });
const fr = (value) => ({ type: 'fr', value });

/** `n` square sources with no padding (inked == source), so live area == cell. */
const fullInk = (n, size = 100) =>
    Array.from({ length: n }, () => ({ srcW: size, srcH: size, inkedW: size, inkedH: size }));

/** `n` square sources whose inked content is `frac` of the source, centered. */
const paddedInk = (n, frac, size = 100) =>
    Array.from({ length: n }, () => ({
        srcW: size,
        srcH: size,
        inkedW: size * frac,
        inkedH: size * frac,
    }));

const EPSILON = 1e-6;
const approxEqual = (a, b) => Math.abs(a - b) < 1e-4;

/**
 * The gutters between the visible (inked) content of consecutive column blocks,
 * plus the leading and trailing gutters to the image edges, along one axis. Mirrors
 * how the renderer centers each image's inked content within its square cell.
 */
const liveGutters = (geo, contentSizes, regionCellCounts, axis) => {
    const span = axis === 'x' ? geo.width : geo.height;
    let index = 0;
    const bounds = regionCellCounts.map((count) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (let k = 0; k < count; k += 1) {
            const cell = geo.cells[index];
            const content = contentSizes[index];
            index += 1;
            const side = axis === 'x' ? cell.width : cell.height;
            const start = axis === 'x' ? cell.x : cell.y;
            const inked =
                (axis === 'x' ? content.inkedW : content.inkedH) *
                (side / Math.max(content.srcW, content.srcH));
            lo = Math.min(lo, start + (side - inked) / 2);
            hi = Math.max(hi, start + (side + inked) / 2);
        }
        return { lo, hi };
    });

    const gutters = [bounds[0].lo];
    for (let i = 1; i < bounds.length; i += 1) {
        gutters.push(bounds[i].lo - bounds[i - 1].hi);
    }
    gutters.push(span - bounds[bounds.length - 1].hi);
    return gutters;
};

describe('computeGeometry (ADR-002 placement model)', () => {
    describe('plain grids — square cells, centered block', () => {
        it('centers equal square cells and splits the leftover as symmetric margins', () => {
            // 1x2 over 100x50 with a 20px gap: box = min((100-20)/2, 50) = 40 (square),
            // block 100x40 centered vertically -> 5px top and bottom.
            const geo = computeGeometry(grid(1, 2), { width: 100, height: 50, gap: 20, margin: 0 });
            expect(geo.cells).toEqual([
                { x: 0, y: 5, width: 40, height: 40 },
                { x: 60, y: 5, width: 40, height: 40 },
            ]);
        });

        it('centers a single square cell in a non-square canvas', () => {
            // 1x1 over 200x100: box = min(200,100) = 100, centered -> x offset 50.
            const geo = computeGeometry(grid(1, 1), { width: 200, height: 100, gap: 0, margin: 0 });
            expect(geo.cells).toEqual([{ x: 50, y: 0, width: 100, height: 100 }]);
        });

        it('insets the sizing area by the margin before centering', () => {
            const geo = computeGeometry(grid(1, 1), {
                width: 100,
                height: 100,
                gap: 0,
                margin: 10,
            });
            expect(geo.cells).toEqual([{ x: 10, y: 10, width: 80, height: 80 }]);
        });
    });

    describe('splits — even gutters between live content', () => {
        it('distributes columns by block when content is unpadded (live == cell)', () => {
            // Two 1x1 columns, fully-inked: live == cell, 100px each over 300 -> 33.3 gutters.
            const contentSizes = fullInk(2);
            const geo = computeGeometry(split('cols', [grid(1, 1), grid(1, 1)]), {
                width: 300,
                height: 100,
                gap: 0,
                margin: 0,
                colSizes: [fr(1), fr(1)],
                contentSizes,
            });
            geo.cells.forEach((c) => expect(c.width).toBeCloseTo(c.height));
            const gutters = liveGutters(geo, contentSizes, [1, 1], 'x');
            gutters.forEach((g) => expect(approxEqual(g, gutters[0])).toBe(true));
        });

        it('excludes source padding from column width, widening the gutters', () => {
            // Same layout, but each icon's inked content is half its source. The live
            // widths are smaller, so the (still uniform) gutters are strictly larger
            // than the unpadded case — proving distribution is by live content, not cells.
            const padded = paddedInk(2, 0.5);
            const geo = computeGeometry(split('cols', [grid(1, 1), grid(1, 1)]), {
                width: 300,
                height: 100,
                gap: 0,
                margin: 0,
                colSizes: [fr(1), fr(1)],
                contentSizes: padded,
            });
            const paddedGutters = liveGutters(geo, padded, [1, 1], 'x');
            paddedGutters.forEach((g) => expect(approxEqual(g, paddedGutters[0])).toBe(true));

            const full = fullInk(2);
            const fullGeo = computeGeometry(split('cols', [grid(1, 1), grid(1, 1)]), {
                width: 300,
                height: 100,
                gap: 0,
                margin: 0,
                colSizes: [fr(1), fr(1)],
                contentSizes: full,
            });
            const fullGutters = liveGutters(fullGeo, full, [1, 1], 'x');
            expect(paddedGutters[0]).toBeGreaterThan(fullGutters[0] + EPSILON);
        });

        it('distributes a rows split by live content on the vertical axis', () => {
            // '1 / 1x2' stacked: feature row above a 1x2 row, padded content.
            const padded = paddedInk(3, 0.6);
            const geo = computeGeometry(split('rows', [grid(1, 1), grid(1, 2)]), {
                width: 200,
                height: 400,
                gap: 0,
                margin: 0,
                rowSizes: [fr(1), fr(1)],
                contentSizes: padded,
            });
            const gutters = liveGutters(geo, padded, [1, 2], 'y');
            gutters.forEach((g) => expect(approxEqual(g, gutters[0])).toBe(true));
        });

        it('sizes region cells by the track template (2fr feature larger than 1fr grid)', () => {
            const geo = computeGeometry(split('cols', [grid(1, 1), grid(3, 2)]), {
                width: 600,
                height: 300,
                gap: 0,
                margin: 0,
                colSizes: [fr(2), fr(1)],
                contentSizes: fullInk(7),
            });
            const featureCell = geo.cells[0];
            const gridCell = geo.cells[1];
            // The 2fr feature column yields a larger square cell than the 1fr grid.
            expect(featureCell.width).toBeGreaterThan(gridCell.width);
            geo.cells.forEach((c) => expect(c.width).toBeCloseTo(c.height));
        });

        it('falls back to block distribution when content sizes are absent', () => {
            // Without contentSizes the live area is the whole block; cells are still
            // square and the block gutters are uniform.
            const geo = computeGeometry(split('cols', [grid(1, 1), grid(1, 1)]), {
                width: 300,
                height: 100,
                gap: 0,
                margin: 0,
                colSizes: [fr(1), fr(1)],
            });
            geo.cells.forEach((c) => expect(c.width).toBeCloseTo(c.height));
            const blockGutters = liveGutters(geo, fullInk(2), [1, 1], 'x');
            blockGutters.forEach((g) => expect(approxEqual(g, blockGutters[0])).toBe(true));
        });
    });
});
