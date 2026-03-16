import { jest } from "@jest/globals";

// ---- Mocks de dependencias del servicio ----
const mockIndiceRepo = {
    documentoExists: jest.fn(),
    getIndexByHash: jest.fn(),
    createIndex: jest.fn(),
    getIndexById: jest.fn(),
    getAllIndices: jest.fn(),
    getIndicesByDocumentoId: jest.fn(),
    updateIndex: jest.fn(),
    removeIndex: jest.fn(),
};

const mockFirmaRepo = {
    createFirma: jest.fn(),
};

const mockFirmaService = {
    validarFirmaPDF: jest.fn(),
};

const mockLogAdminAction = jest.fn();

// Mock antes del import real
await jest.unstable_mockModule("../src/repositories/indiceRepo.js", () => ({
    indiceRepo: mockIndiceRepo,
}));

await jest.unstable_mockModule("../src/repositories/firmaRepo.js", () => ({
    firmaRepo: mockFirmaRepo,
}));

await jest.unstable_mockModule("../src/services/firma.service.js", () => ({
    firmaService: mockFirmaService,
}));

await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
    logAdminAction: mockLogAdminAction,
    bitacoraRepo: {
        insertBase: jest.fn(),
        insertCiclo: jest.fn(),
        insertActividad: jest.fn(),
    },
}));

// Import real del servicio
const { indiceService } = await import("../src/services/indice.service.js");

describe("HU-023: Índice electrónico (servicio)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("genera firma e índice cuando el PDF firmado es válido", async () => {
        const pdfBuffer = Buffer.from("pdf firmado valido");
        const documentoId = 55;
        const usuarioId = 123;

        mockIndiceRepo.documentoExists.mockResolvedValue({
            id: documentoId,
            titulo: "Acta firmada",
            estado: "FIRMA_PARCIAL",
            numero_serie: "DOC-55",
        });

        mockFirmaService.validarFirmaPDF.mockResolvedValue({
            valido: true,
            mensaje: "Todas las firmas del PDF son válidas (1)",
            firmas: [
                {
                    valido: true,
                    fechaOficial: "2026-03-16T10:00:00.000Z",
                    cert: {
                        subjectCN: "Firmante Demo",
                        serialNumber: "ABC123",
                        issuerCN: "CA Demo",
                    },
                    cadenaConfianza: { valida: true },
                    revocacion: { estado: "GOOD" },
                    timestamp: { valido: true },
                },
            ],
        });

        mockIndiceRepo.getIndexByHash.mockResolvedValue(null);

        mockFirmaRepo.createFirma.mockResolvedValue({
            id: 901,
            documento_id: documentoId,
            usuario_id: usuarioId,
            fecha: new Date("2026-03-16T10:00:00.000Z"),
        });

        mockIndiceRepo.createIndex.mockResolvedValue({
            id: 777,
            hash: "fakehash",
            fecha: new Date("2026-03-16T10:05:00.000Z"),
            firma_id: 901,
            documento_id: documentoId,
            usuario_id: usuarioId,
        });

        const out = await indiceService.generateFromSignedPdf({
            documentoId,
            usuarioId,
            pdfBuffer,
            actor: { id: usuarioId },
        });

        expect(mockIndiceRepo.documentoExists).toHaveBeenCalledWith(documentoId);
        expect(mockFirmaService.validarFirmaPDF).toHaveBeenCalledWith(pdfBuffer);
        expect(mockFirmaRepo.createFirma).toHaveBeenCalledWith(
            expect.objectContaining({
                documento_id: documentoId,
                usuario_id: usuarioId,
            })
        );
        expect(mockIndiceRepo.createIndex).toHaveBeenCalledWith(
            expect.objectContaining({
                firmaId: 901,
            })
        );

        expect(mockLogAdminAction).toHaveBeenCalledWith(
            expect.objectContaining({
                actorId: usuarioId,
                docId: documentoId,
                action: "INDICE_GENERATE",
                result: "OK",
            })
        );

        expect(out.duplicated).toBe(false);
        expect(out.validation.valido).toBe(true);
        expect(out.firma.id).toBe(901);
        expect(out.indice.id).toBe(777);
        expect(out.indiceJson).toEqual(
            expect.objectContaining({
                documentoId,
                firmaId: 901,
                algoritmoHash: "sha256",
            })
        );
    });

    test("no crea índice nuevo si el hash ya existe", async () => {
        const pdfBuffer = Buffer.from("pdf repetido");
        const documentoId = 88;
        const usuarioId = 321;

        mockIndiceRepo.documentoExists.mockResolvedValue({
            id: documentoId,
            titulo: "Doc repetido",
            estado: "ARCHIVADO",
            numero_serie: "DOC-88",
        });

        mockFirmaService.validarFirmaPDF.mockResolvedValue({
            valido: true,
            mensaje: "Firma válida",
            firmas: [],
        });

        mockIndiceRepo.getIndexByHash.mockResolvedValue({
            id: 44,
            hash: "ya-existe",
            fecha: new Date(),
            firma_id: 222,
            documento_id: documentoId,
            usuario_id: usuarioId,
        });

        const out = await indiceService.generateFromSignedPdf({
            documentoId,
            usuarioId,
            pdfBuffer,
            actor: { id: usuarioId },
        });

        expect(out.duplicated).toBe(true);
        expect(mockFirmaRepo.createFirma).not.toHaveBeenCalled();
        expect(mockIndiceRepo.createIndex).not.toHaveBeenCalled();
    });

    test("lanza 422 si la validación de firma falla", async () => {
        const pdfBuffer = Buffer.from("pdf invalido");

        mockIndiceRepo.documentoExists.mockResolvedValue({
            id: 99,
            titulo: "Documento inválido",
            estado: "FIRMA_PARCIAL",
            numero_serie: "DOC-99",
        });

        mockFirmaService.validarFirmaPDF.mockResolvedValue({
            valido: false,
            mensaje: "La firma digital no es válida",
            firmas: [],
        });

        await expect(
            indiceService.generateFromSignedPdf({
                documentoId: 99,
                usuarioId: 1,
                pdfBuffer,
                actor: { id: 1 },
            })
        ).rejects.toMatchObject({
            code: 422,
            message: "La firma digital no es válida",
        });

        expect(mockFirmaRepo.createFirma).not.toHaveBeenCalled();
        expect(mockIndiceRepo.createIndex).not.toHaveBeenCalled();
        expect(mockLogAdminAction).not.toHaveBeenCalled();
    });
});
