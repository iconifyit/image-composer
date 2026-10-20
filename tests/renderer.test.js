'use strict';

const sharp = require('sharp');
const { renderComposite } = require('../src/render/renderer');

/** A solid-color square PNG buffer. */
const solid = (color, size = 50) =>
    sharp({ create: { width: size, height: size, channels: 4, background: color } })
        .png()
        .toBuffer();

/** The [r, g, b] of one pixel in a rendered buffer. */
const pixelAt = async (buffer, x, y) => {
    const { data } = await sharp(buffer)
        .extract({ left: x, top: y, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
    return [data[0], data[1], data[2]];
};

const cell = (x, y, width, height) => ({ x, y, width, height });

/**
 * The renderer places each image into its cell (centered, contained) over a
 * background, and outputs a PNG or WebP buffer. Tests feed distinct solid colors
 * and sample cell centers, so placement, order, and format are verified without
 * brittle byte-for-byte golden files.
 */
describe('renderComposite', () => {
    it('places images into their cells in order and outputs a PNG of the right size', async () => {
        const images = await Promise.all([
            solid('#ff0000'),
            solid('#00ff00'),
            solid('#0000ff'),
            solid('#ffff00'),
        ]);
        const cells = [cell(0, 0, 50, 50), cell(50, 0, 50, 50), cell(0, 50, 50, 50), cell(50, 50, 50, 50)];

        const { buffer, contentType } = await renderComposite({
            width: 100,
            height: 100,
            cells,
            images,
            format: 'png',
        });

        expect(contentType).toBe('image/png');
        const meta = await sharp(buffer).metadata();
        expect(meta.format).toBe('png');
        expect(meta.width).toBe(100);
        expect(meta.height).toBe(100);

        // Each cell's center holds its image's color, in fill order.
        expect(await pixelAt(buffer, 25, 25)).toEqual([255, 0, 0]);
        expect(await pixelAt(buffer, 75, 25)).toEqual([0, 255, 0]);
        expect(await pixelAt(buffer, 25, 75)).toEqual([0, 0, 255]);
        expect(await pixelAt(buffer, 75, 75)).toEqual([255, 255, 0]);
    });

    it('outputs WebP when asked', async () => {
        const images = [await solid('#ff0000')];
        const { buffer, contentType } = await renderComposite({
            width: 50,
            height: 50,
            cells: [cell(0, 0, 50, 50)],
            images,
            format: 'webp',
        });
        expect(contentType).toBe('image/webp');
        expect((await sharp(buffer).metadata()).format).toBe('webp');
    });

    it('shows the background in cells with no image (fewer images than cells)', async () => {
        const images = [await solid('#ff0000')];
        const { buffer } = await renderComposite({
            width: 100,
            height: 50,
            cells: [cell(0, 0, 50, 50), cell(50, 0, 50, 50)],
            images,
            background: '#ffffff',
            format: 'png',
        });
        expect(await pixelAt(buffer, 25, 25)).toEqual([255, 0, 0]); // the one image
        expect(await pixelAt(buffer, 75, 25)).toEqual([255, 255, 255]); // background
    });
});
