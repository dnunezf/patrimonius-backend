// __tests__/hu010.service.test.mjs
import { jest } from "@jest/globals";

// ---- Mocks de repos/DB usados por el servicio ----
const mockDocumentoRepo = {
    findById: jest.fn(),
    findVersionById: jest.fn(),
    countVersions: jest.fn(),
    insertVersion: jest.fn(),
    updateContenido: jest.fn(),
    updateEstado: jest.fn(),
};

const mockBitacoraRepo = {
    insertBase: jest.fn(),
    insertCiclo: jest.fn(), // firma: insertCiclo({ id, evento, detalle })
};

const mockPool = {
    query: jest.fn(async () => [[{ ok: 1 }]]),
};

// Inyectamos los mocks ANTES de importar el servicio real
await jest.unstable_mockModule("../../src/repositories/documentoRepo.js", () => ({
    documentoRepo: mockDocumentoRepo,
}));
await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: mockBitacoraRepo,
    logAdminAction: jest.fn(),
    logSecurityEvent: jest.fn(),
}));
await jest.unstable_mockModule("../../src/db/pool.js", () => ({
    pool: mockPool,
}));

// Import del servicio ya con mocks aplicados
const { documentoService } = await import("../../src/services/documento.service.js");

describe("HU-010: Recuperación de versiones anteriores (servicio)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("restaura creando nueva versión y actualizando snapshot", async () => {
        const documento_id = 20;
        const version_id = 10;   // versión origen
        const usuario_id = 777;
        const motivo = "Corrección de error";

        mockDocumentoRepo.findById.mockResolvedValue({
            id: documento_id,
            titulo: "Acta de Junta",
            estado: "EDICION",
            contenido: "CONTENIDO ACTUAL",
        });

        mockDocumentoRepo.findVersionById.mockResolvedValue({
            id: version_id,
            documento_id,
            fecha: new Date(),
            contenido: "CONTENIDO ORIGINAL",
            nombre_versionado: "Acta de Junta_V1",
        });

        mockDocumentoRepo.countVersions.mockResolvedValue(2); // próxima será V3 (contando desde 1)
        mockDocumentoRepo.insertVersion.mockResolvedValue(30); // id de la versión NUEVA creada por la restauración

        mockBitacoraRepo.insertBase.mockResolvedValue(555); // id base para bitácora

        const out = await documentoService.restoreVersion({
            documento_id,
            version_id,
            usuario_id,
            motivo,
        });

        // Se crea una NUEVA versión con el contenido de la versión origen
        expect(mockDocumentoRepo.insertVersion).toHaveBeenCalledWith(
            expect.objectContaining({
                documento_id,
                contenido: "CONTENIDO ORIGINAL",
                nombre_versionado: "Acta de Junta_V3_REST",
            })
        );

        // Se actualiza el snapshot del documento y su estado
        expect(mockDocumentoRepo.updateContenido).toHaveBeenCalledWith(documento_id, "CONTENIDO ORIGINAL");
        expect(mockDocumentoRepo.updateEstado).toHaveBeenCalledWith(documento_id, "EDICION");

        // Bitácora base (solo validamos acción y contexto principal)
        expect(mockBitacoraRepo.insertBase).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "DOC_VERSION_RESTORE",
                usuario_id,
                documento_id,
            })
        );

        // Bitácora ciclo: un solo objeto { id, evento, detalle }
        expect(mockBitacoraRepo.insertCiclo).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 555,
                evento: "EDICION",
                detalle: expect.stringContaining('"accion_solicitada":"RESTAURAR_VERSION"'),
            })
        );
        expect(mockBitacoraRepo.insertCiclo).toHaveBeenCalledWith(
            expect.objectContaining({
                detalle: expect.stringContaining('"version_origen_id":10'),
            })
        );
        expect(mockBitacoraRepo.insertCiclo).toHaveBeenCalledWith(
            expect.objectContaining({
                detalle: expect.stringContaining('"version_creada_id":30'),
            })
        );
        expect(mockBitacoraRepo.insertCiclo).toHaveBeenCalledWith(
            expect.objectContaining({
                detalle: expect.stringContaining('"motivo":"Corrección de error"'),
            })
        );

        // Respuesta del servicio
        expect(out).toEqual(
            expect.objectContaining({
                documento_id,
                version_origen_id: version_id,
                version_restaurada_id: 30,
                nombre_versionado: "Acta de Junta_V3_REST",
            })
        );
    });

    test("lanza NOT_FOUND si la versión no existe o no corresponde al documento", async () => {
        const documento_id = 21;
        const version_id = 999;
        const usuario_id = 1;

        mockDocumentoRepo.findById.mockResolvedValue({ id: documento_id, titulo: "Doc X", estado: "EDICION" });
        mockDocumentoRepo.findVersionById.mockResolvedValue(null);

        await expect(
            documentoService.restoreVersion({ documento_id, version_id, usuario_id, motivo: "x" })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });

        // o si pertenece a otro documento
        mockDocumentoRepo.findVersionById.mockResolvedValue({
            id: version_id, documento_id: 9999, contenido: "C"
        });

        await expect(
            documentoService.restoreVersion({ documento_id, version_id, usuario_id, motivo: "y" })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    test("rechaza si el usuario no está autenticado", async () => {
        await expect(
            documentoService.restoreVersion({ documento_id: 1, version_id: 2, usuario_id: 0 })
        ).rejects.toThrow("No autenticado");
    });
});
