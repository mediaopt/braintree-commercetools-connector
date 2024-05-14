module.exports = {
  displayName: 'Tests Typescript Application - Event',
  setupFiles: ["<rootDir>/tests/setup-tests.ts"],
  moduleDirectories: ['node_modules', 'src'],
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  testPathIgnorePatterns: ['<rootDir>/tests/setup-tests.ts'],
  preset: 'ts-jest',
  testEnvironment: 'node',
};
