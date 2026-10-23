#!/usr/bin/env node
'use strict';

const { parseArgs } = require('node:util');
const { compositeToFile, formatFromExtension } = require('../src');

/**
 * @module cli
 *
 * Thin command-line wrapper over the composite() library. See ADR-001.
 *
 *   image-composer --layout "1 | 3x2" --col-sizes "2fr 1fr" --gap 20 \
 *     --width 800 --height 600 --out out.png  img1.png img2.png ...
 *
 * Image inputs are positional arguments (in fill order). Sizing, gaps, and
 * margins are separate flags so the layout string stays pure structure.
 */

const USAGE = `image-composer — compose images into one via a layout DSL.

Usage:
  image-composer --layout <dsl> --width <px> --height <px> --out <file> [options] <image...>

Options:
  --layout <dsl>        Layout, e.g. "3x4" or "1 | 3x2" (required).
  --width <px>          Output width (required).
  --height <px>         Output height (required).
  --out <file>          Output file; format inferred from extension (required).
  --col-sizes <tpl>     Column track sizes for a "|" split, e.g. "2fr 1fr".
  --row-sizes <tpl>     Row track sizes for a "/" split.
  --gap <px>            Gap between cells/regions (default 0).
  --margin <px>         Outer frame inset (default 0).
  --inset <px>          Padding inside each cell (default 0).
  --background <color>  Canvas background (default "#ffffff").
  --format <png|webp>   Override the output format (default: from --out).
  -h, --help            Show this help.

Image inputs are positional arguments, in fill order.`;

/** Parse a required numeric option. */
const num = (value, name) => {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        throw new Error(`--${name} must be a number (got "${value}").`);
    }
    return n;
};

async function main(argv) {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            layout: { type: 'string' },
            'col-sizes': { type: 'string' },
            'row-sizes': { type: 'string' },
            width: { type: 'string' },
            height: { type: 'string' },
            gap: { type: 'string' },
            margin: { type: 'string' },
            inset: { type: 'string' },
            background: { type: 'string' },
            format: { type: 'string' },
            out: { type: 'string' },
            images: { type: 'string', multiple: true },
            help: { type: 'boolean', short: 'h' },
        },
    });

    if (values.help) {
        process.stdout.write(`${USAGE}\n`);
        return;
    }

    for (const required of ['layout', 'width', 'height', 'out']) {
        if (values[required] === undefined) {
            throw new Error(`--${required} is required.\n\n${USAGE}`);
        }
    }

    const images = [...positionals, ...(values.images || [])];
    if (images.length === 0) {
        throw new Error('at least one image input is required (positional arguments).');
    }

    const format = values.format || formatFromExtension(values.out);

    const result = await compositeToFile({
        layout: values.layout,
        colSizes: values['col-sizes'],
        rowSizes: values['row-sizes'],
        width: num(values.width, 'width'),
        height: num(values.height, 'height'),
        gap: values.gap !== undefined ? num(values.gap, 'gap') : 0,
        margin: values.margin !== undefined ? num(values.margin, 'margin') : 0,
        inset: values.inset !== undefined ? num(values.inset, 'inset') : 0,
        background: values.background || '#ffffff',
        format,
        images,
        out: values.out,
    });

    process.stdout.write(
        `Wrote ${result.path} (${values.width}x${values.height}, ${result.contentType})\n`,
    );
}

/* istanbul ignore next — entrypoint guard */
if (require.main === module) {
    main(process.argv.slice(2)).catch((error) => {
        process.stderr.write(`image-composer: ${error.message}\n`);
        process.exit(1);
    });
}

module.exports = { main };
