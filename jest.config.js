module.exports = {
	moduleNameMapper: {
		'^src/(.*)$': '<rootDir>/src/$1'
	},
	testEnvironment: 'node',
	preset: 'ts-jest',
	testMatch: ['**/*.spec.ts']
}
