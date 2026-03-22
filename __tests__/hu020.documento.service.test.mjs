// __tests__/hu020.documento.service.test.mjs
import { jest } from "@jest/globals";

// ===== mocks =====
const mockPoolQuery = jest.fn();

await jest.unstable_mockModule("../src/db/pool.js", () => ({
    pool: {
        query: mockPoolQuery,
    },
}));

await jest.unstable_mockModule("../src/repositories/permRepo.js", () => ({
    permRepo: {
        getForUser: jest.fn(async () => ["VIEW", "EDIT", "SIGN"]),
    },
}));

await jest.unstable_mockModule("../src/repositories/documentoRepo.js", () => ({
    documentoRepo: {
        findById: jest.fn(async () => null),
    },
}));

await jest.unstable_mockModule("../src/repositories/plantillaRepo.js", () => ({
    plantillaRepo: {},
}));

await jest.unstable_mockModule("../src/repositories/comentariosRepo.js", () => ({
    comentarioRepo: {},
}));

await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: {
        insertBase: jest.fn(async () => 999),
        insertCiclo: jest.fn(async () => {}),
    },
}));

await jest.unstable_mockModule("../src/services/documentMetadata.service.js", () => ({
    documentMetadataService: {},
}));

await jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
    userRepo: {},
}));

await jest.unstable_mockModule("../src/repositories/metadatoRepo.js", () => ({
    metadatoRepo: {},
}));

await jest.unstable_mockModule("../src/services/notificacion.service.js", () => ({
    notificacionService: {
        notifyArchivado: jest.fn(async () => {}),
    },
}));

await jest.unstable_mockModule("../src/services/pdf.service.js", () => ({
    pdfService: {},
}));

await jest.unstable_mockModule("../src/services/word.service.js", () => ({
    wordService: {},
}));

const { documentoRepo } = await import("../src/repositories/documentoRepo.js");
const { bitacoraRepo } = await import("../src/repositories/bitacoraRepo.js");
const { notificacionService } = await import("../src/services/notificacion.service.js");
const { documentoService } = await import("../src/services/documento.service.js");

describe("HU-020 documentoService.archiveDocument", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("falla con FORBIDDEN si no hay usuario autenticado", async () => {
        await expect(
            documentoService.archiveDocument({
                documento_id: 10,
                usuario_id: null,
            })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    test("falla con NOT_FOUND si el documento no existe", async () => {
        // acceso permitido
        mockPoolQuery.mockResolvedValueOnce([[{ ok: 1 }]]);
        documentoRepo.findById.mockResolvedValueOnce(null);

        await expect(
            documentoService.archiveDocument({
                documento_id: 10,
                usuario_id: 5,
            })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    test("falla con STATE_ERROR si la verificación está INVALIDA", async () => {
        mockPoolQuery
            .mockResolvedValueOnce([[{ ok: 1 }]]) // _assertHasAccess
            .mockResolvedValueOnce([[{ verificacion_firma_estado: "INVALIDA" }]]); // select estado verificación

        documentoRepo.findById.mockResolvedValueOnce({
            id: 10,
            titulo: "Acta 10",
            estado: "FIRMA_PARCIAL",
        });

        await expect(
            documentoService.archiveDocument({
                documento_id: 10,
                usuario_id: 5,
            })
        ).rejects.toMatchObject({ code: "STATE_ERROR" });
    });

    test("falla con STATE_ERROR si la verificación está CADUCADA", async () => {
        mockPoolQuery
            .mockResolvedValueOnce([[{ ok: 1 }]])
            .mockResolvedValueOnce([[{ verificacion_firma_estado: "CADUCADA" }]]);

        documentoRepo.findById.mockResolvedValueOnce({
            id: 10,
            titulo: "Acta 10",
            estado: "FIRMA_PARCIAL",
        });

        await expect(
            documentoService.archiveDocument({
                documento_id: 10,
                usuario_id: 5,
            })
        ).rejects.toMatchObject({ code: "STATE_ERROR" });
    });

    test("falla con STATE_ERROR si la verificación está REVOCADA", async () => {
        mockPoolQuery
            .mockResolvedValueOnce([[{ ok: 1 }]])
            .mockResolvedValueOnce([[{ verificacion_firma_estado: "REVOCADA" }]]);

        documentoRepo.findById.mockResolvedValueOnce({
            id: 10,
            titulo: "Acta 10",
            estado: "FIRMA_PARCIAL",
        });

        await expect(
            documentoService.archiveDocument({
                documento_id: 10,
                usuario_id: 5,
            })
        ).rejects.toMatchObject({ code: "STATE_ERROR" });
    });

    test("archiva correctamente si la verificación está VALIDA", async () => {
        mockPoolQuery
            .mockResolvedValueOnce([[{ ok: 1 }]]) // _assertHasAccess
            .mockResolvedValueOnce([[{ verificacion_firma_estado: "VALIDA" }]]) // select estado
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // update archivado

        documentoRepo.findById.mockResolvedValueOnce({
            id: 10,
            titulo: "Acta 10",
            estado: "FIRMA_PARCIAL",
        });

        const out = await documentoService.archiveDocument({
            documento_id: 10,
            usuario_id: 5,
        });

        expect(out).toEqual({
            ok: true,
            documento_id: 10,
            estado: "ARCHIVADO",
            verificacion_firma_estado: "VALIDA",
        });

        expect(mockPoolQuery).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE Documento"),
            [10]
        );

        expect(bitacoraRepo.insertBase).toHaveBeenCalled();
        expect(bitacoraRepo.insertCiclo).toHaveBeenCalled();
        expect(notificacionService.notifyArchivado).toHaveBeenCalledWith({
            documentoId: 10,
            actorId: 5,
        });
    });

    test("si no existe verificacion_firma_estado, permite archivar con PENDIENTE", async () => {
        mockPoolQuery
            .mockResolvedValueOnce([[{ ok: 1 }]])
            .mockResolvedValueOnce([[{ verificacion_firma_estado: null }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        documentoRepo.findById.mockResolvedValueOnce({
            id: 10,
            titulo: "Acta 10",
            estado: "FIRMA_PARCIAL",
        });

        const out = await documentoService.archiveDocument({
            documento_id: 10,
            usuario_id: 5,
        });

        expect(out).toEqual({
            ok: true,
            documento_id: 10,
            estado: "ARCHIVADO",
            verificacion_firma_estado: "PENDIENTE",
        });
    });
});