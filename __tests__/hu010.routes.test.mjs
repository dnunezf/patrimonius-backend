// __tests__/hu010.routes.test.mjs
import { jest } from "@jest/globals";
import request from "supertest";

// Mock auth: inyecta un usuario
await jest.unstable_mockModule("../src/middleware/authGuard.js", () => ({
    authGuard: (req, _res, next) => {
        req.user = { id: 123, nombre: "Admin" };
        next();
    },
}));

// Mock de documentoService para controlar la respuesta de rutas HU-010
const documentoServiceMock = {
    restoreVersion: jest.fn(),
    listVersions: jest.fn(),
};
await jest.unstable_mockModule("../src/services/documento.service.js", () => ({
    documentoService: documentoServiceMock,
}));

let app;
await jest.isolateModulesAsync(async () => {
    ({ app } = await import("../src/app.js"));
});

describe("HU-010: Recuperación de versiones anteriores (rutas)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("POST /documentos/:id/restaurar-version/:versionId -> 200 con payload esperado", async () => {
        documentoServiceMock.restoreVersion.mockResolvedValue({
            documento_id: 55,
            version_origen_id: 9,
            version_restaurada_id: 20,
            nombre_versionado: "Oficio_V5_REST",
        });

        const res = await request(app)
            .post("/documentos/55/restaurar-version/9")
            .send({ motivo: "Revertir errores" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(
            expect.objectContaining({
                documento_id: 55,
                version_origen_id: 9,
                version_restaurada_id: 20,
            })
        );

        expect(documentoServiceMock.restoreVersion).toHaveBeenCalledWith({
            documento_id: 55,
            version_id: 9,
            usuario_id: 123,
            motivo: "Revertir errores",
        });
    });

    test("POST /documentos/:id/restaurar-version/:versionId -> 404 cuando service lanza NOT_FOUND", async () => {
        const err = Object.assign(new Error("Versión no encontrada"), { code: "NOT_FOUND" });
        documentoServiceMock.restoreVersion.mockRejectedValue(err);

        const res = await request(app)
            .post("/documentos/70/restaurar-version/111")
            .send({ motivo: "no importa" });

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("ERROR_RESTAURAR_VERSION");
    });

    test("POST /documentos/:id/restaurar-version/:versionId -> 500 para otros errores", async () => {
        documentoServiceMock.restoreVersion.mockRejectedValue(new Error("DB down"));

        const res = await request(app)
            .post("/documentos/70/restaurar-version/111")
            .send({ motivo: "x" });

        expect(res.status).toBe(500);
        expect(res.body).toEqual(
            expect.objectContaining({
                error: "ERROR_RESTAURAR_VERSION",
                message: "DB down",
            })
        );
    });

    test("GET /documentos/:id/versiones -> 200 lista de versiones (historial accesible)", async () => {
        documentoServiceMock.listVersions.mockResolvedValue([
            { id: 10, fecha: "2025-10-01T10:00:00.000Z", nombre_versionado: "Doc_V1" },
            { id: 11, fecha: "2025-10-02T10:00:00.000Z", nombre_versionado: "Doc_V2" },
        ]);

        const res = await request(app).get("/documentos/55/versiones");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0]).toHaveProperty("id");
        expect(documentoServiceMock.listVersions).toHaveBeenCalledWith(55);
    });
});
