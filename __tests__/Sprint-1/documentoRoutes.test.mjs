
import { jest } from "@jest/globals";
import request from "supertest";

// Mock pool para evitar usar la BD real
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

const documentoServiceMock = {
    getAccessibleDocuments: jest.fn(),
};

await jest.unstable_mockModule("../../src/services/documento.service.js", () => ({
    documentoService: documentoServiceMock,
}));

await jest.unstable_mockModule("../../src/middleware/authGuard.js", () => ({
    authGuard: (req, _res, next) => {
        req.user = { id: 123 };
        next();
    },
}));

let app;
await jest.isolateModulesAsync(async () => {
    ({ app } = await import("../../src/app.js"));
});

describe("GET /view/production (documentos accesibles)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return documents if found", async () => {
        documentoServiceMock.getAccessibleDocuments.mockResolvedValue([
            {
                documento_nombre: "Document 1",
                documento_estado: "CREACION",
                primer_usuario: "Juan Perez",
                fecha_creacion: "09-10-2025",
                unidad_nombre: "Departamento A",
                categoria_nombre: "Categoría 1",
                numero_firmas: 2,
                firmas_obtenidas: 0
            },
            {
                documento_nombre: "Document 2",
                documento_estado: "EDICION",
                primer_usuario: "Maria Garcia",
                fecha_creacion: "09-09-2025",
                unidad_nombre: "Departamento B",
                categoria_nombre: "Categoría 2",
                numero_firmas: 1,
                firmas_obtenidas: 0
            }
        ]);

        const res = await request(app).get('/view/production');

        expect(documentoServiceMock.getAccessibleDocuments).toHaveBeenCalled();
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(2);

        expect(documentoServiceMock.getAccessibleDocuments).toHaveBeenCalledWith(123);
    });

    it("should return an empty array if no documents are found", async () => {
        documentoServiceMock.getAccessibleDocuments.mockResolvedValue([]);

        const res = await request(app).get('/view/production');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
        expect(documentoServiceMock.getAccessibleDocuments).toHaveBeenCalledWith(123);
    });

    it("should return an error if the service throws", async () => {
        documentoServiceMock.getAccessibleDocuments.mockRejectedValue(
            new Error("Database connection error")
        );

        const res = await request(app).get('/view/production');

        expect(res.status).toBe(500);
        expect(res.body).toEqual({
            error: "internal_error",
            message: "Database connection error"
        });
        expect(documentoServiceMock.getAccessibleDocuments).toHaveBeenCalledWith(123);
    });
});
