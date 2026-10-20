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
        // Center of the left (feature) region: ~ (100, 150) -> the first image.
        expect(await pixelAt(buffer, 100, 150)).toEqual([0x12, 0x34, 0x56]);
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

    it('rejects a non-positive output size', async () => {
        await expect(
            composite({ layout: '1', width: 0, height: 50, images: [] }),
        ).rejects.toThrow();
    });
});
