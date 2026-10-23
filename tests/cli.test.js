'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const CLI = path.join(__dirname, '..', 'cli', 'index.js');
const run = (args) => execFileSync('node', [CLI, ...args], { encoding: 'utf8' });

/**
 * The CLI is a thin wrapper over composite(): it should read positional image
 * inputs, forward the options, and write the output file. Spawned as a real
 * process so the bin entry and arg parsing are exercised end to end.
 */
describe('image-composer CLI', () => {
    let dir;
    let inputs;

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-composer-cli-'));
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
        inputs = [];
        for (let i = 0; i < colors.length; i += 1) {
            const file = path.join(dir, `in-${i}.png`);
            await sharp({ create: { width: 50, height: 50, channels: 4, background: colors[i] } })
                .png()
                .toFile(file);
            inputs.push(file);
        }
    });

    afterAll(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('composes from positional image inputs and writes the output', async () => {
        const out = path.join(dir, 'out.png');
        const stdout = run([
            '--layout',
            '2x2',
            '--width',
            '100',
            '--height',
            '100',
            '--out',
            out,
            ...inputs,
        ]);

        expect(stdout).toMatch(/Wrote .*out\.png/);
        expect(fs.existsSync(out)).toBe(true);
        const meta = await sharp(out).metadata();
        expect(meta.width).toBe(100);
        expect(meta.height).toBe(100);
    });

    it('infers webp from the output extension', async () => {
        const out = path.join(dir, 'out.webp');
        run(['--layout', '1', '--width', '40', '--height', '40', '--out', out, inputs[0]]);
        expect((await sharp(out).metadata()).format).toBe('webp');
    });

    it('prints usage with --help', () => {
        expect(run(['--help'])).toMatch(/Usage:/);
    });

    it('exits non-zero when a required option is missing', () => {
        expect(() =>
            run(['--layout', '2x2', '--out', path.join(dir, 'x.png'), inputs[0]]),
        ).toThrow();
    });
});
