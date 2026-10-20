'use strict';

const { StructureParser } = require('../src/parse/structure');

/**
 * The structure parser turns the v1 layout DSL into a layout tree:
 *   - a plain grid  -> { kind: 'grid', rows, cols }   ('1' is 1x1)
 *   - a one-level composite -> { kind: 'split', direction: 'cols'|'rows', regions: [grid, ...] }
 *     where `|` = columns (side by side) and `/` = rows (stacked), and each region is a grid.
 * v1 is single-operator and one-level: no grouping, no mixing `|`/`/`, no deeper nesting.
 */
describe('StructureParser (v1 layout DSL)', () => {
    const parse = (s) => new StructureParser().parse(s);

    describe('plain grids', () => {
        // A bare RxC is a single uniform grid, rows first.
        it('parses "3x4" as a 3-row, 4-col grid', () => {
            expect(parse('3x4')).toEqual({ kind: 'grid', rows: 3, cols: 4 });
        });

        // "1" is the single-cell shorthand (1x1), the smallest region.
        it('parses "1" as a single 1x1 cell', () => {
            expect(parse('1')).toEqual({ kind: 'grid', rows: 1, cols: 1 });
        });

        // Whitespace around a plain grid is insignificant.
        it('ignores surrounding whitespace', () => {
            expect(parse('  2x3  ')).toEqual({ kind: 'grid', rows: 2, cols: 3 });
        });
    });

    describe('composites', () => {
        // "|" lays regions out as columns (left to right): a single cell beside a 3x2 grid.
        it('parses "1 | 3x2" as a columns split of [1x1, 3x2]', () => {
            expect(parse('1 | 3x2')).toEqual({
                kind: 'split',
                direction: 'cols',
                regions: [
                    { kind: 'grid', rows: 1, cols: 1 },
                    { kind: 'grid', rows: 3, cols: 2 },
                ],
            });
        });

        // "/" stacks regions as rows (top to bottom).
        it('parses "1x4 / 1x4" as a rows split of [1x4, 1x4]', () => {
            expect(parse('1x4 / 1x4')).toEqual({
                kind: 'split',
                direction: 'rows',
                regions: [
                    { kind: 'grid', rows: 1, cols: 4 },
                    { kind: 'grid', rows: 1, cols: 4 },
                ],
            });
        });

        // Three regions, and the operator binds the same way regardless of spacing.
        it('parses "2x2|2x2|1" (no spaces, three regions) as a columns split', () => {
            expect(parse('2x2|2x2|1')).toEqual({
                kind: 'split',
                direction: 'cols',
                regions: [
                    { kind: 'grid', rows: 2, cols: 2 },
                    { kind: 'grid', rows: 2, cols: 2 },
                    { kind: 'grid', rows: 1, cols: 1 },
                ],
            });
        });
    });

    describe('invalid input (rejected with a clear message)', () => {
        // Empty is not a layout.
        it('rejects an empty string', () => {
            expect(() => parse('')).toThrow();
            expect(() => parse('   ')).toThrow();
        });

        // Grouping is a v2 capability; v1 must reject it rather than silently mis-parse.
        it('rejects grouping "()" as a v2 feature', () => {
            expect(() => parse('1 | (3x2 / 1x1)')).toThrow(/v2|group/i);
        });

        // Mixing both operators needs grouping precedence -> v2.
        it('rejects mixing "|" and "/" in one layout', () => {
            expect(() => parse('1 | 3x2 / 2x2')).toThrow(/v2|mix/i);
        });

        // A region must be `1` or `RxC`; anything else is invalid.
        it('rejects a non-grid region token', () => {
            expect(() => parse('1 | foo')).toThrow();
        });

        // A bare integer other than 1 is ambiguous (not a defined region).
        it('rejects a bare integer other than 1', () => {
            expect(() => parse('2 | 3x2')).toThrow();
        });

        // Zero-size tracks are meaningless.
        it('rejects non-positive grid dimensions', () => {
            expect(() => parse('0x3')).toThrow();
            expect(() => parse('3x0')).toThrow();
        });
    });
});
