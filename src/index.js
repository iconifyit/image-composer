'use strict';

const fs = require('fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { StructureParser } = require('./parse/structure');
const { SizingParser } = require('./parse/sizing');
const { computeGeometry } = require('./layout/geometry');
const { renderComposite } = require('./render/renderer');

/**
 * @module image-composer
 *
 * Public API. Composes a set of pre-selected images into a single output image
 * from a layout string and separate sizing/spacing options. Pure: images in,
 * image out — no storage, network, or domain knowledge. See ADR-001.
 *
 * @typedef {import('./parse/structure').LayoutNode} LayoutNode
 */

/**
 * @param {object} options
 * @param {Array<string|Buffer>} options.images - source images (paths or buffers), in fill order.
 * @param {string} options.layout - the layout DSL, e.g. '3x4' or '1 | 3x2'.
 * @param {number} options.width - output width (px).
 * @param {number} options.height - output height (px).
 * @param {string} [options.colSizes] - track template for a `|` split (e.g. '2fr 1fr').
 * @param {string} [options.rowSizes] - track template for a `/` split.
 * @param {number} [options.gap=0] - gap between cells/regions (px).
 * @param {number} [options.margin=0] - outer frame inset (px).
 * @param {number} [options.inset=0] - padding inside each cell (px).
 * @param {string} [options.background='#ffffff'] - canvas background.
 * @param {'png'|'webp'} [options.format='png'] - output format.
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
/**
 * Measure an image's source dimensions and the bounding box of its visible
 * (non-background) content. Layout distributes columns by their live content, so
 * the transparent/solid padding each source carries must be measured out rather
 * than counted as part of a column's width. See ADR-002.
 * @param {string|Buffer} image
 * @returns {Promise<{ srcW: number, srcH: number, inkedW: number, inkedH: number }>}
 */
const measureContent = async (image) => {
    const { width, height } = await sharp(image).metadata();
    try {
        const { info } = await sharp(image).trim().toBuffer({ resolveWithObject: true });
        return { srcW: width, srcH: height, inkedW: info.width, inkedH: info.height };
    } catch {
        // Nothing to trim (uniform image): the whole frame is live content.
        return { srcW: width, srcH: height, inkedW: width, inkedH: height };
    }
};

const composite = async (options = {}) => {
    const {
        images = [],
        layout,
        width,
        height,
        colSizes,
        rowSizes,
        gap = 0,
        margin = 0,
        inset = 0,
        background = '#ffffff',
        format = 'png',
    } = options;

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('composite: `width` and `height` must be positive numbers.');
    }
    if (!Array.isArray(images)) {
        throw new Error('composite: `images` must be an array of paths or buffers.');
    }

    const contentSizes = await Promise.all(images.map((image) => measureContent(image)));

    const tree = new StructureParser().parse(layout);

    // Track sizing applies only to the top-level regions of a split; a plain grid
    // is uniform. For a split, parse the template matching its direction.
    let colTracks;
    let rowTracks;
    if (tree.kind === 'split') {
        const sizing = new SizingParser();
        if (tree.direction === 'cols') {
            colTracks = sizing.parse(colSizes, tree.regions.length);
        } else {
            rowTracks = sizing.parse(rowSizes, tree.regions.length);
        }
    }

    const geometry = computeGeometry(tree, {
        width,
        height,
        gap,
        margin,
        colSizes: colTracks,
        rowSizes: rowTracks,
        contentSizes,
    });

    return renderComposite({
        width,
        height,
        cells: geometry.cells,
        images,
        background,
        inset,
        format,
    });
};

/**
 * Infer an output format token from a file path's extension. A missing extension
 * defaults to `png`; any other extension is returned as-is (lowercased, no dot) so
 * an unsupported one is rejected downstream rather than silently written as png.
 * @param {string} filePath - destination path, e.g. 'out.webp'.
 * @returns {string} a format token, e.g. 'png', 'webp', or 'jpg'.
 * @example formatFromExtension('a/b.WEBP') // 'webp'
 */
const formatFromExtension = (filePath) => {
    const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
    return ext === '' ? 'png' : ext;
};

/**
 * Compose and write the result to a file.
 * @param {object} options - the `composite` options plus `out`.
 * @param {string} options.out - destination path.
 * @param {'png'|'webp'} [options.format] - output format; when omitted it is
 *   inferred from the `out` extension so the file's bytes match its name.
 * @returns {Promise<{ path: string, contentType: string }>}
 */
const compositeToFile = async (options = {}) => {
    const { out, format, ...rest } = options;
    if (!out) {
        throw new Error('compositeToFile: `out` (destination path) is required.');
    }
    const { buffer, contentType } = await composite({
        ...rest,
        format: format ?? formatFromExtension(out),
    });
    await fs.writeFile(out, buffer);
    return { path: out, contentType };
};

/**
 * Compose and return a base64 data URL.
 * @param {object} options - the `composite` options.
 * @returns {Promise<string>}
 */
const compositeToDataUrl = async (options = {}) => {
    const { buffer, contentType } = await composite(options);
    return `data:${contentType};base64,${buffer.toString('base64')}`;
};

module.exports = {
    composite,
    compositeToFile,
    compositeToDataUrl,
    formatFromExtension,
    // Lower-level building blocks, exported for advanced use.
    StructureParser,
    SizingParser,
    computeGeometry,
    renderComposite,
};
