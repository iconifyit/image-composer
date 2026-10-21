'use strict';

/**
 * @module layout/track-sizing
 *
 * Resolves a list of track sizes (from parse/sizing) into pixel sizes along one
 * axis, given the available length and the gap between tracks. See ADR-001.
 *
 * A pixel compositor has no content flow, so sizing is defined uniformly: every
 * track is either FIXED (`px`, `%`) or FLEXIBLE (`fr`, `auto`, `minmax`) with a
 * weight, a floor (`min`) and a cap (`max`). `auto` is a weight-1 flexible track
 * (there is no content to size to); `minmax(min, max)` is flexible, floored at
 * `min` and capped at `max` (unbounded when the max is `fr`).
 *
 * After the fixed tracks take their pixels, the flexible tracks share whatever
 * remains. Each one resolves to `clamp(fr * weight, min, max)` for a single flex
 * factor `fr` chosen so the flexible sizes sum to that remaining space. `fr` is
 * found by iterative freezing (CSS Flexbox §9.7, "Resolve Flexible Lengths"):
 * compute each unfrozen track's fair share; while any track escapes its bounds,
 * freeze only the dominant side — the floor-violators at their `min` when their
 * total deficit is at least the caps' total excess, otherwise the cap-violators at
 * their `max` — and recompute `fr` over the rest. Freezing floor-violators lowers
 * the `fr` left for the others (relaxing the caps) and freezing cap-violators raises
 * it (relaxing the floors), so resolving the larger side first converges on the true
 * `fr`; freezing both signs at once would overshoot, and stopping when the two sides
 * merely cancel would leave tracks outside their own bounds. The floors are hard: if
 * they sum past the available space, the tracks overflow at their minimums, and a
 * `minmax` whose resolved `min` exceeds its `max` collapses to its floor.
 *
 * @typedef {import('../parse/sizing').TrackSize} TrackSize
 */

const EPSILON = 1e-6;

/**
 * Resolve a fixed-length track size to pixels. Flexible kinds are not fixed and
 * are handled by the distribution pass; `auto` as a fixed bound is 0.
 * @param {TrackSize} size
 * @param {number} available
 * @returns {number}
 */
const resolveFixed = (size, available) => {
    if (size.type === 'px') {
        return size.value;
    }
    if (size.type === 'percent') {
        return (size.value / 100) * available;
    }
    // `auto` as a minmax minimum contributes no floor.
    return 0;
};

/**
 * Classify a track as fixed (a pixel size) or flexible (weight/min/max).
 * @param {TrackSize} track
 * @param {number} available
 * @returns {{ fixed: number } | { flex: { weight: number, min: number, max: number } }}
 */
const classify = (track, available) => {
    switch (track.type) {
        case 'px':
        case 'percent':
            return { fixed: resolveFixed(track, available) };
        case 'fr':
            return { flex: { weight: track.value, min: 0, max: Infinity } };
        case 'auto':
            return { flex: { weight: 1, min: 0, max: Infinity } };
        case 'minmax': {
            const min = resolveFixed(track.min, available);
            const max = track.max;
            if (max.type === 'fr') {
                return { flex: { weight: max.value, min, max: Infinity } };
            }
            if (max.type === 'auto') {
                return { flex: { weight: 1, min, max: Infinity } };
            }
            // A fixed max below the resolved floor inverts the bounds; CSS collapses
            // an inverted minmax to its floor, so the floor wins.
            return { flex: { weight: 1, min, max: Math.max(min, resolveFixed(max, available)) } };
        }
        default:
            throw new Error(`track-sizing: unsupported track type "${track.type}".`);
    }
};

