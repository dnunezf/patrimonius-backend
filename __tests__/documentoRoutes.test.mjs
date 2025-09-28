
import { jest } from "@jest/globals";
import request from "supertest";


jest.unstable_mockModule('../src/services/documento.service.js', () => ({
    documentoService: {
        getAccessibleDocuments: jest.fn(),

    },
}));

jest.unstable_mockModule('../src/middleware/authGuard.js', () => ({
    authGuard: (req, _res, next) => {
        req.user = { id: 123 }; //
        next();
    },
}));

const { app } = await import("../src/app.js");
const { documentoService } = await import("../src/services/documento.service.js");

describe("GET /documents/view/production", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return documents if found", async () => {
        documentoService.getAccessibleDocuments.mockResolvedValue([
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

        const res = await request(app).get('/documents/view/production');

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(2);

        expect(documentoService.getAccessibleDocuments).toHaveBeenCalledWith(123);
    });

    it("should return an empty array if no documents are found", async () => {
        documentoService.getAccessibleDocuments.mockResolvedValue([]);

        const res = await request(app).get('/documents/view/production');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
        expect(documentoService.getAccessibleDocuments).toHaveBeenCalledWith(123);
    });

    it("should return an error if the service throws", async () => {
        documentoService.getAccessibleDocuments.mockRejectedValue(
            new Error("Database connection error")
        );

        const res = await request(app).get('/documents/view/production');

        expect(res.status).toBe(500);
        expect(res.body).toEqual({
            error: "internal_error",
            message: "Database connection error"
        });
        expect(documentoService.getAccessibleDocuments).toHaveBeenCalledWith(123);
    });
});
