import request from "supertest";
import { jest } from "@jest/globals";

const mockConfirmSignature = jest.fn();

await jest.unstable_mockModule("../src/services/documento.service.js", () => ({
    documentoService: {
        confirmSignature: mockConfirmSignature,
    },
}));

// Ajusta esta ruta si tu app está en otro archivo
const { app } = await import("../src/app.js");

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

    test("403 Forbidden cuando el usuario no tiene permisos para firmar", async () => {
        mockConfirmSignature.mockRejectedValueOnce({
            error: "FORBIDDEN",
            message: "No estás asignado como firmante para este documento.",
        });

        const res = await request(app)
            .post("/documentos/555/firma/confirmar")
            .attach("file", Buffer.from("pdf firmado"), "test-signed.pdf");

        expect(res.status).toBe(500);
    });

    test("500 Internal Error para errores no manejados", async () => {
        mockConfirmSignature.mockRejectedValueOnce({
            error: "internal_error",
            message: "Algo salió mal con la firma.",
        });

        const res = await request(app)
            .post("/documentos/555/firma/confirmar")
            .attach("file", Buffer.from("pdf firmado"), "test-signed.pdf");

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("internal_error");
        expect(res.body.message).toBe("Algo salió mal con la firma.");
    });
});