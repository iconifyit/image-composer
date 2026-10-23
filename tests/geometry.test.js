'use strict';

const { computeGeometry } = require('../src/layout/geometry');

const grid = (rows, cols) => ({ kind: 'grid', rows, cols });
const split = (direction, regions) => ({ kind: 'split', direction, regions });
const fr = (value) => ({ type: 'fr', value });

/**
 * computeGeometry(layout, { width, height, gap, margin, colSizes, rowSizes })
 * -> { width, height, cells: [{ x, y, width, height }] } in fill order.
 * Plain grids are uniform; a split sizes its top-level regions via the matching
 * track template (colSizes for '|', rowSizes for '/') and each region is a
 * uniform sub-grid. Margin insets the whole frame; gap separates cells/regions.
 */
describe('computeGeometry (v1 layout geometry)', () => {
    it('lays a plain 1x2 grid across the canvas', () => {
        const geo = computeGeometry(grid(1, 2), { width: 100, height: 50, gap: 0, margin: 0 });
        expect(geo.cells).toEqual([
            { x: 0, y: 0, width: 50, height: 50 },
            { x: 50, y: 0, width: 50, height: 50 },
        ]);
    });

    it('lays a plain 2x2 grid in row-major order', () => {
        const geo = computeGeometry(grid(2, 2), { width: 100, height: 100, gap: 0, margin: 0 });
        expect(geo.cells).toEqual([
            { x: 0, y: 0, width: 50, height: 50 },
            { x: 50, y: 0, width: 50, height: 50 },
            { x: 0, y: 50, width: 50, height: 50 },
            { x: 50, y: 50, width: 50, height: 50 },
        ]);
    });

    it('insets the frame by the margin', () => {
        const geo = computeGeometry(grid(1, 1), { width: 100, height: 100, gap: 0, margin: 10 });
        expect(geo.cells).toEqual([{ x: 10, y: 10, width: 80, height: 80 }]);
    });

    it('subtracts the gap between cells', () => {
        const geo = computeGeometry(grid(1, 2), { width: 100, height: 50, gap: 20, margin: 0 });
        expect(geo.cells).toEqual([
            { x: 0, y: 0, width: 40, height: 50 },
            { x: 60, y: 0, width: 40, height: 50 },
        ]);
    });

    it('lays a "1 | 3x2" columns split: a full-height cell beside a uniform 3x2 grid', () => {
        // colSizes [2fr, 1fr] over width 300 -> regions 200 / 100.
        const geo = computeGeometry(split('cols', [grid(1, 1), grid(3, 2)]), {
            width: 300,
            height: 300,
            gap: 0,
            margin: 0,
            colSizes: [fr(2), fr(1)],
        });
        // Region 0 (1x1) fills its 200x300 column; region 1 (3x2) subdivides 100x300.
        expect(geo.cells[0]).toEqual({ x: 0, y: 0, width: 200, height: 300 });
        expect(geo.cells).toHaveLength(1 + 6);
        // First cell of the 3x2 region: top-left of the right column, 50x100.
        expect(geo.cells[1]).toEqual({ x: 200, y: 0, width: 50, height: 100 });
        // Last cell of the 3x2 region: bottom-right.
        expect(geo.cells[6]).toEqual({ x: 250, y: 200, width: 50, height: 100 });
    });

    it('lays a "1x2 / 1x2" rows split stacked top to bottom', () => {
        const geo = computeGeometry(split('rows', [grid(1, 2), grid(1, 2)]), {
            width: 100,
            height: 100,
            gap: 0,
            margin: 0,
        });
        expect(geo.cells).toEqual([
            { x: 0, y: 0, width: 50, height: 50 },
            { x: 50, y: 0, width: 50, height: 50 },
            { x: 0, y: 50, width: 50, height: 50 },
            { x: 50, y: 50, width: 50, height: 50 },
        ]);
    });
});
