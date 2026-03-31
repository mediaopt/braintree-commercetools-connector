/** @type {import('ts-jest').JestConfigWithTsJest} */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['./test/jest.setup.ts'],
  roots: ['./test'],
  transform: { '^.+\\.tsx?$': 'ts-jest' },
  transformIgnorePatterns: ['node_modules/(?!(common-connect)/)'],
};
