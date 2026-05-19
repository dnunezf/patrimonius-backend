// __tests__/hu009.routes.test.mjs
import { jest } from "@jest/globals";
import request from "supertest";

// Mock pool para que las rutas no usen MySQL real
await jest.unstable_mockModule("../../src/db/pool.js", () => ({
    pool: {
        query: jest.fn(async () => [[], []]),
        execute: jest.fn(async () => [[], []]),
        getConnection: jest.fn(async () => ({
            query: jest.fn(async () => [[], []]),
            execute: jest.fn(async () => [[], []]),
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
        })),
    },
}));

// Mock del authGuard para inyectar usuario
await jest.unstable_mockModule("../../src/middleware/authGuard.js", () => ({
    authGuard: (req, _res, next) => {
        req.user = { id: 123 };
        next();
    },
}));

// Mock del servicio para controlar respuestas/errores
const documentoServiceMock = {
    colabSave: jest.fn(),
};
await jest.unstable_mockModule("../../src/services/documento.service.js", () => ({
    documentoService: documentoServiceMock,
}));

let app;
await jest.isolateModulesAsync(async () => {
    const mod = await import("../../src/app.js");
    app = mod.app || (mod.default && (mod.default.app || mod.default)) || mod.default || mod.app;
});

describe("HU-009: Control de versiones documentales (ruta PUT /documentos/:id/colab-guardar)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("200 OK cuando guarda nueva versión", async () => {
        documentoServiceMock.colabSave.mockResolvedValue({
            version_id: 10,
            next_version: 10,
            conflict: false,
            saved: true,
            nombre_versionado: "Acta_V3",
        });

        const res = await request(app)
            .put("/documentos/555/colab-guardar")
            .send({ contenido: "Nuevo contenido", base_version_id: 7 });

        expect(res.status).toBe(200);
        expect(res.body.saved).toBe(true);
        expect(res.body.version_id).toBe(10);

        expect(documentoServiceMock.colabSave).toHaveBeenCalledWith({
            documento_id: 555,
            usuario_id: 123,
            contenido: "Nuevo contenido",
            base_version_id: 7,
        });
    });

    test("409 Conflict cuando el servicio lanza VERSION_CONFLICT", async () => {
        const conflict = Object.assign(new Error("Versión desactualizada"), {
            code: "VERSION_CONFLICT",
            details: { latest_version_id: 42 },
        });
        documentoServiceMock.colabSave.mockRejectedValue(conflict);

        const res = await request(app)
            .put("/documentos/555/colab-guardar")
            .send({ contenido: "x", base_version_id: 5 });

        expect(res.status).toBe(409);
        expect(res.body.error).toBe("version_conflict");
    });

    test("500 Internal Error para otros errores", async () => {
        documentoServiceMock.colabSave.mockRejectedValue(new Error("DB down"));

        const res = await request(app)
            .put("/documentos/555/colab-guardar")
            .send({ contenido: "x", base_version_id: 5 });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({
            error: "internal_error",
            message: "DB down",
        });
    });
});
