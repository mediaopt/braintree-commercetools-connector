/** @type {import('ts-jest').JestConfigWithTsJest} */

export default {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["@testing-library/jest-dom"],
  roots: ["./test"],
  // uuid v14 is ESM-only (no CommonJS build) — Jest can't parse its `export` syntax under the
  // default CommonJS transform. Vite (the real build) handles this fine; this mapping only
  // affects the test run. See test/mocks/uuidMock.ts.
  moduleNameMapper: {
    "^uuid$": "<rootDir>/test/mocks/uuidMock.ts",
  },
};
