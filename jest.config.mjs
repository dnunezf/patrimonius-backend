/** Salida JUnit para Azure DevOps / Pipelines (carpeta creada al ejecutar tests). */
const junitReporter = [
    "jest-junit",
    {
        outputDirectory: "./test-results",
        outputName: process.env.JEST_JUNIT_OUTPUT_NAME || "junit.xml",
        suiteName: "patrimonius-backend",
        classNameTemplate: "{filepath}",
        titleTemplate: "{title}",
        ancestorSeparator: " › ",
        addFileAttribute: "true",
    },
];

export default {
    testEnvironment: "node",
    transform: {}, // Sin transform, no usaremos Babel
    testMatch: ["**/*.test.mjs", "**/*.spec.mjs"], // Coincide con tus tests ESM
    clearMocks: true,             // limpia spies entre tests
    testTimeout: 30000,           // margen por si hay IO
    moduleFileExtensions: ["mjs", "js", "json"],
    reporters: ["default", junitReporter],
};
