import { jest } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";  // Asegúrate de que `app.js` exporte tu instancia de Express
import { pool } from '../src/db/pool.js';  // Importamos el pool de la base de datos

// Mocks para la base de datos
jest.mock('../src/db/pool.js');

describe("GET /documents/prodution", () => {
    it("should return documents if found", async () => {
        // Simulamos un resultado de la base de datos
        pool.query.mockResolvedValue({
            rows: [
                {
                    documento_nombre: "Document 1",
                    documento_estado: "CREACION",
                    primer_usuario: "Juan Perez",
                    fecha_creacion: "09-10-2025",
                    unidad_nombre: "Departamento A",
                    categoria_nombre: "Categoría 1"
                },
                {
                    documento_nombre: "Document 2",
                    documento_estado: "EDICION",
                    primer_usuario: "Maria Garcia",
                    fecha_creacion: "09-09-2025",
                    unidad_nombre: "Departamento B",
                    categoria_nombre: "Categoría 2"
                }
            ]
        });

        // Hacemos la solicitud a la ruta
        const response = await request(app).get('/document/documents/prodution');

        // Verificar que el código de estado es 200 (OK)
        expect(response.status).toBe(200);

        // Verificar que los documentos están en la respuesta
        expect(response.body).toEqual([
            {
                documento_nombre: "Document 1",
                documento_estado: "CREACION",
                primer_usuario: "Juan Perez",
                fecha_creacion: "09-10-2025",
                unidad_nombre: "Departamento A",
                categoria_nombre: "Categoría 1"
            },
            {
                documento_nombre: "Document 2",
                documento_estado: "EDICION",
                primer_usuario: "Maria Garcia",
                fecha_creacion: "09-09-2025",
                unidad_nombre: "Departamento B",
                categoria_nombre: "Categoría 2"
            }
        ]);
    });

    it("should return an empty array if no documents are found", async () => {
        // Simulamos un resultado vacío de la base de datos
        pool.query.mockResolvedValue({
            rows: []  // No hay documentos
        });

        // Hacemos la solicitud a la ruta
        const response = await request(app).get('/document/documents/prodution');

        // Verificar que el código de estado es 200
        expect(response.status).toBe(200);

        // Verificar que la respuesta sea un array vacío
        expect(response.body).toEqual([]);
    });

    it("should return an error if the database fails", async () => {
        // Simulamos un error en la base de datos
        pool.query.mockRejectedValue(new Error("Database connection error"));

        // Hacemos la solicitud a la ruta
        const response = await request(app).get('/document/documents/prodution');

        // Verificar que el código de estado es 500 (internal error)
        expect(response.status).toBe(500);

        // Verificar que el mensaje de error es el esperado
        expect(response.body).toEqual({
            error: "internal_error",
            message: "Error fetching documents: Database connection error"
        });
    });
});
