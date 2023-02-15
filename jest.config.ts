const config = {
	verbose: false,
	collectCoverage: true,
	preset: 'ts-jest',
	testMatch: [
		"**/?(*.)+(spec|test).+(ts|tsx|js)",
	],
	transform: {
		"^.+\\.(ts|tsx)$": "ts-jest",
	},
	moduleNameMapper: {
		'^@/(.*)$':'<rootDir>/lib/$1',
	},
};

module.exports = config;
