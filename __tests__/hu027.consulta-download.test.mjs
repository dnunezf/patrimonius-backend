// __tests__/hu027.consulta-download.test.mjs
/**
 * HU-027: Descarga de documentos aprobados consultados.
 * - Permiso: consultaAprobadosService.assertCanAccess (acción DESCARGA).
 * - Archivo: documentoService.getPdfBufferForConsultaPreview (misma lógica que GET /documents/:id/download).
 */
import { jest } from "@jest/globals";

const mockExistsForExternoPermisoDescarga = jest.fn();
const mockExistsForInternal = jest.fn();

const mockBitacoraInsertBase = jest.fn(async () => 9001);
const mockBitacoraInsertActividad = jest.fn(async () => {});
const mockBitacoraInsertCiclo = jest.fn(async () => {});

await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: {
        insertBase: mockBitacoraInsertBase,
        insertActividad: mockBitacoraInsertActividad,
        insertCiclo: mockBitacoraInsertCiclo,
    },
    logAdminAction: jest.fn(),
    logSecurityEvent: jest.fn(),
}));

await jest.unstable_mockModule("../src/repositories/consultaAprobados.repo.js", () => ({
    consultaAprobadosRepo: {
        existsForExternoPermisoDescarga: mockExistsForExternoPermisoDescarga,
        existsForInternal: mockExistsForInternal,
    },
}));

const mockPoolQuery = jest.fn();
const mockHtmlToPdfBuffer = jest.fn();
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();

await jest.unstable_mockModule("fs", () => ({
    default: {
        existsSync: (...a) => mockExistsSync(...a),
        readFileSync: (...a) => mockReadFileSync(...a),
    },
}));

await jest.unstable_mockModule("../src/db/pool.js", () => ({
    pool: { query: mockPoolQuery },
}));

await jest.unstable_mockModule("../src/repositories/permRepo.js", () => ({
    permRepo: { getForUser: jest.fn(async () => []) },
}));

const mockDocumentoFindById = jest.fn();

await jest.unstable_mockModule("../src/repositories/documentoRepo.js", () => ({
    documentoRepo: {
        findById: (...a) => mockDocumentoFindById(...a),
    },
}));

await jest.unstable_mockModule("../src/repositories/plantillaRepo.js", () => ({
    plantillaRepo: {},
}));

await jest.unstable_mockModule("../src/repositories/comentariosRepo.js", () => ({
    comentarioRepo: {},
}));

await jest.unstable_mockModule("../src/services/documentMetadata.service.js", () => ({
    documentMetadataService: {},
}));

await jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
    userRepo: {
        findById: jest.fn(async () => null),
    },
}));

await jest.unstable_mockModule("../src/repositories/metadatoRepo.js", () => ({
    metadatoRepo: {
        findByTipo: jest.fn(async () => null),
        getMap: jest.fn(async () => ({})),
    },
}));

await jest.unstable_mockModule("../src/repositories/documentoAnexoRepo.js", () => ({
    documentoAnexoRepo: {},
}));

await jest.unstable_mockModule("../src/services/notificacion.service.js", () => ({
    notificacionService: {},
}));

await jest.unstable_mockModule("../src/services/pdf.service.js", () => ({
    pdfService: {
        htmlToPdfBuffer: (...a) => mockHtmlToPdfBuffer(...a),
    },
}));

await jest.unstable_mockModule("../src/services/word.service.js", () => ({
    wordService: {},
}));

await jest.unstable_mockModule("../src/services/indice.service.js", () => ({
    indiceService: {},
}));

const { consultaAprobadosService } = await import("../src/services/consultaAprobados.service.js");
const { documentoService } = await import("../src/services/documento.service.js");

describe("HU-027: Descarga consulta — permisos (assertCanAccess DESCARGA)", () => {
    const actor = { id: 42, unidadId: 3 };
    const req = { originalUrl: "/documents/7/download", ip: "127.0.0.1", query: {} };

    beforeEach(() => {
        jest.clearAllMocks();
        mockBitacoraInsertBase.mockResolvedValue(9001);
    });

    test("HU-027 Test 1 (permiso): con permiso de descarga DESCARGA se permite y registra bitácora", async () => {
        const user = { role: "USUARIO_EXTERNO", rolId: 5, rolIds: [5] };
        mockExistsForExternoPermisoDescarga.mockResolvedValueOnce(true);

        await expect(
            consultaAprobadosService.assertCanAccess({
                user,
                actor,
                documentoId: 7,
                req,
                accion: "DESCARGA",
            }),
        ).resolves.toBeUndefined();

        expect(mockExistsForExternoPermisoDescarga).toHaveBeenCalledWith({
            documentoId: 7,
            userId: 42,
        });
        expect(mockBitacoraInsertBase).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "DESCARGA_DOCUMENTO_E",
                documento_id: 7,
                usuario_id: 42,
            }),
        );
    });

    test("HU-027 Test 2 (sin permiso): la descarga queda bloqueada (FORBIDDEN), sin bitácora de acción", async () => {
        const user = { role: "USUARIO_EXTERNO", rolId: 5, rolIds: [5] };
        mockExistsForExternoPermisoDescarga.mockResolvedValueOnce(false);

        await expect(
            consultaAprobadosService.assertCanAccess({
                user,
                actor,
                documentoId: 8,
                req,
                accion: "DESCARGA",
            }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });

        expect(mockBitacoraInsertBase).not.toHaveBeenCalled();
    });
});

