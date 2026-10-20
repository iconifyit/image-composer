'use strict';

/**
 * @module parse/structure
 *
 * Parses the v1 layout-structure DSL into a layout tree. The DSL describes only
 * *structure* (what cells go where); sizing is a separate concern (see
 * parse/sizing). See ADR-001.
 *
 * Grammar (v1 — single operator, one level, no grouping):
 *
 *   layout    := composite | grid
 *   composite := region ( SEP region )+        SEP is all '|' or all '/', not both
 *   region    := grid
 *   grid      := INT 'x' INT | '1'             '1' is the single-cell (1x1) shorthand
 *
 * Output tree:
 *   grid      -> { kind: 'grid', rows, cols }
 *   composite -> { kind: 'split', direction: 'cols' | 'rows', regions: [grid, ...] }
 *               '|' => direction 'cols' (regions side by side, left→right)
 *               '/' => direction 'rows' (regions stacked, top→bottom)
 *
 * v2 (rejected here): grouping '()', mixing '|' and '/', nesting beyond one level.
 */

const GRID_RE = /^(\d+)x(\d+)$/;

/**
 * @typedef {{ kind: 'grid', rows: number, cols: number }} GridNode
 * @typedef {{ kind: 'split', direction: 'cols'|'rows', regions: GridNode[] }} SplitNode
 * @typedef {GridNode | SplitNode} LayoutNode
 */

class StructureParser {
    /**
     * Parse a layout string into a layout tree.
     * @param {string} input - e.g. '3x4', '1', '1 | 3x2', '1x4 / 1x4'.
     * @returns {LayoutNode}
     * @throws {Error} On empty input, a v2-only form, or an invalid region.
     */
    parse(input) {
        if (typeof input !== 'string' || input.trim() === '') {
            throw new Error('layout: expected a non-empty layout string (e.g. "3x4" or "1 | 3x2").');
        }

        const layout = input.trim();

        if (layout.includes('(') || layout.includes(')')) {
            throw new Error(`layout "${layout}": grouping "()" is a v2 feature, not supported in v1.`);
        }

        const hasCols = layout.includes('|');
        const hasRows = layout.includes('/');

        if (hasCols && hasRows) {
            throw new Error(`layout "${layout}": mixing "|" and "/" in one layout is a v2 feature; use a single operator.`);
        }

        if (! hasCols && ! hasRows) {
            return this._parseGrid(layout);
        }

        const direction = hasCols ? 'cols' : 'rows';
        const separator = hasCols ? '|' : '/';
        const regions = layout.split(separator).map((part) => this._parseGrid(part.trim()));

        if (regions.length < 2) {
            throw new Error(`layout "${layout}": a "${separator}" composite needs at least two regions.`);
        }

        return { kind: 'split', direction, regions };
    }

    /**
     * Parse one region token into a grid node.
     * @param {string} token - '1' or 'RxC'.
     * @returns {GridNode}
     * @throws {Error} On an empty or non-grid token, or non-positive dimensions.
     */
    _parseGrid(token) {
        if (token === '') {
            throw new Error('layout: empty region (check for a stray or trailing separator).');
        }

        if (token === '1') {
            return { kind: 'grid', rows: 1, cols: 1 };
        }

        const match = GRID_RE.exec(token);
        if (! match) {
            throw new Error(`layout: invalid region "${token}"; expected "1" or "{rows}x{cols}" (e.g. "3x2").`);
        }

        const rows = Number(match[1]);
        const cols = Number(match[2]);
        if (rows < 1 || cols < 1) {
            throw new Error(`layout: region "${token}" has a non-positive dimension; rows and cols must be >= 1.`);
        }

        return { kind: 'grid', rows, cols };
    }
}

module.exports = { StructureParser };
