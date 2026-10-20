'use strict';

const sharp = require('sharp');

/**
 * @module render/renderer
 *
 * Places images into computed cell rectangles over a background and outputs a
 * PNG or WebP buffer. This is the only module that touches the raster engine
 * (sharp); everything above it is pure geometry. See ADR-001.
 *
 * Each image is scaled to fit inside its cell (preserving aspect, no crop) and
 * centered. Cells beyond the supplied images are left as background; images
 * beyond the cells are ignored. The caller controls which image goes in which
 * cell by the order of `images`.
 *
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 */

/** Snap a rectangle to integer pixels (sharp requires integer extents). */
const snap = (rect) => ({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
});

/**
 * Render a composite image.
 * @param {object} params
 * @param {number} params.width - output width (px).
 * @param {number} params.height - output height (px).
 * @param {Rect[]} params.cells - cell rectangles in fill order (from computeGeometry).
 * @param {Array<string|Buffer>} params.images - source images (paths or buffers), in fill order.
 * @param {string} [params.background='#ffffff'] - canvas background (any color sharp accepts).
 * @param {number} [params.inset=0] - padding inside each cell, in px.
 * @param {'png'|'webp'} [params.format='png'] - output format.
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
const renderComposite = async ({
    width,
    height,
    cells,
    images,
    background = '#ffffff',
    inset = 0,
    format = 'png',
}) => {
    const count = Math.min(cells.length, images.length);
    const overlays = [];

    for (let i = 0; i < count; i += 1) {
        const rect = snap(cells[i]);
        const innerWidth = Math.max(1, rect.width - 2 * inset);
        const innerHeight = Math.max(1, rect.height - 2 * inset);

        const resized = await sharp(images[i])
            .resize({ width: innerWidth, height: innerHeight, fit: 'inside' })
            .toBuffer({ resolveWithObject: true });

        // Center the (possibly letterboxed) image within the cell's inner box.
        const left = rect.x + inset + Math.round((innerWidth - resized.info.width) / 2);
        const top = rect.y + inset + Math.round((innerHeight - resized.info.height) / 2);

        overlays.push({ input: resized.data, left, top });
    }

    const base = sharp({
        create: { width, height, channels: 4, background },
    }).composite(overlays);

    const buffer = await (format === 'webp' ? base.webp() : base.png()).toBuffer();
    return { buffer, contentType: format === 'webp' ? 'image/webp' : 'image/png' };
};

module.exports = { renderComposite };
