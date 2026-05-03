import { jest } from "@jest/globals";
import * as actualFs from "fs";

// ===== Mock fs (preservar exportaciones nombradas p. ej. createWriteStream para puppeteer) =====
await jest.unstable_mockModule("fs", () => ({
    ...actualFs,
    default: {
        ...actualFs.default,
        existsSync: jest.fn(),
        readFileSync: jest.fn(),
        unlinkSync: jest.fn(),
    },
}));

// ===== Mock repos y demás dependencias =====
await jest.unstable_mockModule("../src/repositories/permRepo.js", () => ({
    permRepo: {
        getForUser: jest.fn(),
    },
}));

await jest.unstable_mockModule("../src/db/pool.js", () => ({
    pool: {
        query: jest.fn(),
    },
}));

await jest.unstable_mockModule("../src/repositories/documentoRepo.js", () => ({
    documentoRepo: {
        create: jest.fn(),
        update: jest.fn(),
        findById: jest.fn(),
        updateContent: jest.fn(),
        getLatestVersion: jest.fn(),
        getContenido: jest.fn(),
    },
}));

await jest.unstable_mockModule("../src/repositories/plantillaRepo.js", () => ({
    plantillaRepo: {
        findById: jest.fn(),
    },
}));

await jest.unstable_mockModule("../src/repositories/comentariosRepo.js", () => ({
    comentarioRepo: {
        listByDocumento: jest.fn(),
        insert: jest.fn(),
        findById: jest.fn(),
        resolve: jest.fn(),
    },
}));

const mockBitacoraRepo = {
    insertBase: jest.fn(),
    insertCiclo: jest.fn(),
    insertActividad: jest.fn(),
    logAdminAction: jest.fn(),
};

await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: mockBitacoraRepo,
    logAdminAction: mockBitacoraRepo.logAdminAction,
}));

await jest.unstable_mockModule("../src/services/documentMetadata.service.js", () => ({
    documentMetadataService: {
        captureTechnical: jest.fn(),
        ensureDescriptiveComplete: jest.fn(),
    },
}));

await jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
    userRepo: {
        findById: jest.fn(),
    },
}));

await jest.unstable_mockModule("../src/repositories/metadatoRepo.js", () => ({
    metadatoRepo: {
        upsertByTipo: jest.fn(),
        upsertMap: jest.fn(),
    },
}));

await jest.unstable_mockModule("mammoth", () => ({
    default: {
        convertToHtml: jest.fn(),
    },
}));

await jest.unstable_mockModule("../src/utils/path.js", () => ({
    rutaWebToFs: jest.fn(),
}));

await jest.unstable_mockModule("../src/services/notificacion.service.js", () => ({
    notificacionService: {
        notifyAuthorDocumentEdited: jest.fn(),
        notifyFirma: jest.fn(),
        notifyArchivado: jest.fn(),
    },
}));

await jest.unstable_mockModule("../src/services/pdf.service.js", () => ({
    pdfService: {
        htmlToPdfBuffer: jest.fn(),
    },
}));

await jest.unstable_mockModule("../src/services/word.service.js", () => ({
    wordService: {
        htmlToDocxBuffer: jest.fn(),
    },
}));

const fs = (await import("fs")).default;
const { pool } = await import("../src/db/pool.js");
const { documentoRepo } = await import("../src/repositories/documentoRepo.js");
const { metadatoRepo } = await import("../src/repositories/metadatoRepo.js");
const { bitacoraRepo, logAdminAction } = await import("../src/repositories/bitacoraRepo.js");
const { documentoService } = await import("../src/services/documento.service.js");

/** Metadatos mínimos alineados con serie/subserie/expediente del mock de pool (getExpedienteSnapshot). */
const metadataLoteOk = {
    serieId: 5,
    subserieId: 7,
    expedienteId: 42,
};

