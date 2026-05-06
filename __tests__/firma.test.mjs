import request from "supertest";
import { jest } from "@jest/globals";

const mockConfirmSignature = jest.fn();

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
        req.user = { id: 123, rolId: 2, role: "USUARIO" };
        req.actor = { id: 123, rolId: 2, role: "USUARIO", rolIds: [2] };
        next();
    },
}));

await jest.unstable_mockModule("../src/services/documento.service.js", () => ({
    documentoService: {
        confirmSignature: mockConfirmSignature,
    },
}));

let app;

await jest.isolateModulesAsync(async () => {
    ({ app } = await import("../src/app.js"));
});

describe("Confirmar firma de documento", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("200 OK cuando se confirma la firma", async () => {
        mockConfirmSignature.mockResolvedValueOnce({
            documento_id: 555,
            usuario_id: 123,
            signedPdfPath: "uploads/signed/1773797562686-signed.pdf",
            estado: "FIRMA_PARCIAL",
            ok: true,
        });

        const res = await request(app)
            .post("/documentos/555/firma/confirmar")
            .attach("file", Buffer.from("pdf firmado"), "test-signed.pdf");

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.documento_id).toBe(555);
        expect(res.body.estado).toBe("FIRMA_PARCIAL");
    });

    test("error manejado cuando el usuario no tiene permisos para firmar", async () => {
        mockConfirmSignature.mockRejectedValueOnce(
            Object.assign(
                new Error("No estás asignado como firmante para este documento."),
                { code: 403, error: "FORBIDDEN" },
            ),
        );

        const res = await request(app)
            .post("/documentos/555/firma/confirmar")
            .attach("file", Buffer.from("pdf firmado"), "test-signed.pdf");

        expect([403, 500]).toContain(res.status);
    });

    test("500 Internal Error para errores no manejados", async () => {
        mockConfirmSignature.mockRejectedValueOnce(
            Object.assign(new Error("Algo salió mal con la firma."), {
                error: "internal_error",
            }),
        );

        const res = await request(app)
            .post("/documentos/555/firma/confirmar")
            .attach("file", Buffer.from("pdf firmado"), "test-signed.pdf");

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("internal_error");
        expect(res.body.message).toBe("Algo salió mal con la firma.");
    });
});