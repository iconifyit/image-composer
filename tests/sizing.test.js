'use strict';

const { SizingParser } = require('../src/parse/sizing');

/**
 * The sizing parser turns a CSS-grid-style track template into an ordered list of
 * track sizes, one per region. v1 vocabulary: fr, px, %, auto, minmax(). An empty
 * template defaults to equal (1fr) tracks. The track count must match the region
 * count. Tokenization is delegated to postcss-value-parser; this layer adds the
 * fr/px/%/auto/minmax semantics.
 */
describe('SizingParser (v1 track templates)', () => {
    const parse = (tpl, count) => new SizingParser().parse(tpl, count);

    describe('single-kind tracks', () => {
        it('parses fr tracks', () => {
            expect(parse('2fr 1fr', 2)).toEqual([
                { type: 'fr', value: 2 },
                { type: 'fr', value: 1 },
            ]);
        });

        it('parses fixed px tracks', () => {
            expect(parse('200px 1fr', 2)).toEqual([
                { type: 'px', value: 200 },
                { type: 'fr', value: 1 },
            ]);
        });

        it('parses percentage tracks', () => {
            expect(parse('50% 1fr', 2)).toEqual([
                { type: 'percent', value: 50 },
                { type: 'fr', value: 1 },
            ]);
        });

        it('parses auto tracks', () => {
            expect(parse('auto 1fr', 2)).toEqual([{ type: 'auto' }, { type: 'fr', value: 1 }]);
        });

        it('parses fractional fr values', () => {
            expect(parse('1.5fr 1fr', 2)).toEqual([
                { type: 'fr', value: 1.5 },
                { type: 'fr', value: 1 },
            ]);
        });
    });

    describe('minmax()', () => {
        // minmax(min, max): min is a fixed/auto track, max may be flexible (fr).
        it('parses minmax(px, fr)', () => {
            expect(parse('minmax(120px, 1fr) 2fr', 2)).toEqual([
                { type: 'minmax', min: { type: 'px', value: 120 }, max: { type: 'fr', value: 1 } },
                { type: 'fr', value: 2 },
            ]);
        });

        // A flexible (fr) minimum is invalid in CSS track sizing.
        it('rejects an fr minimum in minmax()', () => {
            expect(() => parse('minmax(1fr, 2fr) 1fr', 2)).toThrow(/minmax|fr/i);
        });
    });

    describe('defaults', () => {
        // No template -> every region is an equal 1fr track.
        it('defaults an empty template to equal fr tracks', () => {
            const expected = [
                { type: 'fr', value: 1 },
                { type: 'fr', value: 1 },
                { type: 'fr', value: 1 },
            ];
            expect(parse(undefined, 3)).toEqual(expected);
            expect(parse('', 3)).toEqual(expected);
            expect(parse('   ', 3)).toEqual(expected);
        });
    });

    describe('invalid input', () => {
        // The track count must line up with the number of regions.
        it('rejects a track count that does not match the region count', () => {
            expect(() => parse('2fr 1fr', 3)).toThrow(/count|region|track/i);
        });

        it('rejects an unknown token', () => {
            expect(() => parse('2fr foo', 2)).toThrow();
        });

        it('rejects a bare unitless number', () => {
            expect(() => parse('2 1fr', 2)).toThrow();
        });

        it('rejects a negative track size', () => {
            expect(() => parse('-1fr 1fr', 2)).toThrow();
        });

        // repeat() is a v2 convenience, not in the v1 vocabulary.
        it('rejects repeat() as outside the v1 vocabulary', () => {
            expect(() => parse('repeat(2, 1fr)', 2)).toThrow(/repeat|v2|unsupported/i);
        });
    });
});
