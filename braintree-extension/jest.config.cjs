module.exports = {
  displayName: 'Tests Typescript Application - Service',
  setupFiles: ["<rootDir>/setup-tests.ts"],
  moduleDirectories: ['node_modules', 'src'],
  testMatch: ['**/tests/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[tj]s?(x)'],
  preset: 'ts-jest',
  testEnvironment: 'node',
};
