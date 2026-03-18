import { jest } from "@jest/globals";

// ===== Mock fs =====
await jest.unstable_mockModule("fs", () => ({
    default: {
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

await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: {
        insertBase: jest.fn(),
        insertCiclo: jest.fn(),
        insertActividad: jest.fn(),
    },
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
const { bitacoraRepo } = await import("../src/repositories/bitacoraRepo.js");
const { documentoService } = await import("../src/services/documento.service.js");

describe("Documento service - importArchivedPdfs (carga masiva)", () => {
    beforeEach(() => {
        jest.clearAllMocks();

        bitacoraRepo.insertBase.mockResolvedValue(500);
        bitacoraRepo.insertCiclo.mockResolvedValue(true);

        documentoRepo.create.mockResolvedValue({ id: 123 });
        documentoRepo.update.mockResolvedValue(true);

        metadatoRepo.upsertByTipo.mockResolvedValue(true);

        pool.query.mockImplementation(async (sql) => {
            if (String(sql).includes("FROM Metadato m")) {
                return [[]];
            }
            return [[]];
        });

        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(Buffer.from("dummy pdf content"));
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
            Buffer.from("simple scanned pdf without digital markers")
        );

        const result = await documentoService.importArchivedPdfs({
            files: [{ path: "/tmp/scan1.pdf", originalname: "scan1.pdf" }],
            usuario_id: 10,
            unidad_id: 3,
            categoria_id: 8,
            origen_documento: "ESCANEADO",
        });

        expect(result.ok).toBe(true);
        expect(result.origen_documento).toBe("ESCANEADO");
        expect(result.total_recibidos).toBe(1);
        expect(result.total_importados).toBe(1);
        expect(result.total_rechazados).toBe(0);

        expect(documentoRepo.create).toHaveBeenCalledTimes(1);
        expect(documentoRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                titulo: "scan1",
                estado: "ARCHIVADO",
                unidad_id: 3,
                usuario_id: 10,
                categoria_id: 8,
            })
        );

        expect(documentoRepo.update).not.toHaveBeenCalled();

        expect(metadatoRepo.upsertByTipo).toHaveBeenCalledWith(
            expect.objectContaining({
                documento_id: 123,
                tipo: "ORIGEN_DOCUMENTO",
                valor: "ESCANEADO",
            })
        );

        expect(result.importados[0]).toEqual(
            expect.objectContaining({
                documento_id: 123,
                archivo: "scan1.pdf",
                estado: "ARCHIVADO",
                verificacion_firma_estado: "NO_APLICA",
            })
        );
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
        const sameBuffer = Buffer.from("same pdf binary");
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
        fs.readFileSync.mockReturnValue(Buffer.from("pdf content unique"));

        pool.query.mockImplementation(async (sql) => {
            if (String(sql).includes("FROM Metadato m")) {
                return [[{ id: 777, titulo: "Documento ya existente", estado: "ARCHIVADO" }]];
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

    it("should reject electronic PDF without digital signature markers", async () => {
        fs.readFileSync.mockReturnValue(
            Buffer.from("plain electronic pdf without markers")
        );

        const result = await documentoService.importArchivedPdfs({
            files: [{ path: "/tmp/elec.pdf", originalname: "elec.pdf" }],
            usuario_id: 10,
            unidad_id: 3,
            origen_documento: "ELECTRONICO",
        });

        expect(result.total_importados).toBe(0);
        expect(result.total_rechazados).toBe(1);
        expect(result.rechazados[0]).toEqual({
            archivo: "elec.pdf",
            motivo: "El PDF electrónico no contiene marcas de firma digital verificable",
        });

        expect(documentoRepo.create).not.toHaveBeenCalled();
        expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/elec.pdf");
    });

    it("should reject scanned PDF if it contains digital signature markers", async () => {
        fs.readFileSync.mockReturnValue(
            Buffer.from("abc /Type /Sig xyz /ByteRange 123")
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
        });

        expect(result.total_importados).toBe(0);
        expect(result.total_rechazados).toBe(1);
        expect(result.rechazados[0]).toEqual({
            archivo: "signed-scan.pdf",
            motivo:
                "El archivo parece tener firma digital. Debe cargarse como PDF electrónico, no como escaneado.",
        });

        expect(documentoRepo.create).not.toHaveBeenCalled();
    });

    it("should import electronic PDF with digital signature markers", async () => {
        fs.readFileSync.mockReturnValue(
            Buffer.from("abc /Type /Sig xyz /ByteRange 123")
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
        });

        expect(result.total_importados).toBe(1);
        expect(result.total_rechazados).toBe(0);

        expect(documentoRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                titulo: "electronic-signed",
                estado: "ARCHIVADO",
                unidad_id: 3,
                usuario_id: 10,
                categoria_id: 9,
            })
        );

        expect(result.importados[0]).toEqual(
            expect.objectContaining({
                documento_id: expect.any(Number),
                archivo: "electronic-signed.pdf",
                verificacion_firma_estado: "VALIDA",
                estado: "ARCHIVADO",
            })
        );

        expect(documentoRepo.update).toHaveBeenCalledWith(
            result.importados[0].documento_id,
            expect.objectContaining({
                verificacion_firma_estado: "VALIDA",
                verificacion_firma_fecha: expect.any(Date),
            })
        );

        expect(metadatoRepo.upsertByTipo).toHaveBeenCalledWith(
            expect.objectContaining({
                documento_id: result.importados[0].documento_id,
                tipo: "APLICA_VALIDACION_FIRMA",
                valor: "SI",
            })
        );
    });
});