describe("HU-027: Descarga consulta — archivo y formato (getPdfBufferForConsultaPreview)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("HU-027 Test 1 (archivo): documento aprobado sin PDF firmado — buffer PDF generado para la descarga", async () => {
        mockDocumentoFindById.mockResolvedValueOnce({
            id: 10,
            titulo: "Informe",
            estado: "APROBADO",
            contenido: "<p>contenido</p>",
            usuario_id: 1,
            numero_serie: null,
        });
        mockPoolQuery.mockResolvedValueOnce([[{ valor: null }]]);
        const generated = Buffer.from("%PDF-1.4 HU027");
        mockHtmlToPdfBuffer.mockResolvedValueOnce(generated);

        const out = await documentoService.getPdfBufferForConsultaPreview({ documento_id: 10 });

        expect(out.filename.endsWith(".pdf")).toBe(true);
        expect(out.filename).toBe("Informe_10.pdf");
        expect(out.buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
        expect(out.buffer.equals(generated)).toBe(true);
    });

    test("HU-027: con numero_serie el nombre del PDF usa el código oficial", async () => {
        mockDocumentoFindById.mockResolvedValueOnce({
            id: 11,
            titulo: "Título distinto",
            estado: "ARCHIVADO",
            contenido: "<p>x</p>",
            usuario_id: 1,
            numero_serie: "OFI-MNCR-DG-001-2026",
        });
        mockPoolQuery.mockResolvedValueOnce([[{ valor: null }]]);
        const generated = Buffer.from("%PDF-1.4 HU027b");
        mockHtmlToPdfBuffer.mockResolvedValueOnce(generated);

        const out = await documentoService.getPdfBufferForConsultaPreview({ documento_id: 11 });

        expect(out.filename).toBe("OFI-MNCR-DG-001-2026.pdf");
        expect(out.buffer.equals(generated)).toBe(true);
    });

    test("HU-027 Test 3 (formato original): PDF en disco — bytes idénticos al archivo leído", async () => {
        const originalPdf = Buffer.from("%PDF-1.4 original contenido binario");
        mockDocumentoFindById.mockResolvedValueOnce({
            id: 20,
            titulo: "ActaAprobada",
            estado: "APROBADO",
            contenido: "<p>html</p>",
            usuario_id: 1,
            numero_serie: null,
        });
        mockPoolQuery.mockResolvedValueOnce([[{ valor: "/storage/doc.pdf" }]]);
        mockExistsSync.mockReturnValueOnce(true);
        mockReadFileSync.mockReturnValueOnce(originalPdf);

        const out = await documentoService.getPdfBufferForConsultaPreview({ documento_id: 20 });

        expect(mockReadFileSync).toHaveBeenCalledWith("/storage/doc.pdf");
        expect(mockHtmlToPdfBuffer).not.toHaveBeenCalled();
        expect(out.buffer.equals(originalPdf)).toBe(true);
        expect(out.filename).toBe("ActaAprobada_20.pdf");
        expect(out.buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    });

    test("HU-027 Test 4a: sin documento — NOT_FOUND, sin lectura ni generación", async () => {
        mockDocumentoFindById.mockResolvedValueOnce(null);

        await expect(documentoService.getPdfBufferForConsultaPreview({ documento_id: 99 })).rejects.toMatchObject({
            code: "NOT_FOUND",
        });
        expect(mockReadFileSync).not.toHaveBeenCalled();
        expect(mockHtmlToPdfBuffer).not.toHaveBeenCalled();
    });

    test("HU-027 Test 4b: sin archivo ni HTML exportable — BAD_REQUEST, sin descarga", async () => {
        mockDocumentoFindById.mockResolvedValueOnce({
            id: 30,
            titulo: "SinContenido",
            estado: "APROBADO",
            contenido: "   ",
            usuario_id: 1,
            numero_serie: null,
        });
        mockPoolQuery.mockResolvedValueOnce([[{ valor: null }]]);

        await expect(documentoService.getPdfBufferForConsultaPreview({ documento_id: 30 })).rejects.toMatchObject({
            code: "BAD_REQUEST",
        });
        expect(mockHtmlToPdfBuffer).not.toHaveBeenCalled();
    });
});
