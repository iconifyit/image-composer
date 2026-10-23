/**
 * Jest configuration for @atomiclotus/image-composer.
 *
 * Node environment (no DOM); the renderer's golden-image tests compare rendered
 * PNG buffers, so there is no jsdom involved.
 */
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    collectCoverageFrom: ['src/**/*.js', 'cli/**/*.js'],
};
