module.exports = {
    // Define el entorno de pruebas (en este caso, Node.js)
    testEnvironment: 'node',

    // Si estás usando módulos ES (import/export), usa esta configuración:
    transform: {
        '^.+\\.mjs$': 'babel-jest', // Transformación de archivos .mjs
    },

    // Permite el uso de módulos ECMAScript (ESM) si es necesario
    moduleFileExtensions: ['js', 'mjs', 'json', 'node'],

    // Si tienes archivos específicos que deseas excluir, puedes hacerlo aquí
    transformIgnorePatterns: [
        '/node_modules/', // Excluye node_modules de la transformación
    ],

    // Para garantizar que las funciones de Jest estén disponibles globalmente
    globals: {
        'jest': require('jest'),
    },

    // Si tienes test suites en otros directorios, puedes añadirlos aquí
    testMatch: [
        '**/tests/**/*.test.mjs',  // Agrega la ruta correcta de tus pruebas
        '**/__tests__/**/*.test.mjs',
    ],

    // Esto ayuda a asegurar que Jest sea compatible con las importaciones ES
    moduleNameMapper: {
        '^src/(.*)$': '<rootDir>/src/$1',
    },

    // Usa esta opción si deseas que Jest guarde los resultados de las pruebas
    collectCoverage: true,

    // Para usar jest con Babel si estás trabajando con ES Modules
    transform: {
        '^.+\\.js$': 'babel-jest', // Si usas Babel
    },

    // Si deseas cambiar la forma en que Jest informa, puedes modificar esto
    verbose: true,
};