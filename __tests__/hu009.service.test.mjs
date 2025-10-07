// __tests__/hu009.service.test.mjs
import { jest } from "@jest/globals";

// --- Mocks de repos usados por el servicio ---
const mockDocumentoRepo = {
    findById: jest.fn(),
    getLatestVersion: jest.fn(),
    countVersions: jest.fn(),
    insertVersion: jest.fn(),
    updateContenido: jest.fn(),
    updateEstado: jest.fn(),
};

const mockBitacoraRepo = {
    insertBase: jest.fn(),
    insertCiclo: jest.fn(), // <- recibe UN SOLO OBJETO: { id, evento, detalle }
};

// Inyectamos los mocks ANTES de importar el servicio real
await jest.unstable_mockModule("../src/repositories/documentoRepo.js", () => ({
    documentoRepo: mockDocumentoRepo,
}));

await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: mockBitacoraRepo,
}));

// Import real del servicio (ya con mocks aplicados)
const { documentoService } = await import("../src/services/documento.service.js");

describe("HU-009: Control de versiones documentales (servicio)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("crea nueva versión cuando hay cambios de contenido", async () => {
        // Arrange
        const documento_id = 100;
        const usuario_id = 77;
        const base_version_id = 5;

        mockDocumentoRepo.findById.mockResolvedValue({
            id: documento_id,
            titulo: "Acta de Prueba",
            estado: "CREACION",
            contenido: "CONTENIDO ACTUAL", // previo
        });

        mockDocumentoRepo.getLatestVersion.mockResolvedValue({ id: base_version_id }); // cliente al día
        mockDocumentoRepo.countVersions.mockResolvedValue(2); // existen 2 versiones previas -> próxima V3
        mockDocumentoRepo.insertVersion.mockResolvedValue(10); // id versión creada (la anterior al cambio)

        mockBitacoraRepo.insertBase.mockResolvedValue(777);

        const incoming = "CONTENIDO NUEVO"; // cambia vs "CONTENIDO ACTUAL"

        // Act
        const out = await documentoService.colabSave({
            documento_id,
            usuario_id,
            contenido: incoming,
            base_version_id,
        });

        // Assert principales del flujo de guardado/versionado
        expect(mockDocumentoRepo.insertVersion).toHaveBeenCalledWith(
            expect.objectContaining({
                documento_id,
                contenido: "CONTENIDO ACTUAL", // guarda la versión ANTERIOR
                nombre_versionado: "Acta de Prueba_V3",
            })
        );

        expect(mockDocumentoRepo.updateContenido).toHaveBeenCalledWith(documento_id, incoming);
        expect(mockDocumentoRepo.updateEstado).toHaveBeenCalledWith(documento_id, "EDICION");

        // Bitácora: insertBase con acción de edición
        expect(mockBitacoraRepo.insertBase).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "EDICION_DOCUMENTO",
                resultado: expect.stringContaining("Nueva versión"),
                usuario_id,
                documento_id,
            })
        );

        // Bitácora: insertCiclo recibe UN objeto { id, evento, detalle }
        // Validamos campos clave y que el detalle incluya version_id y nombre_versionado
        expect(mockBitacoraRepo.insertCiclo).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 777,
                evento: "EDICION",
                detalle: expect.stringContaining('"version_id":10'),
            })
        );
        expect(mockBitacoraRepo.insertCiclo).toHaveBeenCalledWith(
            expect.objectContaining({
                detalle: expect.stringContaining('"nombre_versionado":"Acta de Prueba_V3"'),
            })
        );

        // Respuesta del servicio
        expect(out.saved).toBe(true);
        expect(out.version_id).toBe(10);
        expect(out.nombre_versionado).toBe("Acta de Prueba_V3");
        expect(out.conflict).toBe(false);
    });

    test("NO crea nueva versión si NO hay cambios (saved:false, reason:NO_CHANGES)", async () => {
        const documento_id = 101;
        const usuario_id = 88;
        const base_version_id = 0;

        mockDocumentoRepo.findById.mockResolvedValue({
            id: documento_id,
            titulo: "Memo",
            estado: "EDICION",
            contenido: "MISMO", // previo
        });

        mockDocumentoRepo.getLatestVersion.mockResolvedValue({ id: base_version_id });

        const out = await documentoService.colabSave({
            documento_id,
            usuario_id,
            contenido: "MISMO", // igual al actual
            base_version_id,
        });

        expect(out.saved).toBe(false);
        expect(out.reason).toBe("NO_CHANGES");
        expect(mockDocumentoRepo.insertVersion).not.toHaveBeenCalled();
        expect(mockDocumentoRepo.updateContenido).not.toHaveBeenCalled();
        expect(mockBitacoraRepo.insertBase).not.toHaveBeenCalled();
        expect(mockBitacoraRepo.insertCiclo).not.toHaveBeenCalled();
    });

    test("lanza conflicto si base_version_id está desactualizado (VERSION_CONFLICT)", async () => {
        const documento_id = 102;
        const usuario_id = 99;

        mockDocumentoRepo.findById.mockResolvedValue({
            id: documento_id,
            titulo: "Acuerdo",
            estado: "EDICION",
            contenido: "A",
        });

        mockDocumentoRepo.getLatestVersion.mockResolvedValue({ id: 12 }); // en servidor hay v=12
        const base_version_id = 11; // cliente trae base desactualizada

        await expect(
            documentoService.colabSave({
                documento_id,
                usuario_id,
                contenido: "B",
                base_version_id,
            })
        ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

        expect(mockDocumentoRepo.insertVersion).not.toHaveBeenCalled();
        expect(mockDocumentoRepo.updateContenido).not.toHaveBeenCalled();
        expect(mockBitacoraRepo.insertBase).not.toHaveBeenCalled();
        expect(mockBitacoraRepo.insertCiclo).not.toHaveBeenCalled();
    });
});
