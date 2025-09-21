export default {
  testEnvironment: "node",
  transform: {},
  testMatch: ["**/*.test.mjs", "**/*.spec.mjs"],
  clearMocks: true,
  testTimeout: 30000,
  moduleFileExtensions: ["mjs", "js", "json"],
  reporters: [
    "default",
    ["jest-junit", { outputDirectory: "./test-results", outputName: "junit.xml" }]
  ]
};
