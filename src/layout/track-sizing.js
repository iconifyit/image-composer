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
 * `min` and capped at `max` (unbounded when the max is `fr`). Free space is
 * distributed among flexible tracks by weight, re-distributing the overflow of
 * any track that hits its cap (the CSS flexible-track algorithm).
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
            return { flex: { weight: 1, min, max: resolveFixed(max, available) } };
        }
        default:
            throw new Error(`track-sizing: unsupported track type "${track.type}".`);
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

    // Lay down fixed sizes and flexible floors; track what space they consume.
    let consumed = 0;
    const flexible = [];
    classified.forEach((c, i) => {
        if (c.fixed !== undefined) {
            sizes[i] = c.fixed;
        } else {
            sizes[i] = c.flex.min;
            flexible.push({ index: i, weight: c.flex.weight, room: c.flex.max - c.flex.min });
        }
        consumed += sizes[i];
    });

    // Distribute the remaining space among flexible tracks by weight, capping any
    // track that reaches its max and re-distributing the overflow to the rest.
    let free = Math.max(0, usable - consumed);
    let active = flexible.filter((f) => f.room > EPSILON);

    while (free > EPSILON && active.length > 0) {
        const totalWeight = active.reduce((sum, f) => sum + f.weight, 0);
        if (totalWeight <= 0) {
            break;
        }

        const capped = active.filter((f) => free * (f.weight / totalWeight) >= f.room - EPSILON);

        if (capped.length === 0) {
            // No cap binds: hand out all remaining space proportionally and finish.
            for (const f of active) {
                sizes[f.index] += free * (f.weight / totalWeight);
            }
            free = 0;
            active = [];
        } else {
            // Grant capped tracks their remaining room, then recompute with the rest.
            for (const f of capped) {
                sizes[f.index] += f.room;
                free -= f.room;
            }
            const cappedSet = new Set(capped);
            active = active.filter((f) => ! cappedSet.has(f));
        }
    }

    return sizes;
};

module.exports = { resolveTracks };
