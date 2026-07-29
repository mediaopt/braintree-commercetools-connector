module.exports = {
  displayName: 'Tests Typescript Application - braintree-extension',
  setupFiles: ['<rootDir>/tests/setup-tests.ts'],
  moduleDirectories: ['node_modules', 'src'],
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  transformIgnorePatterns: ['node_modules/(?!(common-connect)/)'],
  collectCoverageFrom: ['src/**/*.ts'],
};
