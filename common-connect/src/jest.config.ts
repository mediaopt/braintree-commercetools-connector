/** @type {import('ts-jest').JestConfigWithTsJest} */

export default {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["./test"],
  transform: { "^.+\\.tsx?$": "ts-jest" },
};
