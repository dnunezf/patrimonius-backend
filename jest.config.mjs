export default {
    testEnvironment: "node",
    transform: {}, // Sin transform, no usaremos Babel
    testMatch: ["**/*.test.mjs", "**/*.spec.mjs"], // Coincide con tus tests ESM
    clearMocks: true,             // limpia spies entre tests
    testTimeout: 30000,           // margen por si hay IO
    // Útil cuando uses unstable_mockModule/isolateModulesAsync
    // (no obligatorio, pero ayuda a evitar sorpresas)
    moduleFileExtensions: ["mjs", "js", "json"]
};
