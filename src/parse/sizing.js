'use strict';

const valueParser = require('postcss-value-parser');

/**
 * @module parse/sizing
 *
 * Parses a CSS-grid-style track template (the `--col-sizes` / `--row-sizes`
 * value) into an ordered list of track sizes, one per region. Tokenization is
 * delegated to postcss-value-parser; this module adds the v1 semantics:
 * `fr`, `px`, `%`, `auto`, and `minmax(min, max)`. See ADR-001.
 *
 * An empty/omitted template defaults to equal `1fr` tracks. The resulting track
 * count must equal the region count.
 *
 * @typedef {{ type: 'fr', value: number }} FrTrack
 * @typedef {{ type: 'px', value: number }} PxTrack
 * @typedef {{ type: 'percent', value: number }} PercentTrack
 * @typedef {{ type: 'auto' }} AutoTrack
 * @typedef {{ type: 'minmax', min: TrackSize, max: TrackSize }} MinmaxTrack
 * @typedef {FrTrack | PxTrack | PercentTrack | AutoTrack | MinmaxTrack} TrackSize
 */

const FR_RE = /^(\d*\.?\d+)fr$/;
const PX_RE = /^(\d*\.?\d+)px$/;
const PERCENT_RE = /^(\d*\.?\d+)%$/;

class SizingParser {
    /**
     * Parse a track template into `regionCount` track sizes.
     * @param {string|null|undefined} template - e.g. '2fr 1fr', 'minmax(120px, 1fr) 2fr'. Empty → equal fr.
     * @param {number} regionCount - the number of regions the tracks must cover.
     * @returns {TrackSize[]}
     * @throws {Error} On an unknown token, a bad `minmax`, or a track/region count mismatch.
     */
    parse(template, regionCount) {
        if (template == null || template.trim() === '') {
            return Array.from({ length: regionCount }, () => ({ type: 'fr', value: 1 }));
        }

        const tracks = valueParser(template)
            .nodes.filter((node) => node.type === 'word' || node.type === 'function')
            .map((node) => this._parseNode(node));

        if (tracks.length !== regionCount) {
            throw new Error(
                `--sizes: got ${tracks.length} track size(s) for ${regionCount} region(s); the counts must match.`,
            );
        }

        return tracks;
    }

    /**
     * Parse one top-level node (a bare value word, or a `minmax()` function).
     * @param {object} node - a postcss-value-parser node.
     * @returns {TrackSize}
     */
    _parseNode(node) {
        if (node.type === 'function') {
            const name = node.value.toLowerCase();
            if (name !== 'minmax') {
                throw new Error(`--sizes: "${name}()" is not supported in v1 (only minmax() is).`);
            }
            const args = node.nodes.filter((n) => n.type === 'word');
            if (args.length !== 2) {
                throw new Error('--sizes: minmax() takes exactly two arguments, minmax(min, max).');
            }
            // CSS forbids a flexible (fr) minimum; the maximum may be flexible.
            const min = this._parseDimension(args[0].value, { allowFr: false });
            const max = this._parseDimension(args[1].value, { allowFr: true });
            return { type: 'minmax', min, max };
        }
        return this._parseDimension(node.value, { allowFr: true });
    }

    /**
     * Parse a single dimension token into a track size.
     * @param {string} raw - e.g. '2fr', '200px', '50%', 'auto'.
     * @param {{ allowFr: boolean }} opts
     * @returns {TrackSize}
     * @throws {Error} On a negative, unitless, or unrecognized token.
     */
    _parseDimension(raw, { allowFr }) {
        const token = raw.trim().toLowerCase();

        if (token.startsWith('-')) {
            throw new Error(`--sizes: "${raw}" is negative; track sizes must be >= 0.`);
        }
        if (token === 'auto') {
            return { type: 'auto' };
        }

        const fr = FR_RE.exec(token);
        if (fr) {
            if (!allowFr) {
                throw new Error(
                    `--sizes: "${raw}" — an fr value cannot be used as a minmax() minimum.`,
                );
            }
            return { type: 'fr', value: Number(fr[1]) };
        }

        const px = PX_RE.exec(token);
        if (px) {
            return { type: 'px', value: Number(px[1]) };
        }

        const percent = PERCENT_RE.exec(token);
        if (percent) {
            return { type: 'percent', value: Number(percent[1]) };
        }

        throw new Error(
            `--sizes: invalid track size "${raw}"; expected fr, px, %, auto, or minmax().`,
        );
    }
}

module.exports = { SizingParser };
