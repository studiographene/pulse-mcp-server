/* eslint-disable no-undef */
/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src', '<rootDir>/tests'],
	testMatch: ['**/__tests__/**/*.spec.ts', '**/?(*.)+(spec|test).ts'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/**/__tests__/**'],
	coverageDirectory: 'coverage',
	// Reporters configured on the `test` script CLI (--reporters=default
	// --reporters=jest-junit) so they win over any config-file resolution issues
	// in CI. jest-junit's output path comes from the "jest-junit" key in package.json.
};
