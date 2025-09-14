export default {
    testEnvironment: "node",
    transform: {}, // Sin transform, no usaremos Babel
    testMatch: ["**/*.test.mjs", "**/*.spec.mjs"], // Coincide con tus tests ESM
};
