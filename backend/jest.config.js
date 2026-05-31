/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  setupFiles: [],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  testTimeout: 30000,
  maxWorkers: 1,
};
