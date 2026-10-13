/** @type {import('ts-jest').JestConfigWithTsJest} */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['./test/jest.setup.ts'],
  roots: ['./test'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    // jose (via connect-payments-sdk's jwks-rsa) is ESM-only
    '^.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true, isolatedModules: true } }],
  },
  transformIgnorePatterns: ['node_modules/(?!(common-connect|jose)/)'],
};
