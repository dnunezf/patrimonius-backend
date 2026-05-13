import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

/** Permite variar el actor por test (p. ej. FORBIDDEN vía middleware). */
const mockAuthUser = {
    current: { id: 99, unidadId: 7, rolId: 2, rol_id: 2 },
};

await jest.unstable_mockModule("../../src/middleware/authGuard.js", () => ({
    authGuard: (req, _res, next) => {
        req.user = { ...mockAuthUser.current };
        next();
    },
}));

await jest.unstable_mockModule("../../src/middleware/uploadMassivePdf.js", () => ({
    uploadMassivePdf: {
        any: () => (req, _res, next) => {
            req.files = [
                {
                    fieldname: "files",
                    path: "/tmp/lote1.pdf",
                    originalname: "lote1.pdf",
                    mimetype: "application/pdf",
                    size: 1024,
                    filename: "lote1.pdf",
                },
            ];
            next();
        },
    },
}));

await jest.unstable_mockModule("../../src/middleware/uploadSignedPdf.js", () => ({
    uploadSignedPdf: {
        single: () => (req, _res, next) => next(),
    },
}));

await jest.unstable_mockModule("../../src/middleware/uploadAnexo.js", () => ({
    uploadAnexo: {
        any: () => (req, _res, next) => {
            req.files = [];
            next();
        },
    },
}));

await jest.unstable_mockModule("../../src/services/eadExport.service.js", () => ({
    eadExportService: {
        listExportableDocuments: jest.fn(),
        getPreview: jest.fn(),
        exportXml: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/db/pool.js", () => ({
    pool: {
        query: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/services/documento.service.js", () => ({
    documentoService: {
        importArchivedPdfs: jest.fn(),
        editDocument: jest.fn(),
        createFromPlantilla: jest.fn(),
        getAccessibleDocuments: jest.fn(),
        prepareForSignature: jest.fn(),
        archiveDocument: jest.fn(),
        getLatestVersion: jest.fn(),
        colabSave: jest.fn(),
        acquireLock: jest.fn(),
        releaseLock: jest.fn(),
        readLock: jest.fn(),
        listComentarios: jest.fn(),
        addComentario: jest.fn(),
        resolveComentario: jest.fn(),
        restoreVersion: jest.fn(),
        listVersions: jest.fn(),
        getAllDocuments: jest.fn(),
        getDocumentsFromProduction: jest.fn(),
        getContenido: jest.fn(),
        getSignatureInfo: jest.fn(),
        downloadPdfForSignature: jest.fn(),
        downloadDocxForSignature: jest.fn(),
        getCurrentSignedPdf: jest.fn(),
        confirmSignature: jest.fn(),
        addAnexo: jest.fn(),
        listAnexos: jest.fn(),
        getAnexoFile: jest.fn(),
        deleteAnexo: jest.fn(),
        assertExternalDocumentAccessIfNeeded: jest.fn(),
        assertFirmaPdfDownloadAccess: jest.fn(),
        isExternalUser: jest.fn(),
        getArchivedDocumentsForExternal: jest.fn(),
        getDocumentosByExpediente: jest.fn(),
    },
}));

await jest.unstable_mockModule("../../src/services/editSession.service.js", () => ({
    editSessionService: {
        touch: jest.fn(),
        list: jest.fn(),
        remove: jest.fn(),
    },
}));

const documentoRoutes = (await import("../../src/routes/documento.routes.js")).default;
const { documentoService } = await import("../../src/services/documento.service.js");

const app = express();
app.use(express.json());
app.use("/", documentoRoutes);

describe("Documento routes - carga masiva PDF", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthUser.current = { id: 99, unidadId: 7, rolId: 2, rol_id: 2 };
    });

    it("should import archived PDFs and return 201", async () => {
        documentoService.importArchivedPdfs.mockResolvedValue({
            ok: true,
            origen_documento: "ESCANEADO",
            total_recibidos: 1,
            importados: [
                {
                    documento_id: 101,
                    titulo: "LOTE1",
                    archivo: "lote1.pdf",
                    estado: "ARCHIVADO",
                },
            ],
            rechazados: [],
            total_importados: 1,
            total_rechazados: 0,
            total_anexos_importados: 0,
            total_anexos_rechazados: 0,
        });

        const res = await request(app)
            .post("/documentos/carga-masiva/pdf")
            .send({
                categoria_id: 3,
                origen_documento: "ESCANEADO",
                metadata_lote: JSON.stringify({
                    serieId: 5,
                    subserieId: 7,
                    expedienteId: 42,
                    nivelAcceso: "INTERNAL",
                }),
            });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty("ok", true);
        expect(res.body).toHaveProperty("total_importados", 1);

        expect(documentoService.importArchivedPdfs).toHaveBeenCalledWith({
            files: [
                {
                    fieldname: "files",
                    path: "/tmp/lote1.pdf",
                    originalname: "lote1.pdf",
                    mimetype: "application/pdf",
                    size: 1024,
                    filename: "lote1.pdf",
                },
            ],
            anexos_por_documento: {},
            usuario_id: 99,
            unidad_id: 7,
            categoria_id: 3,
            origen_documento: "ESCANEADO",
            metadata_por_documento: null,
            metadata_lote: {
                serieId: 5,
                subserieId: 7,
                expedienteId: 42,
                nivelAcceso: "INTERNAL",
            },
        });
    });

    it("should return 400 when service throws BAD_REQUEST", async () => {
        const err = new Error("Debe adjuntar al menos un PDF");
        err.code = "BAD_REQUEST";

        documentoService.importArchivedPdfs.mockRejectedValue(err);

        const res = await request(app)
            .post("/documentos/carga-masiva/pdf")
            .send({
                origen_documento: "ESCANEADO",
            });

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({
            error: "BAD_REQUEST",
            message: "Debe adjuntar al menos un PDF",
        });
    });

    it("should return 403 when service throws FORBIDDEN", async () => {
        mockAuthUser.current = { id: 99, unidadId: 7, rolId: 99, rol_id: 99 };

        const res = await request(app)
            .post("/documentos/carga-masiva/pdf")
            .send({
                origen_documento: "ESCANEADO",
            });

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({
            error: "FORBIDDEN",
            message: "No tiene permisos para cargar documentos",
        });
    });

    it("should return 500 when service throws unknown error", async () => {
        documentoService.importArchivedPdfs.mockRejectedValue(
            new Error("Unexpected failure"),
        );

        const res = await request(app)
            .post("/documentos/carga-masiva/pdf")
            .send({
                origen_documento: "ESCANEADO",
            });

        expect(res.status).toBe(500);
        expect(res.body).toMatchObject({
            error: "internal_error",
            message: "Unexpected failure",
        });
    });
});