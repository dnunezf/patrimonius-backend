import { jest } from "@jest/globals";
import request from "supertest";

// Mock pool para evitar tocar la BD real
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

// Mock authGuard para inyectar usuario autenticado
await jest.unstable_mockModule("../src/middleware/authGuard.js", () => ({
    authGuard: (req, _res, next) => {
        req.user = { id: 123, nombre: "Admin" };
        next();
    },
}));

// Mock multer/upload para no depender del middleware real
await jest.unstable_mockModule("../src/middleware/uploadFirma.js", () => ({
    uploadSingle: (_field) => (req, _res, next) => {
        req.file = {
            originalname: "firmado.pdf",
            buffer: Buffer.from("pdf de prueba"),
            mimetype: "application/pdf",
        };

        req.body = {
            documentoId: req.headers["x-documento-id"],
            usuarioId: req.headers["x-usuario-id"],
        };

        next();
    },
}));

const indiceServiceMock = {
    generateFromSignedPdf: jest.fn(),
    create: jest.fn(),
    list: jest.fn(),
    getById: jest.fn(),
    listByDocumento: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
};

await jest.unstable_mockModule("../src/services/indice.service.js", () => ({
    indiceService: indiceServiceMock,
}));

let app;
await jest.isolateModulesAsync(async () => {
    ({ app } = await import("../src/app.js"));
});

describe("HU-023: Índice electrónico (rutas)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("POST /indices/generar -> 201 cuando genera correctamente el índice", async () => {
        indiceServiceMock.generateFromSignedPdf.mockResolvedValue({
            duplicated: false,
            validation: { valido: true, mensaje: "Firma válida" },
            firma: { id: 500, documento_id: 77, usuario_id: 123 },
            indice: { id: 700, firma_id: 500, hash: "abc123" },
            indiceJson: { documentoId: 77, firmaId: 500, algoritmoHash: "sha256" },
        });

        const res = await request(app)
            .post("/indices/generar")
            .set("x-documento-id", "77")
            .set("x-usuario-id", "123");

        expect(res.status).toBe(201);
        expect(res.body.indice.id).toBe(700);

        expect(indiceServiceMock.generateFromSignedPdf).toHaveBeenCalledWith(
            expect.objectContaining({
                documentoId: "77",
                usuarioId: "123",
                actor: expect.objectContaining({ id: 123 }),
                pdfBuffer: expect.any(Buffer),
            })
        );
    });

    test("POST /indices/generar -> 200 cuando el índice ya existía", async () => {
        indiceServiceMock.generateFromSignedPdf.mockResolvedValue({
            duplicated: true,
            validation: { valido: true, mensaje: "Firma válida" },
            indice: { id: 701, firma_id: 501, hash: "repetido" },
            indiceJson: { documentoId: 80, firmaId: 501, algoritmoHash: "sha256" },
        });

        const res = await request(app)
            .post("/indices/generar")
            .set("x-documento-id", "80")
            .set("x-usuario-id", "123");

        expect(res.status).toBe(200);
        expect(res.body.duplicated).toBe(true);
    });

    test("POST /indices/generar -> 422 cuando la firma no es válida", async () => {
        const err = Object.assign(new Error("La firma digital no es válida"), {
            code: 422,
            detail: { valido: false, mensaje: "La firma digital no es válida" },
        });

        indiceServiceMock.generateFromSignedPdf.mockRejectedValue(err);

        const res = await request(app)
            .post("/indices/generar")
            .set("x-documento-id", "99")
            .set("x-usuario-id", "123");

        expect(res.status).toBe(422);
        expect(res.body.message).toBe("La firma digital no es válida");
    });

    test("GET /indices/:id -> 200 obtiene un índice existente", async () => {
        indiceServiceMock.getById.mockResolvedValue({
            id: 77,
            hash: "hash-demo",
            firma_id: 18,
            documento_id: 55,
        });

        const res = await request(app).get("/indices/77");

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(77);
        expect(indiceServiceMock.getById).toHaveBeenCalledWith("77");
    });
});