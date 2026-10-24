'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { composite, compositeToFile, compositeToDataUrl } = require('../src');

const solid = (color, size = 50) =>
    sharp({ create: { width: size, height: size, channels: 4, background: color } })
        .png()
        .toBuffer();

const pixelAt = async (buffer, x, y) => {
    const { data } = await sharp(buffer)
        .extract({ left: x, top: y, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
    return [data[0], data[1], data[2]];
};

/** A `size` solid centered on a `size + 2*pad` transparent canvas (padded source). */
const paddedSolid = (color, size = 30, pad = 10) =>
    sharp({ create: { width: size, height: size, channels: 4, background: color } })
        .extend({
            top: pad,
            bottom: pad,
            left: pad,
            right: pad,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

/** Runs [start,end] of consecutive non-background pixels along row `y`. */
const contentRuns = async (buffer, y, bg) => {
    const { data, info } = await sharp(buffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const isBg = (x) => {
        const i = (y * info.width + x) * 4;
        return data[i] === bg[0] && data[i + 1] === bg[1] && data[i + 2] === bg[2];
    };
    const runs = [];
    let start = null;
    for (let x = 0; x < info.width; x += 1) {
        if (!isBg(x)) {
            if (start === null) start = x;
        } else if (start !== null) {
            runs.push([start, x - 1]);
            start = null;
        }
    }
    if (start !== null) runs.push([start, info.width - 1]);
    return { runs, width: info.width };
};

/**
 * End-to-end: the public composite() API parses the layout + sizing, computes
 * geometry, and renders — so a layout string and an ordered image list produce a
 * correct composite image.
 */
describe('composite() (public API, end to end)', () => {
    it('composes a plain 2x2 grid from a layout string', async () => {
        const images = await Promise.all([
            solid('#ff0000'),
            solid('#00ff00'),
            solid('#0000ff'),
            solid('#ffff00'),
        ]);
        const { buffer, contentType } = await composite({
            layout: '2x2',
            width: 100,
            height: 100,
            images,
        });
        expect(contentType).toBe('image/png');
        expect(await pixelAt(buffer, 25, 25)).toEqual([255, 0, 0]);
        expect(await pixelAt(buffer, 75, 75)).toEqual([255, 255, 0]);
    });

    it('applies a columns split with custom col-sizes', async () => {
        // '1 | 3x2' with col-sizes '2fr 1fr' over width 300 -> left region 200 wide.
        const images = await Promise.all(
            Array.from({ length: 7 }, (_i, k) => solid(k === 0 ? '#123456' : '#999999')),
        );
        const { buffer } = await composite({
            layout: '1 | 3x2',
            colSizes: '2fr 1fr',
            width: 300,
            height: 300,
            images,
        });
        // x=175 lies in the left feature region only when '2fr 1fr' is honored
        // (left = 200 wide); with the default equal split the boundary is at 150 and
        // x=175 falls in the right 3x2 grid (#999999). Asserting the feature color
        // here fails if the col-sizes are ignored.
        expect(await pixelAt(buffer, 175, 150)).toEqual([0x12, 0x34, 0x56]);
        // x=250 is in the right grid under either split -> confirms the right region.
        expect(await pixelAt(buffer, 250, 150)).toEqual([0x99, 0x99, 0x99]);
    });

    it('applies a rows split with custom row-sizes', async () => {
        // '1 / 3x2' with row-sizes '2fr 1fr' over height 300 -> top region 200 tall.
        const images = await Promise.all(
            Array.from({ length: 7 }, (_i, k) => solid(k === 0 ? '#123456' : '#999999')),
        );
        const { buffer } = await composite({
            layout: '1 / 3x2',
            rowSizes: '2fr 1fr',
            width: 300,
            height: 300,
            images,
        });
        // y=175 lies in the top feature region only when '2fr 1fr' is honored
        // (top = 200 tall); with the default equal split the boundary is at 150 and
        // y=175 falls in the bottom 3x2 grid (#999999). Fails if row-sizes are ignored.
        expect(await pixelAt(buffer, 150, 175)).toEqual([0x12, 0x34, 0x56]);
        // (133,250) sits on a bottom-grid icon (the grid block centers around x=150)
        // -> confirms the bottom region.
        expect(await pixelAt(buffer, 133, 250)).toEqual([0x99, 0x99, 0x99]);
    });

    it('distributes split columns by live content with uniform gutters between the visible icons', async () => {
        // Padded sources (a 30px solid inside a 50px transparent frame): the layout
        // must measure the inked content out, or the gutters collapse. Two tall
        // columns so the center row crosses both; a magenta background marks the gaps.
        const images = await Promise.all([paddedSolid('#123456'), paddedSolid('#999999')]);
        const { buffer } = await composite({
            layout: '1 | 1',
            colSizes: '1fr 1fr',
            width: 400,
            height: 200,
            gap: 0,
            margin: 0,
            background: '#ff00ff',
            images,
        });
        const { runs, width } = await contentRuns(buffer, 100, [0xff, 0x00, 0xff]);
        // Two visible columns separated by background.
        expect(runs).toHaveLength(2);
        const left = runs[0][0];
        const middle = runs[1][0] - runs[0][1] - 1;
        const right = width - 1 - runs[1][1];
        // The gutter before, between, and after the visible content are one value.
        expect(Math.abs(left - middle)).toBeLessThanOrEqual(2);
        expect(Math.abs(middle - right)).toBeLessThanOrEqual(2);
        // A real gutter exists — the padding was measured out, not counted as width
        // (which would collapse the gutters to zero and pack the columns edge to edge).
        expect(left).toBeGreaterThan(10);
    });

    it('keeps split gutters uniform when a non-zero inset is applied', async () => {
        // inset shrinks the drawn icon inside each cell. The live-area measurement must
        // account for it; otherwise it over-estimates the content and the gutters go
        // non-uniform (wider between the columns than at the edges).
        const images = await Promise.all([paddedSolid('#123456'), paddedSolid('#999999')]);
        const { buffer } = await composite({
            layout: '1 | 1',
            colSizes: '1fr 1fr',
            width: 400,
            height: 200,
            gap: 0,
            margin: 0,
            inset: 20,
            background: '#ff00ff',
            images,
        });
        const { runs, width } = await contentRuns(buffer, 100, [0xff, 0x00, 0xff]);
        expect(runs).toHaveLength(2);
        const left = runs[0][0];
        const middle = runs[1][0] - runs[0][1] - 1;
        const right = width - 1 - runs[1][1];
        expect(Math.abs(left - middle)).toBeLessThanOrEqual(2);
        expect(Math.abs(middle - right)).toBeLessThanOrEqual(2);
    });

    it('returns a data URL from compositeToDataUrl()', async () => {
        const images = [await solid('#ff0000')];
        const dataUrl = await compositeToDataUrl({ layout: '1', width: 50, height: 50, images });
        expect(dataUrl).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    });

    it('writes a file from compositeToFile()', async () => {
        const images = [await solid('#00ff00')];
        const out = path.join(os.tmpdir(), `image-composer-test-${Date.now()}.png`);
        try {
            const result = await compositeToFile({
                layout: '1',
                width: 40,
                height: 40,
                images,
                out,
            });
            expect(result.path).toBe(out);
            expect(fs.existsSync(out)).toBe(true);
            const meta = await sharp(out).metadata();
            expect(meta.width).toBe(40);
            expect(meta.height).toBe(40);
        } finally {
            if (fs.existsSync(out)) {
                fs.unlinkSync(out);
            }
        }
    });

    it('infers the output format from the file extension when none is given', async () => {
        // No explicit `format`, a `.webp` destination -> webp bytes, not the png default.
        const images = [await solid('#00ff00')];
        const out = path.join(os.tmpdir(), `image-composer-test-${Date.now()}.webp`);
        try {
            const result = await compositeToFile({
                layout: '1',
                width: 40,
                height: 40,
                images,
                out,
            });
            expect(result.contentType).toBe('image/webp');
            expect((await sharp(out).metadata()).format).toBe('webp');
        } finally {
            if (fs.existsSync(out)) {
                fs.unlinkSync(out);
            }
        }
    });

    it('rejects an output extension whose format is unsupported and writes no file', async () => {
        // '.jpg' infers an unsupported format: reject before writing, rather than
        // putting png bytes under a .jpg name and reporting success.
        const images = [await solid('#00ff00')];
        const out = path.join(os.tmpdir(), `image-composer-test-${Date.now()}.jpg`);
        await expect(
            compositeToFile({ layout: '1', width: 40, height: 40, images, out }),
        ).rejects.toThrow(/unsupported format/i);
        expect(fs.existsSync(out)).toBe(false);
    });

    it('rejects a non-positive output size', async () => {
        await expect(
            composite({ layout: '1', width: 0, height: 50, images: [] }),
        ).rejects.toThrow();
    });

    it('rejects an unsupported output format instead of silently writing png', async () => {
        // A format outside {png, webp} must fail loudly, not be coerced to png and
        // reported as success (which would write png bytes under a false content type).
        const images = [await solid('#ff0000')];
        await expect(
            composite({ layout: '1', width: 50, height: 50, images, format: 'jpeg' }),
        ).rejects.toThrow(/unsupported format/i);
    });
});