/**
 * Distribute `space` pixels among flexible tracks, writing each track's resolved
 * size into `sizes` at its original index.
 *
 * Solves `sum( clamp(fr * weight, min, max) ) = space` for a single flex factor
 * `fr` by iterative freezing (CSS Flexbox §9.7). Each pass computes the fair share
 * for the still-unfrozen tracks; if clamping makes the flexible total overshoot
 * `space` the floors are binding, so it freezes the floor-violators at their `min`;
 * if it undershoots the caps are binding, so it freezes the cap-violators at their
 * `max`; otherwise the fair shares already satisfy every bound and the pass is the
 * last. Only one sign of violation is frozen per pass — freezing both at once would
 * overshoot the true `fr` size. Freezing is monotonic, so this terminates in at most
 * one pass per flexible track.
 *
 * @param {{ index: number, weight: number, min: number, max: number }[]} flexible
 * @param {number[]} sizes - mutated in place.
 * @param {number} space - pixels available to the flexible tracks (never negative).
 */
const distributeFlexible = (flexible, sizes, space) => {
    const frozen = flexible.map(() => false);

    for (;;) {
        let frozenSize = 0;
        let unfrozenWeight = 0;
        flexible.forEach((f, i) => {
            if (frozen[i]) {
                frozenSize += sizes[f.index];
            } else {
                unfrozenWeight += f.weight;
            }
        });

        if (unfrozenWeight <= EPSILON) {
            return;
        }

        const fr = (space - frozenSize) / unfrozenWeight;

        // Over the still-unfrozen tracks, how many pixels the floors want to add and
        // the caps want to remove. Each track counts on at most one side.
        let floorDeficit = 0;
        let capExcess = 0;
        flexible.forEach((f, i) => {
            if (frozen[i]) {
                return;
            }
            const fair = fr * f.weight;
            if (fair < f.min - EPSILON) {
                floorDeficit += f.min - fair;
            } else if (fair > f.max + EPSILON) {
                capExcess += fair - f.max;
            }
        });

        if (floorDeficit <= EPSILON && capExcess <= EPSILON) {
            // No track escapes its bounds: the fair shares are the final sizes.
            flexible.forEach((f, i) => {
                if (!frozen[i]) {
                    sizes[f.index] = fr * f.weight;
                }
            });
            return;
        }

        // Freeze only the dominant side this pass — never both at once, which would
        // overshoot. Freezing floor-violators lowers the fr left for the rest and so
        // relaxes the caps; freezing cap-violators raises it and relaxes the floors.
        // Resolving the larger side first converges on the true fr size; when the two
        // sides cancel exactly the floors take precedence.
        const freezeFloors = floorDeficit >= capExcess;
        flexible.forEach((f, i) => {
            if (frozen[i]) {
                return;
            }
            const fair = fr * f.weight;
            if (freezeFloors && fair < f.min - EPSILON) {
                sizes[f.index] = f.min;
                frozen[i] = true;
            } else if (!freezeFloors && fair > f.max + EPSILON) {
                sizes[f.index] = f.max;
                frozen[i] = true;
            }
        });
    }
};

/**
 * Resolve tracks to pixel sizes along one axis.
 * @param {TrackSize[]} tracks
 * @param {{ available: number, gap?: number }} opts
 * @returns {number[]} pixel size per track (floats; snapped to pixels downstream).
 */
const resolveTracks = (tracks, { available, gap = 0 }) => {
    const n = tracks.length;
    const usable = available - gap * Math.max(0, n - 1);

    const classified = tracks.map((t) => classify(t, available));
    const sizes = new Array(n).fill(0);

    // Lay down the fixed tracks; the flexible tracks share whatever is left.
    let fixedTotal = 0;
    const flexible = [];
    classified.forEach((c, i) => {
        if (c.fixed !== undefined) {
            sizes[i] = c.fixed;
            fixedTotal += c.fixed;
        } else {
            flexible.push({ index: i, weight: c.flex.weight, min: c.flex.min, max: c.flex.max });
        }
    });

    distributeFlexible(flexible, sizes, Math.max(0, usable - fixedTotal));

    return sizes;
};

module.exports = { resolveTracks };
