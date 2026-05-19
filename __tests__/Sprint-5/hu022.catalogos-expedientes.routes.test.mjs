import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const mockSerieGetByUnidadId = jest.fn();
const mockSubserieGetByUnidadId = jest.fn();
const mockExpedienteList = jest.fn();

await jest.unstable_mockModule("../../src/services/serie.service.js", () => ({
    serieService: {
        getSeriesByUnidadId: mockSerieGetByUnidadId,
        createSerie: jest.fn(),
        getSerieById: jest.fn(),
        updateSerie: jest.fn(),
        deleteSerie: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/services/subserie.service.js", () => ({
    subserieService: {
        getSubseriesByUnidadId: mockSubserieGetByUnidadId,
        createSubserie: jest.fn(),
        getSubserieById: jest.fn(),
        updateSubserie: jest.fn(),
        deleteSubserie: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/services/expediente.service.js", () => ({
    expedienteService: {
        list: mockExpedienteList,
        searchAccess: jest.fn(),
        getDocumentosAccesoExpediente: jest.fn(),
        getById: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
    },
}));

const { default: serieRouter } = await import("../../src/routes/serie.routes.js");
const { default: subserieRouter } = await import("../../src/routes/subserie.routes.js");
const { default: expedienteRouter } = await import("../../src/routes/expediente.routes.js");

function buildApp(user = { id: 99, unidad_id: 7, unidadId: 7 }) {
    const app = express();
    app.use(express.json());

    app.use((req, _res, next) => {
        req.user = user;
        req.actor = user;
        next();
    });

    app.use("/api/series", serieRouter);
    app.use("/subseries", subserieRouter);
    app.use("/api/expedientes", expedienteRouter);

    return app;
}

describe("HU-022: rutas de catálogos y expedientes", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("GET /api/series devuelve series de la unidad autenticada", async () => {
        mockSerieGetByUnidadId.mockResolvedValueOnce([
            { id: 1, nombre: "Serie A", unidad_id: 7 },
        ]);

        const app = buildApp();
        const res = await request(app).get("/api/series");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ id: 1, nombre: "Serie A", unidad_id: 7 }]);
        expect(mockSerieGetByUnidadId).toHaveBeenCalledWith(7);
    });

    test("GET /subseries devuelve subseries de la unidad autenticada", async () => {
        mockSubserieGetByUnidadId.mockResolvedValueOnce([
            { id: 10, nombre: "Subserie A", serie_id: 1 },
        ]);

        const app = buildApp();
        const res = await request(app).get("/subseries");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ id: 10, nombre: "Subserie A", serie_id: 1 }]);
        expect(mockSubserieGetByUnidadId).toHaveBeenCalledWith(7);
    });

    test("GET /api/expedientes inyecta unidad_id del usuario autenticado", async () => {
        mockExpedienteList.mockResolvedValueOnce([
            { id: 33, codigo: "EXP-33", unidad_id: 7 },
        ]);

        const app = buildApp();
        const res = await request(app).get("/api/expedientes?serie_id=2&estado=ACTIVO");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ id: 33, codigo: "EXP-33", unidad_id: 7 }]);

        expect(mockExpedienteList).toHaveBeenCalledWith({
            serie_id: "2",
            estado: "ACTIVO",
            unidad_id: 7,
        });
    });

    test("GET /api/expedientes responde 400 si no se puede resolver unidad del usuario", async () => {
        const app = buildApp({ id: 99 });

        const res = await request(app).get("/api/expedientes");

        expect(res.status).toBe(400);
        expect(res.body.message).toBe(
            "No se pudo determinar la unidad del usuario autenticado",
        );
        expect(mockExpedienteList).not.toHaveBeenCalled();
    });

    test("GET /api/series responde 400 si no hay unidad autenticada", async () => {
        const app = buildApp({ id: 99 });

        const res = await request(app).get("/api/series");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(
            "No se pudo determinar la unidad del usuario autenticado",
        );
    });

    test("GET /subseries responde 400 si no hay unidad autenticada", async () => {
        const app = buildApp({ id: 99 });

        const res = await request(app).get("/subseries");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(
            "No se pudo determinar la unidad del usuario autenticado",
        );
    });
});