describe("Documento service - importArchivedPdfs (carga masiva)", () => {
    beforeEach(() => {
        jest.clearAllMocks();

        bitacoraRepo.insertBase.mockResolvedValue(500);
        bitacoraRepo.insertCiclo.mockResolvedValue(true);
        bitacoraRepo.insertBase.mockResolvedValue(500);
        bitacoraRepo.insertCiclo.mockResolvedValue(true);
        bitacoraRepo.insertActividad.mockResolvedValue(true);
        logAdminAction.mockResolvedValue(true);
        documentoRepo.create.mockResolvedValue({ id: 123 });
        documentoRepo.update.mockResolvedValue(true);

        metadatoRepo.upsertByTipo.mockResolvedValue(true);
        metadatoRepo.upsertMap.mockResolvedValue(true);

        pool.query.mockImplementation(async (sql, params) => {
            const s = String(sql);
            if (s.includes("FROM Expediente e") && s.includes("JOIN Serie")) {
                return [
                    [
                        {
                            expediente_id: Number(params[0]),
                            expediente_codigo: "EXP-T",
                            expediente_nombre: "Exp test",
                            serie_id: 5,
                            subserie_id: 7,
                            serie_codigo: "S",
                            serie_nombre: "Serie",
                            subserie_codigo: "SS",
                            subserie_nombre: "Sub",
                        },
                    ],
                ];
            }
            if (s.includes("FILE_HASH_SHA256")) {
                return [[]];
            }
            if (s.includes("FROM Documento") && s.includes("numero_serie")) {
                return [[]];
            }
            return [[]];
        });

        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(Buffer.from("%PDF-1.4 dummy content"));
        fs.unlinkSync.mockReturnValue(undefined);
    });

    it("should throw FORBIDDEN if usuario_id is missing", async () => {
        await expect(
            documentoService.importArchivedPdfs({
                files: [{ path: "/tmp/a.pdf", originalname: "a.pdf" }],
                usuario_id: null,
                unidad_id: 1,
                origen_documento: "ESCANEADO",
            })
        ).rejects.toMatchObject({
            code: "FORBIDDEN",
            message: "No autenticado",
        });
    });

    it("should throw BAD_REQUEST if unidad_id is missing", async () => {
        await expect(
            documentoService.importArchivedPdfs({
                files: [{ path: "/tmp/a.pdf", originalname: "a.pdf" }],
                usuario_id: 10,
                unidad_id: null,
                origen_documento: "ESCANEADO",
            })
        ).rejects.toMatchObject({
            code: "BAD_REQUEST",
            message: "No se pudo determinar la unidad del usuario",
        });
    });

    it("should throw BAD_REQUEST if files array is empty", async () => {
        await expect(
            documentoService.importArchivedPdfs({
                files: [],
                usuario_id: 10,
                unidad_id: 2,
                origen_documento: "ESCANEADO",
            })
        ).rejects.toMatchObject({
            code: "BAD_REQUEST",
            message: "Debe adjuntar al menos un PDF",
        });
    });

    it("should throw BAD_REQUEST if origen_documento is invalid", async () => {
        await expect(
            documentoService.importArchivedPdfs({
                files: [{ path: "/tmp/a.pdf", originalname: "a.pdf" }],
                usuario_id: 10,
                unidad_id: 2,
                origen_documento: "OTRO",
            })
        ).rejects.toMatchObject({
            code: "BAD_REQUEST",
            message: "El origen del documento debe ser ESCANEADO o ELECTRONICO",
        });
    });

    it("should import a scanned PDF successfully", async () => {
        fs.readFileSync.mockReturnValue(
            Buffer.from("%PDF-1.4 simple scanned pdf mock")
        );

        const result = await documentoService.importArchivedPdfs({
            files: [{ path: "/tmp/scan1.pdf", originalname: "scan1.pdf" }],
            usuario_id: 10,
            unidad_id: 3,
            categoria_id: 8,
            origen_documento: "ESCANEADO",
            metadata_lote: metadataLoteOk,
        });

        expect(result.ok).toBe(true);
        expect(result.origen_documento).toBe("ESCANEADO");
        expect(result.total_recibidos).toBe(1);
        expect(result.total_importados).toBe(1);
        expect(result.total_rechazados).toBe(0);

        expect(documentoRepo.create).toHaveBeenCalledTimes(1);
        expect(documentoRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                titulo: "SCAN1",
                numero_serie: "SCAN1",
                estado: "ARCHIVADO",
                unidad_id: 3,
                usuario_id: 10,
                categoria_id: 8,
            })
        );

        expect(documentoRepo.update).toHaveBeenCalled();

        expect(metadatoRepo.upsertMap).toHaveBeenCalledWith(
            123,
            expect.objectContaining({
                ORIGEN_DOCUMENTO: "ESCANEADO",
            })
        );

        expect(result.importados[0]).toMatchObject({
            documento_id: 123,
            archivo: "scan1.pdf",
            estado: "ARCHIVADO",
        });
    });

    it("should reject file if extension is not pdf", async () => {
        const result = await documentoService.importArchivedPdfs({
            files: [{ path: "/tmp/file1.docx", originalname: "file1.docx" }],
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ESCANEADO",
        });

        expect(result.total_importados).toBe(0);
        expect(result.total_rechazados).toBe(1);
        expect(result.rechazados[0]).toEqual({
            archivo: "file1.docx",
            motivo: "Solo se permiten archivos PDF",
        });

        expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/file1.docx");
        expect(documentoRepo.create).not.toHaveBeenCalled();
    });

    it("should reject duplicate document inside same batch", async () => {
        const sameBuffer = Buffer.from("%PDF-1.4 same pdf binary");
        fs.readFileSync.mockReturnValue(sameBuffer);

        documentoRepo.create.mockResolvedValueOnce({ id: 200 });

        const result = await documentoService.importArchivedPdfs({
            files: [
                { path: "/tmp/a.pdf", originalname: "a.pdf" },
                { path: "/tmp/b.pdf", originalname: "b.pdf" },
            ],
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ESCANEADO",
            metadata_lote: metadataLoteOk,
        });

        expect(result.total_importados).toBe(1);
        expect(result.total_rechazados).toBe(1);

        expect(result.rechazados[0]).toEqual({
            archivo: "b.pdf",
            motivo: "Documento duplicado dentro del mismo lote",
        });

        expect(documentoRepo.create).toHaveBeenCalledTimes(1);
        expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/b.pdf");
    });

    it("should reject duplicate document already existing in system", async () => {
        fs.readFileSync.mockReturnValue(Buffer.from("%PDF-1.4 pdf content unique"));

        pool.query.mockImplementation(async (sql) => {
            const s = String(sql);
            if (s.includes("FILE_HASH_SHA256")) {
                return [
                    [
                        {
                            id: 777,
                            titulo: "Documento ya existente",
                            estado: "ARCHIVADO",
                        },
                    ],
                ];
            }
            return [[]];
        });

        const result = await documentoService.importArchivedPdfs({
            files: [{ path: "/tmp/dup.pdf", originalname: "dup.pdf" }],
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ESCANEADO",
        });

        expect(result.total_importados).toBe(0);
        expect(result.total_rechazados).toBe(1);
        expect(result.rechazados[0]).toEqual({
            archivo: "dup.pdf",
            motivo: "Documento duplicado en el sistema",
            documento_existente_id: 777,
            documento_existente_titulo: "Documento ya existente",
        });

        expect(documentoRepo.create).not.toHaveBeenCalled();
        expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/dup.pdf");
    });

    it("should import electronic PDF without digital signature markers", async () => {
        fs.readFileSync.mockReturnValue(
            Buffer.from("%PDF-1.4 plain electronic pdf mock")
        );

        const result = await documentoService.importArchivedPdfs({
            files: [{ path: "/tmp/elec.pdf", originalname: "elec.pdf" }],
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ELECTRONICO",
            metadata_lote: metadataLoteOk,
        });

        expect(result.total_importados).toBe(1);
        expect(result.total_rechazados).toBe(0);
        expect(result.importados[0]).toMatchObject({
            archivo: "elec.pdf",
            estado: "ARCHIVADO",
        });
        expect(documentoRepo.create).toHaveBeenCalledTimes(1);
    });

    it("should import scanned PDF if it contains digital signature markers", async () => {
        fs.readFileSync.mockReturnValue(
            Buffer.from("%PDF-1.4 scanned \x00 abc /Type /Sig xyz /ByteRange 123")
        );

        const result = await documentoService.importArchivedPdfs({
            files: [
                {
                    path: "/tmp/signed-scan.pdf",
                    originalname: "signed-scan.pdf",
                },
            ],
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ESCANEADO",
            metadata_lote: metadataLoteOk,
        });

        expect(result.total_importados).toBe(1);
        expect(result.total_rechazados).toBe(0);
        expect(result.importados[0]).toMatchObject({
            archivo: "signed-scan.pdf",
            estado: "ARCHIVADO",
        });
        expect(documentoRepo.create).toHaveBeenCalledTimes(1);
    });

    it("should import electronic PDF with digital signature markers", async () => {
        fs.readFileSync.mockReturnValue(
            Buffer.from("%PDF-1.4 electronic abc /Type /Sig xyz /ByteRange 123")
        );

        documentoRepo.create.mockResolvedValue({ id: 456 });

        const result = await documentoService.importArchivedPdfs({
            files: [
                {
                    path: "/tmp/electronic-signed.pdf",
                    originalname: "electronic-signed.pdf",
                },
            ],
            usuario_id: 10,
            unidad_id: 3,
            categoria_id: 9,
            origen_documento: "ELECTRONICO",
            metadata_lote: metadataLoteOk,
        });

        expect(result.total_importados).toBe(1);
        expect(result.total_rechazados).toBe(0);

        expect(documentoRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                titulo: "ELECTRONIC-SIGNED",
                numero_serie: "ELECTRONIC-SIGNED",
                estado: "ARCHIVADO",
                unidad_id: 3,
                usuario_id: 10,
                categoria_id: 9,
            })
        );

        expect(result.importados[0]).toMatchObject({
            documento_id: 456,
            archivo: "electronic-signed.pdf",
            estado: "ARCHIVADO",
        });

        expect(documentoRepo.update).toHaveBeenCalled();

        expect(metadatoRepo.upsertMap).toHaveBeenCalledWith(
            result.importados[0].documento_id,
            expect.objectContaining({
                ORIGEN_DOCUMENTO: "ELECTRONICO",
            })
        );
    });
});