import { jest } from "@jest/globals";
import * as actualFs from "fs";

// ===== Mock fs =====
await jest.unstable_mockModule("fs", () => ({
    ...actualFs,
    default: {
        ...actualFs.default,
        existsSync: jest.fn(),
        readFileSync: jest.fn(),
        unlinkSync: jest.fn(),
    },
}));

// ===== Mock repos y dependencias =====
await jest.unstable_mockModule("../../src/repositories/permRepo.js", () => ({
    permRepo: {
        getForUser: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/db/pool.js", () => ({
    pool: {
        query: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/repositories/documentoRepo.js", () => ({
    documentoRepo: {
        create: jest.fn(),
        update: jest.fn(),
        findById: jest.fn(),
        updateContent: jest.fn(),
        getLatestVersion: jest.fn(),
        getContenido: jest.fn(),
        insertDocumento: jest.fn(),
        linkPlantilla: jest.fn(),
        insertVersion: jest.fn(),
        updateContenido: jest.fn(),
        updateEstado: jest.fn(),
        findVersionById: jest.fn(),
        countVersions: jest.fn(),
        sign: jest.fn(),
        getByExpedienteId: jest.fn(),
        findArchivedForExternal: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/repositories/documentoAnexoRepo.js", () => ({
    documentoAnexoRepo: {
        create: jest.fn(),
        listByDocumento: jest.fn(),
        findById: jest.fn(),
        deleteById: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/repositories/plantillaRepo.js", () => ({
    plantillaRepo: {
        findById: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/repositories/comentariosRepo.js", () => ({
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

await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: mockBitacoraRepo,
    logAdminAction: mockBitacoraRepo.logAdminAction,
}));

await jest.unstable_mockModule("../../src/repositories/bitacoraExpedienteRepo.js", () => ({
    insertBitacoraExpedienteSafe: jest.fn(),
    resolveBitacoraUsuarioId: jest.fn((id) => id),
}));

await jest.unstable_mockModule("../../src/services/documentMetadata.service.js", () => ({
    documentMetadataService: {
        captureTechnical: jest.fn(),
        ensureDescriptiveComplete: jest.fn(),
        markApproved: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/repositories/userRepo.js", () => ({
    userRepo: {
        findById: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/repositories/metadatoRepo.js", () => ({
    metadatoRepo: {
        upsertByTipo: jest.fn(),
        upsertMap: jest.fn(),
        findByTipo: jest.fn(),
        getMap: jest.fn(),
    },
}));

await jest.unstable_mockModule("mammoth", () => ({
    default: {
        convertToHtml: jest.fn(),
    },
}));

await jest.unstable_mockModule("pizzip", () => ({
    default: jest.fn(),
}));

await jest.unstable_mockModule("../../src/utils/path.js", () => ({
    rutaWebToFs: jest.fn(),
}));

await jest.unstable_mockModule("../../src/services/notificacion.service.js", () => ({
    notificacionService: {
        notifyAuthorDocumentEdited: jest.fn(),
        notifyFirma: jest.fn(),
        notifyArchivado: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/services/pdf.service.js", () => ({
    pdfService: {
        htmlToPdfBuffer: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/services/word.service.js", () => ({
    wordService: {
        htmlToDocxBuffer: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/services/indice.service.js", () => ({
    indiceService: {},
}));

await jest.unstable_mockModule("../../src/utils/pdfMetadataEmbed.js", () => ({
    resolvePdfMetadataFields: jest.fn(() => ({
        title: "Documento",
        creator: "Patrimonius",
        subject: "",
        keywords: "",
        author: "",
        creationDate: new Date(),
        modificationDate: new Date(),
    })),
    embedStandardMetadataInPdfBuffer: jest.fn(async (buffer) => buffer),
}));

const fs = (await import("fs")).default;
const { pool } = await import("../../src/db/pool.js");
const { documentoRepo } = await import("../../src/repositories/documentoRepo.js");
const { documentoAnexoRepo } = await import("../../src/repositories/documentoAnexoRepo.js");
const { metadatoRepo } = await import("../../src/repositories/metadatoRepo.js");
const { bitacoraRepo, logAdminAction } = await import("../../src/repositories/bitacoraRepo.js");
const { insertBitacoraExpedienteSafe } = await import("../../src/repositories/bitacoraExpedienteRepo.js");
const { documentoService } = await import("../../src/services/documento.service.js");

const pdfBuffer = (content = "contenido pdf") =>
    Buffer.from(`%PDF-1.4\n${content}\n%%EOF`);

const metadataLoteOk = {
    serieId: 5,
    subserieId: 7,
    expedienteId: 42,
    nivelAcceso: "INTERNAL",
    plazoConservacionAnios: 5,
};

function mockPoolBase() {
    pool.query.mockImplementation(async (sql, params = []) => {
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
}

describe("Documento service - importArchivedPdfs (carga masiva)", () => {
    beforeEach(() => {
        jest.clearAllMocks();

        bitacoraRepo.insertBase.mockResolvedValue(500);
        bitacoraRepo.insertCiclo.mockResolvedValue(true);
        bitacoraRepo.insertActividad.mockResolvedValue(true);
        logAdminAction.mockResolvedValue(true);

        documentoRepo.create.mockResolvedValue({ id: 123 });
        documentoRepo.update.mockResolvedValue({ id: 123 });
        documentoRepo.findById.mockResolvedValue({
            id: 123,
            titulo: "SCAN1",
            numero_serie: "SCAN1",
            estado: "ARCHIVADO",
        });

        documentoAnexoRepo.create.mockResolvedValue({
            id: 900,
            nombre_original: "anexo.pdf",
        });

        metadatoRepo.upsertByTipo.mockResolvedValue(true);
        metadatoRepo.upsertMap.mockResolvedValue(true);
        metadatoRepo.findByTipo.mockResolvedValue(null);
        metadatoRepo.getMap.mockResolvedValue({});

        insertBitacoraExpedienteSafe.mockResolvedValue(true);

        mockPoolBase();

        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(pdfBuffer());
        fs.unlinkSync.mockReturnValue(undefined);
    });

    it("should throw FORBIDDEN if usuario_id is missing", async () => {
        await expect(
            documentoService.importArchivedPdfs({
                files: [{ path: "/tmp/a.pdf", originalname: "a.pdf" }],
                usuario_id: null,
                unidad_id: 1,
                origen_documento: "ESCANEADO",
                metadata_lote: metadataLoteOk,
            }),
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
                metadata_lote: metadataLoteOk,
            }),
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
                metadata_lote: metadataLoteOk,
            }),
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
                metadata_lote: metadataLoteOk,
            }),
        ).rejects.toMatchObject({
            code: "BAD_REQUEST",
            message: "El origen del documento debe ser ESCANEADO o ELECTRONICO",
        });
    });

    it("should import a scanned PDF successfully", async () => {
        fs.readFileSync.mockReturnValue(pdfBuffer("simple scanned pdf"));

        const result = await documentoService.importArchivedPdfs({
            files: [
                {
                    path: "/tmp/scan1.pdf",
                    originalname: "scan1.pdf",
                    size: 1024,
                    mimetype: "application/pdf",
                },
            ],
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
                numero_serie: "SCAN1",
                titulo: "SCAN1",
                estado: "ARCHIVADO",
                unidad_id: 3,
                usuario_id: 10,
                categoria_id: 8,
                confid_level: "INTERNAL",
                expediente_id: 42,
            }),
        );

        expect(documentoRepo.update).toHaveBeenCalledWith(
            123,
            expect.objectContaining({
                confid_level: "INTERNAL",
                expediente_id: 42,
            }),
        );

        expect(metadatoRepo.upsertMap).toHaveBeenCalledWith(
            123,
            expect.objectContaining({
                ORIGEN_DOCUMENTO: "ESCANEADO",
                CODIGO_REFERENCIA: "SCAN1",
                TITULO_DOCUMENTO: "SCAN1",
                SERIE_ID: "5",
                SUBSERIE_ID: "7",
                EXPEDIENTE_ID: "42",
            }),
        );

        expect(insertBitacoraExpedienteSafe).toHaveBeenCalled();

        expect(result.importados[0]).toMatchObject({
            documento_id: 123,
            archivo: "scan1.pdf",
            titulo: "SCAN1",
            codigo_referencia: "SCAN1",
            estado: "ARCHIVADO",
            expediente_id: 42,
        });
    });

    it("should reject file if extension is not pdf", async () => {
        const result = await documentoService.importArchivedPdfs({
            files: [
                {
                    path: "/tmp/file1.docx",
                    originalname: "file1.docx",
                    size: 100,
                },
            ],
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ESCANEADO",
            metadata_lote: metadataLoteOk,
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

    it("should reject file if PDF structure is invalid", async () => {
        fs.readFileSync.mockReturnValue(Buffer.from("not a real pdf"));

        const result = await documentoService.importArchivedPdfs({
            files: [
                {
                    path: "/tmp/falso.pdf",
                    originalname: "falso.pdf",
                    size: 100,
                },
            ],
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ESCANEADO",
            metadata_lote: metadataLoteOk,
        });

        expect(result.total_importados).toBe(0);
        expect(result.total_rechazados).toBe(1);
        expect(result.rechazados[0]).toEqual({
            archivo: "falso.pdf",
            motivo: "El archivo no tiene una estructura PDF válida",
        });

        expect(documentoRepo.create).not.toHaveBeenCalled();
    });

    it("should reject duplicate document inside same batch", async () => {
        fs.readFileSync.mockReturnValue(pdfBuffer("same pdf binary"));

        const result = await documentoService.importArchivedPdfs({
            files: [
                {
                    path: "/tmp/a.pdf",
                    originalname: "a.pdf",
                    size: 100,
                    mimetype: "application/pdf",
                },
                {
                    path: "/tmp/b.pdf",
                    originalname: "b.pdf",
                    size: 100,
                    mimetype: "application/pdf",
                },
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
        fs.readFileSync.mockReturnValue(pdfBuffer("pdf content unique"));

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
            files: [
                {
                    path: "/tmp/dup.pdf",
                    originalname: "dup.pdf",
                    size: 100,
                },
            ],
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ESCANEADO",
            metadata_lote: metadataLoteOk,
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

    it("should reject document if serie is missing", async () => {
        const result = await documentoService.importArchivedPdfs({
            files: [
                {
                    path: "/tmp/sin-serie.pdf",
                    originalname: "sin-serie.pdf",
                    size: 100,
                },
            ],
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ESCANEADO",
            metadata_lote: {
                subserieId: 7,
                expedienteId: 42,
                nivelAcceso: "INTERNAL",
            },
        });

        expect(result.total_importados).toBe(0);
        expect(result.total_rechazados).toBe(1);
        expect(result.rechazados[0]).toEqual({
            archivo: "sin-serie.pdf",
            motivo: "Debe seleccionar una serie",
        });

        expect(documentoRepo.create).not.toHaveBeenCalled();
    });

    it("should reject document if expediente does not exist", async () => {
        pool.query.mockImplementation(async (sql) => {
            const s = String(sql);

            if (s.includes("FROM Expediente e") && s.includes("JOIN Serie")) {
                return [[]];
            }

            if (s.includes("FILE_HASH_SHA256")) {
                return [[]];
            }

            if (s.includes("FROM Documento") && s.includes("numero_serie")) {
                return [[]];
            }

            return [[]];
        });

        const result = await documentoService.importArchivedPdfs({
            files: [
                {
                    path: "/tmp/sin-expediente.pdf",
                    originalname: "sin-expediente.pdf",
                    size: 100,
                },
            ],
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ESCANEADO",
            metadata_lote: metadataLoteOk,
        });

        expect(result.total_importados).toBe(0);
        expect(result.total_rechazados).toBe(1);
        expect(result.rechazados[0]).toEqual({
            archivo: "sin-expediente.pdf",
            motivo: "El expediente seleccionado no existe",
        });

        expect(documentoRepo.create).not.toHaveBeenCalled();
    });

    it("should import electronic PDF successfully", async () => {
        fs.readFileSync.mockReturnValue(pdfBuffer("plain electronic pdf"));

        const result = await documentoService.importArchivedPdfs({
            files: [
                {
                    path: "/tmp/elec.pdf",
                    originalname: "elec.pdf",
                    size: 100,
                    mimetype: "application/pdf",
                },
            ],
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
        expect(metadatoRepo.upsertMap).toHaveBeenCalledWith(
            123,
            expect.objectContaining({
                ORIGEN_DOCUMENTO: "ELECTRONICO",
            }),
        );
    });

    it("should import document with allowed annex", async () => {
        fs.readFileSync.mockReturnValue(pdfBuffer("pdf with annex"));

        const result = await documentoService.importArchivedPdfs({
            files: [
                {
                    path: "/tmp/main.pdf",
                    originalname: "main.pdf",
                    size: 100,
                    mimetype: "application/pdf",
                },
            ],
            anexos_por_documento: {
                0: [
                    {
                        path: "/tmp/anexo.pdf",
                        originalname: "anexo.pdf",
                        filename: "anexo-guardado.pdf",
                        mimetype: "application/pdf",
                        size: 50,
                    },
                ],
            },
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ESCANEADO",
            metadata_lote: metadataLoteOk,
        });

        expect(result.total_importados).toBe(1);
        expect(result.total_anexos_importados).toBe(1);
        expect(result.total_anexos_rechazados).toBe(0);

        expect(documentoAnexoRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                documento_id: 123,
                usuario_id: 10,
                nombre_original: "anexo.pdf",
                nombre_guardado: "anexo-guardado.pdf",
                ruta_archivo: "/tmp/anexo.pdf",
                mime_type: "application/pdf",
                tamano_bytes: 50,
                orden_visual: 1,
            }),
        );
    });

    it("should reject invalid annex but import main document", async () => {
        fs.readFileSync.mockReturnValue(pdfBuffer("pdf with invalid annex"));

        const result = await documentoService.importArchivedPdfs({
            files: [
                {
                    path: "/tmp/main.pdf",
                    originalname: "main.pdf",
                    size: 100,
                    mimetype: "application/pdf",
                },
            ],
            anexos_por_documento: {
                0: [
                    {
                        path: "/tmp/anexo.exe",
                        originalname: "anexo.exe",
                        filename: "anexo.exe",
                        mimetype: "application/x-msdownload",
                        size: 50,
                    },
                ],
            },
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ESCANEADO",
            metadata_lote: metadataLoteOk,
        });

        expect(result.total_importados).toBe(1);
        expect(result.total_anexos_importados).toBe(0);
        expect(result.total_anexos_rechazados).toBe(1);

        expect(result.importados[0].anexos[0]).toEqual({
            archivo: "anexo.exe",
            estado: "RECHAZADO",
            motivo: "Formato de anexo no permitido",
        });

        expect(documentoAnexoRepo.create).not.toHaveBeenCalled();
        expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/anexo.exe");
    });
});