import { jest } from "@jest/globals";
import request from "supertest";

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

await jest.unstable_mockModule("../../src/middleware/authGuard.js", () => ({
    authGuard: (req, _res, next) => {
        req.user = { id: 123, nombre: "Admin" };
        req.actor = { id: 123, nombre: "Admin" };
        next();
    },
}));

const indiceServiceMock = {
    cerrarExpediente: jest.fn(),
    list: jest.fn(),
    getById: jest.fn(),
    getByExpedienteId: jest.fn(),
    listByExpedienteId: jest.fn(),
};

await jest.unstable_mockModule("../../src/services/indice.service.js", () => ({
    indiceService: indiceServiceMock,
}));

let app;
await jest.isolateModulesAsync(async () => {
    ({ app } = await import("../../src/app.js"));
});

describe("HU-023: Índice electrónico (rutas)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("POST /indices/cerrar-expediente/:id -> 201 cuando genera el índice", async () => {
        indiceServiceMock.cerrarExpediente.mockResolvedValue({
            duplicated: false,
            expedienteId: 77,
            indice: { id: 700, expediente_id: 77, hash: "abc123" },
            indiceJson: { expediente: { id: 77 }, totalDocumentos: 1 },
            indiceArchivo: { relativePath: "uploads/indices/indice-expediente-77-700.json" },
            actaPdfArchivo: { relativePath: "uploads/indices/acta-cierre-expediente-77-700.pdf" },
        });

        const res = await request(app).post("/indices/cerrar-expediente/77");

        expect(res.status).toBe(201);
        expect(res.body.indice.id).toBe(700);
        expect(indiceServiceMock.cerrarExpediente).toHaveBeenCalledWith(
            "77",
            expect.objectContaining({ id: 123 }),
        );
    });

    test("POST /indices/cerrar-expediente/:id -> 200 cuando el índice ya existía", async () => {
        indiceServiceMock.cerrarExpediente.mockResolvedValue({
            duplicated: true,
            expedienteId: 80,
            indice: { id: 701, expediente_id: 80, hash: "repetido" },
            indiceJson: { expediente: { id: 80 } },
        });

        const res = await request(app).post("/indices/cerrar-expediente/80");

        expect(res.status).toBe(200);
        expect(res.body.duplicated).toBe(true);
    });

    test("POST /indices/cerrar-expediente/:id -> 422 cuando el servicio rechaza por validación", async () => {
        const err = Object.assign(
            new Error("El expediente no puede cerrarse porque tiene documentos con inconsistencias"),
            {
                code: 422,
                detail: { errores: [{ documentoId: 1, motivo: "test" }] },
            },
        );
        indiceServiceMock.cerrarExpediente.mockRejectedValue(err);

        const res = await request(app).post("/indices/cerrar-expediente/99");

        expect(res.status).toBe(422);
        expect(res.body.message).toContain("inconsistencias");
        expect(res.body.detail).toEqual({ errores: [{ documentoId: 1, motivo: "test" }] });
    });

    test("GET /indices -> 200 lista índices", async () => {
        indiceServiceMock.list.mockResolvedValue([
            { id: 1, expediente_id: 10, hash: "h1" },
            { id: 2, expediente_id: 11, hash: "h2" },
        ]);

        const res = await request(app).get("/indices");

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(indiceServiceMock.list).toHaveBeenCalledTimes(1);
    });

    test("GET /indices/:id -> 200 obtiene un índice existente", async () => {
        indiceServiceMock.getById.mockResolvedValue({
            id: 77,
            hash: "hash-demo",
            firma_id: null,
            expediente_id: 55,
        });

        const res = await request(app).get("/indices/77");

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(77);
        expect(indiceServiceMock.getById).toHaveBeenCalledWith("77");
    });

    test("GET /indices/expediente/:id -> 200 obtiene el índice más reciente del expediente", async () => {
        indiceServiceMock.getByExpedienteId.mockResolvedValue({
            id: 90,
            expediente_id: 55,
            hash: "hash-exp-55",
        });

        const res = await request(app).get("/indices/expediente/55");

        expect(res.status).toBe(200);
        expect(res.body.expediente_id).toBe(55);
        expect(indiceServiceMock.getByExpedienteId).toHaveBeenCalledWith("55");
    });

    test("GET /indices/expediente/:id/lista -> 200 lista todos los índices del expediente", async () => {
        indiceServiceMock.listByExpedienteId.mockResolvedValue([
            { id: 91, expediente_id: 55, hash: "h1" },
            { id: 92, expediente_id: 55, hash: "h2" },
        ]);

        const res = await request(app).get("/indices/expediente/55/lista");

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(indiceServiceMock.listByExpedienteId).toHaveBeenCalledWith("55");
    });
});
