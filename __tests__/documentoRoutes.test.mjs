import { jest } from "@jest/globals";
import request from "supertest";

jest.unstable_mockModule('../src/services/documento.service.js', () => ({
    documentoService: {
        getDocumentsFromProduction: jest.fn(),
        getAllDocuments: jest.fn(),
    }
}));

const { app } = await import("../src/app.js");
const { documentoService } = await import("../src/services/documento.service.js");

describe("GET /documents/view/production", () => {
    beforeEach(() => {
        documentoService.getDocumentsFromProduction.mockReset();
    });

    it("should return documents if found", async () => {
        documentoService.getDocumentsFromProduction.mockResolvedValue([
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

        const response = await request(app).get('/documents/view/production');
        expect(response.status).toBe(200);
        expect(response.body.length).toBe(2);
    });

    it("should return an empty array if no documents are found", async () => {
        documentoService.getDocumentsFromProduction.mockResolvedValue([]);
        const response = await request(app).get('/documents/view/production');
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    it("should return an error if the database fails", async () => {
        documentoService.getDocumentsFromProduction.mockRejectedValue(new Error("Database connection error"));
        const response = await request(app).get('/documents/view/production');
        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            error: "internal_error",
            message: "Database connection error"
        });
    });
});
