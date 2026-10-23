'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { composite } = require('../src');

/**
 * Golden-image regression tests (ADR-001 §6).
 *
 * These complement the targeted pixel-sampling tests in composite.test.js: those
 * assert specific colors at specific coordinates (individual behaviors), while
 * these compare the WHOLE rendered image against a committed reference, so an
 * unexpected shift anywhere in the composite is caught even where no sampled
 * point sits.
 *
 * The comparison is of DECODED pixel data, not encoded PNG bytes — two PNGs can
 * differ byte-for-byte while decoding to identical pixels (encoder settings,
 * metadata), so a byte compare would be both too strict and beside the point.
 * The comparison is exact: every fixture uses solid-color inputs on integer cell
 * rectangles, which carry no antialiased edges and therefore resample identically
 * across libvips builds, so there is nothing to tolerance away. If a photographic
 * fixture is ever added, ADR-001 §6 permits an explicitly documented tolerance.
 *
 * To (re)generate the committed references after an intentional rendering change,
 * run:  UPDATE_GOLDEN=1 npx jest tests/golden.test.js
 * Review the resulting image diffs before committing — a reference is only correct
 * if the new rendering is correct.
 */

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'golden');

/** A solid-color source image of the given size, as a PNG buffer. */
const solid = (color, size = 50) =>
    sharp({ create: { width: size, height: size, channels: 4, background: color } })
        .png()
        .toBuffer();

/** Decode any encoded image buffer to a normalized RGBA raw buffer + dimensions. */
const toRaw = async (encoded) => {
    const { data, info } = await sharp(encoded)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, channels: info.channels };
};

/**
 * Each case names a committed reference and a render that produces the composite
 * to compare against it. Inputs are generated here (not committed); only the
 * rendered output references in fixtures/golden/ are committed.
 */
const cases = [
    {
        name: 'plain 2x2 grid',
        file: 'grid-2x2.png',
        render: async () =>
            composite({
                layout: '2x2',
                width: 100,
                height: 100,
                images: await Promise.all([
                    solid('#ff0000'),
                    solid('#00ff00'),
                    solid('#0000ff'),
                    solid('#ffff00'),
                ]),
            }),
    },
    {
        name: 'columns split with col-sizes',
        file: 'cols-split-2fr1fr.png',
        render: async () =>
            composite({
                layout: '1 | 3x2',
                colSizes: '2fr 1fr',
                width: 300,
                height: 300,
                images: await Promise.all(
                    Array.from({ length: 7 }, (_i, k) => solid(k === 0 ? '#123456' : '#999999')),
                ),
            }),
    },
    {
        name: 'rows split with row-sizes',
        file: 'rows-split-2fr1fr.png',
        render: async () =>
            composite({
                layout: '1 / 3x2',
                rowSizes: '2fr 1fr',
                width: 300,
                height: 300,
                images: await Promise.all(
                    Array.from({ length: 7 }, (_i, k) => solid(k === 0 ? '#123456' : '#999999')),
                ),
            }),
    },
    {
        name: 'transparent background with inset',
        file: 'transparent-inset.png',
        render: async () =>
            composite({
                layout: '1',
                width: 120,
                height: 120,
                inset: 20,
                background: 'rgba(0,0,0,0)',
                images: [await solid('#ff0000')],
            }),
    },
];

describe('golden-image regression (whole-image, decoded pixels)', () => {
    for (const testCase of cases) {
        it(`matches the committed reference: ${testCase.name}`, async () => {
            const { buffer } = await testCase.render();
            const refPath = path.join(FIXTURES_DIR, testCase.file);

            if (process.env.UPDATE_GOLDEN) {
                fs.mkdirSync(FIXTURES_DIR, { recursive: true });
                fs.writeFileSync(refPath, buffer);
                return;
            }

            if (!fs.existsSync(refPath)) {
                throw new Error(
                    `missing golden reference ${testCase.file}; regenerate with UPDATE_GOLDEN=1`,
                );
            }

            const rendered = await toRaw(buffer);
            const reference = await toRaw(fs.readFileSync(refPath));

            // Same canvas and channel count...
            expect({
                width: rendered.width,
                height: rendered.height,
                channels: rendered.channels,
            }).toEqual({
                width: reference.width,
                height: reference.height,
                channels: reference.channels,
            });
            // ...and byte-identical decoded pixels (RGBA).
            expect(rendered.data.equals(reference.data)).toBe(true);
        });
    }
});
