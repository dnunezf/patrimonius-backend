import { jest } from "@jest/globals";
import request from "supertest";

await jest.unstable_mockModule("../src/db/pool.js", () => ({
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

await jest.unstable_mockModule("../src/middleware/authGuard.js", () => ({
    authGuard: (req, _res, next) => {
        req.user = { id: 123, nombre: "Usuario demo" };
        req.actor = { id: 123, nombre: "Usuario demo" };
        next();
    },
}));

const historialBusquedaServiceMock = {
    listarMiHistorial: jest.fn(),
    limpiarMiHistorial: jest.fn(),
    eliminarUnaBusqueda: jest.fn(),
};

await jest.unstable_mockModule("../src/services/historialBusqueda.service.js", () => ({
    historialBusquedaService: historialBusquedaServiceMock,
}));

let app;
await jest.isolateModulesAsync(async () => {
    ({ app } = await import("../src/app.js"));
});

describe("HU-028: Historial de búsqueda (rutas)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("GET /historial-busquedas -> 200 lista historial del usuario autenticado", async () => {
        historialBusquedaServiceMock.listarMiHistorial.mockResolvedValueOnce([
            {
                id: 1,
                usuario_id: 123,
                texto_busqueda: "Documento 66",
                filtros: { vista: "documentos", titulo: "Documento 66" },
            },
        ]);

        const res = await request(app).get("/historial-busquedas?limit=8");

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(historialBusquedaServiceMock.listarMiHistorial).toHaveBeenCalledWith({
            usuario_id: 123,
            limit: 8,
        });
    });

    test("GET /historial-busquedas -> usa limit=10 por defecto si no se envía", async () => {
        historialBusquedaServiceMock.listarMiHistorial.mockResolvedValueOnce([]);

        const res = await request(app).get("/historial-busquedas");

        expect(res.status).toBe(200);
        expect(historialBusquedaServiceMock.listarMiHistorial).toHaveBeenCalledWith({
            usuario_id: 123,
            limit: 10,
        });
    });

    test("GET /historial-busquedas -> usa limit=10 si el limit es inválido", async () => {
        historialBusquedaServiceMock.listarMiHistorial.mockResolvedValueOnce([]);

        const res = await request(app).get("/historial-busquedas?limit=abc");

        expect(res.status).toBe(200);
        expect(historialBusquedaServiceMock.listarMiHistorial).toHaveBeenCalledWith({
            usuario_id: 123,
            limit: 10,
        });
    });

    test("DELETE /historial-busquedas -> 200 limpia historial del usuario", async () => {
        historialBusquedaServiceMock.limpiarMiHistorial.mockResolvedValueOnce({
            deletedCount: 4,
        });

        const res = await request(app).delete("/historial-busquedas");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ deletedCount: 4 });
        expect(historialBusquedaServiceMock.limpiarMiHistorial).toHaveBeenCalledWith({
            usuario_id: 123,
        });
    });

    test("DELETE /historial-busquedas/:id -> 200 elimina una búsqueda del usuario", async () => {
        historialBusquedaServiceMock.eliminarUnaBusqueda.mockResolvedValueOnce({
            deletedCount: 1,
        });

        const res = await request(app).delete("/historial-busquedas/17");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ deletedCount: 1 });
        expect(historialBusquedaServiceMock.eliminarUnaBusqueda).toHaveBeenCalledWith({
            usuario_id: 123,
            historial_id: 17,
        });
    });

    test("GET /historial-busquedas -> 500 si el servicio falla", async () => {
        historialBusquedaServiceMock.listarMiHistorial.mockRejectedValueOnce(
            new Error("fallo inesperado"),
        );

        const res = await request(app).get("/historial-busquedas");

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("internal_error");
    });
});