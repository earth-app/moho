export default {
	preset: 'ts-jest/presets/default-esm',
	testEnvironment: 'node',
	extensionsToTreatAsEsm: ['.ts'],
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1'
	},
	transform: {
		'^.+\\.ts$': [
			'ts-jest',
			{
				useESM: true
			}
		]
	},
	testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
	// the live lane hits the network; it runs via `bun run test:live`, never on the gate
	testPathIgnorePatterns: ['/node_modules/', '/test/live/'],
	collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts']
};
