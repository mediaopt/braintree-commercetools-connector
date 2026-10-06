/** @type {import('ts-jest').JestConfigWithTsJest} */

export default {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["@testing-library/jest-dom"],
  transform: {
    // Also covers .js so ts-jest (allowJs is on in tsconfig) can transform the ESM-only
    // `uuid` package below, not just first-party .ts/.tsx sources.
    "^.+\\.(t|j)sx?$": [
      "ts-jest",
      // The project's own tsconfig targets ESM ("module": "esnext", package.json "type": "module")
      // for the Vite build; Jest's default runtime expects CommonJS, so override just for tests.
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
        },
      },
    ],
  },
  // uuid ships ESM-only (no CJS build) — unignore it so the transform above can convert it.
  transformIgnorePatterns: ["node_modules/(?!(uuid)/)"],
  // Don't pick up compiled .spec.js duplicates from the build output.
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};
