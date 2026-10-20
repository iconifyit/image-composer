/**
 * Minimal ESLint flat config (ESLint 9). Kept dependency-free: no shareable
 * config packages, just a small rule set and the right globals for CommonJS
 * source and Jest tests.
 */
module.exports = [
    {
        ignores: ['node_modules/**', 'coverage/**'],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                module: 'writable',
                process: 'readonly',
                __dirname: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-undef': 'error',
            'prefer-const': 'error',
            eqeqeq: ['error', 'smart'],
        },
    },
    {
        files: ['tests/**/*.js', '**/*.test.js'],
        languageOptions: {
            globals: {
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                jest: 'readonly',
            },
        },
    },
];
