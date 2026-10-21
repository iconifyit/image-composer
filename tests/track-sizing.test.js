'use strict';

const { resolveTracks } = require('../src/layout/track-sizing');

const fr = (value) => ({ type: 'fr', value });
const px = (value) => ({ type: 'px', value });
const pct = (value) => ({ type: 'percent', value });
const auto = () => ({ type: 'auto' });
const minmax = (min, max) => ({ type: 'minmax', min, max });

/**
 * resolveTracks(tracks, { available, gap }) -> pixel size per track.
 * Fixed tracks (px, %) take their resolved size; flexible tracks (fr, auto,
 * minmax) share the free space by weight, floored at their min and capped at
 * their max. Percentages resolve against `available`; gaps are subtracted from
 * the distributable space.
 */
describe('resolveTracks (v1 track-sizing engine)', () => {
    it('splits equal fr tracks evenly', () => {
        expect(resolveTracks([fr(1), fr(1)], { available: 100, gap: 0 })).toEqual([50, 50]);
    });

    it('splits weighted fr tracks by weight', () => {
        // Two parts to one: 60 / 30 of 90.
        expect(resolveTracks([fr(2), fr(1)], { available: 90, gap: 0 })).toEqual([60, 30]);
    });

    it('gives fixed px tracks their size and fr the remainder', () => {
        expect(resolveTracks([px(200), fr(1)], { available: 500, gap: 0 })).toEqual([200, 300]);
    });

    it('subtracts gaps from the distributable space', () => {
        // available 100, one 20px gap -> 80 usable -> 40/40.
        expect(resolveTracks([fr(1), fr(1)], { available: 100, gap: 20 })).toEqual([40, 40]);
    });

    it('resolves percentages against the available length', () => {
        expect(resolveTracks([pct(50), fr(1)], { available: 400, gap: 0 })).toEqual([200, 200]);
    });

    it('treats auto as a weight-1 flexible track', () => {
        expect(resolveTracks([auto(), fr(1)], { available: 100, gap: 0 })).toEqual([50, 50]);
    });

    it('leaves a minmax floor non-binding when the fair share already clears it', () => {
        // Both weight 1: the fair share (100) already exceeds the 50 floor, so the
        // floor does nothing and the split is even. Additive sizing would wrongly
        // add the floor on top (125 / 75); floored/capped sizing gives 100 / 100.
        expect(resolveTracks([minmax(px(50), fr(1)), fr(1)], { available: 200, gap: 0 })).toEqual([
            100, 100,
        ]);
    });

    it('floors a minmax(px, fr) track at its minimum when the fair share falls below it', () => {
        // Both weight 1: the fair share (100) is below the 120 floor, so t1 freezes
        // at 120 and the remaining 80 goes to the fr track.
        expect(resolveTracks([minmax(px(120), fr(1)), fr(1)], { available: 200, gap: 0 })).toEqual([
            120, 80,
        ]);
    });

    it('caps a minmax(px, px) track at its maximum and redistributes the excess', () => {
        // t1 grows to its 100 cap; the rest (300) goes to the fr track.
        expect(resolveTracks([minmax(px(50), px(100)), fr(1)], { available: 400, gap: 0 })).toEqual(
            [100, 300],
        );
    });

    it('resolves a floor and a cap together to the true fr size (not a single-sign sweep)', () => {
        // t0 floors at 100, t1 caps at 40, t2 is a plain fr. The fr size that makes
        // clamp(fr,100,inf) + clamp(fr,0,40) + fr = 150 is 25: t0 freezes at its 100
        // floor, leaving 50 for t1 and t2 (each fr 25), so t1 stays under its 40 cap.
        expect(
            resolveTracks([minmax(px(100), fr(1)), minmax(auto(), px(40)), fr(1)], {
                available: 150,
                gap: 0,
            }),
        ).toEqual([100, 25, 25]);
    });

    it('resolves a cap-dominated mix to the true fr size', () => {
        // t1 caps at 10; once it freezes there, the remaining 140 splits evenly
        // between t0 and t2 at fr 70, which clears t0's 60 floor.
        expect(
            resolveTracks([minmax(px(60), fr(1)), minmax(auto(), px(10)), fr(1)], {
                available: 150,
                gap: 0,
            }),
        ).toEqual([70, 10, 70]);
    });

    it('lets fixed tracks overflow a too-small container (no silent clamping)', () => {
        expect(resolveTracks([px(200), px(200)], { available: 300, gap: 0 })).toEqual([200, 200]);
    });

    it('handles three tracks with gaps', () => {
        // available 90, two 15px gaps -> 60 usable -> 20/20/20.
        expect(resolveTracks([fr(1), fr(1), fr(1)], { available: 90, gap: 15 })).toEqual([
            20, 20, 20,
        ]);
    });
});
