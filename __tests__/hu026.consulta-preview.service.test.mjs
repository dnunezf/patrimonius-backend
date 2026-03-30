// __tests__/hu026.consulta-preview.service.test.mjs
/**
 * HU-026: Visualización previa de documentos antes de descarga.
 * - Acceso: consultaAprobadosService.assertCanAccess (sin bitácora en VISTA_PREVIA).
 * - Bitácora: solo DESCARGA (y BUSQUEDA en search): CONSULTA_* + accion_solicitada en ciclo.
 * - PDF: documentoService.getPdfBufferForConsultaPreview (firmado o HTML→PDF).
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
const mockGetContenido = jest.fn();
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
        getContenido: (...a) => mockGetContenido(...a),
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
    userRepo: {},
}));

const mockMetadatoFindByTipo = jest.fn(async () => null);

await jest.unstable_mockModule("../src/repositories/metadatoRepo.js", () => ({
    metadatoRepo: {
        findByTipo: (...a) => mockMetadatoFindByTipo(...a),
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

describe("HU-026: Vista previa / consulta (assertCanAccess)", () => {
    const actor = { id: 42, unidadId: 3 };
    const req = { originalUrl: "/documents/7/preview-pdf", ip: "127.0.0.1" };

    beforeEach(() => {
        jest.clearAllMocks();
        mockBitacoraInsertBase.mockResolvedValue(9001);
        mockDocumentoFindById.mockResolvedValue({
            titulo: "Doc prueba",
            numero_serie: "NS-7",
            estado: "APROBADO",
        });
    });

    test("usuario externo con permiso VIEW permite VISTA_PREVIA sin registrar bitácora", async () => {
        const user = { role: "USUARIO_EXTERNO", rolId: 5, rolIds: [5] };
        mockExistsForExternoPermisoDescarga.mockResolvedValueOnce(true);

        await consultaAprobadosService.assertCanAccess({
            user,
            actor,
            documentoId: 7,
            req,
            accion: "VISTA_PREVIA",
        });

        expect(mockExistsForExternoPermisoDescarga).toHaveBeenCalledWith({
            documentoId: 7,
            userId: 42,
        });
        expect(mockBitacoraInsertBase).not.toHaveBeenCalled();
        expect(mockBitacoraInsertCiclo).not.toHaveBeenCalled();
    });

    test("DESCARGA externa registra bitácora: CONSULTA_DESCARGA_EXTERNO y accion_solicitada", async () => {
        const user = { role: "USUARIO_EXTERNO", rolId: 5, rolIds: [5] };
        mockExistsForExternoPermisoDescarga.mockResolvedValueOnce(true);

        await consultaAprobadosService.assertCanAccess({
            user,
            actor,
            documentoId: 7,
            req: { originalUrl: "/documents/7/download", ip: "127.0.0.1" },
            accion: "DESCARGA",
        });

        expect(mockBitacoraInsertBase).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "CONSULTA_DESCARGA_EXTERNO",
                documento_id: 7,
                usuario_id: 42,
            })
        );
        expect(mockBitacoraInsertCiclo).toHaveBeenCalledWith({
            id: 9001,
            evento: "CONSULTA",
            detalle: expect.any(String),
        });
        const ciclo = JSON.parse(mockBitacoraInsertCiclo.mock.calls[0][0].detalle);
        expect(ciclo.accion_solicitada).toBe("DESCARGA_PDF_CONSULTA_EXTERNO");
        expect(ciclo.modulo).toBe("CONSULTA_APROBADOS");
        expect(ciclo.tipo_operacion).toBe("DESCARGA");
        expect(ciclo.snapshot.documento_titulo).toBe("Doc prueba");
    });

    test("usuario externo sin permiso explícito → FORBIDDEN", async () => {
        const user = { role: "USUARIO_EXTERNO", rolId: 5, rolIds: [5] };
        mockExistsForExternoPermisoDescarga.mockResolvedValueOnce(false);

        await expect(
            consultaAprobadosService.assertCanAccess({
                user,
                actor,
                documentoId: 8,
                req,
                accion: "VISTA_PREVIA",
            })
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    test("usuario interno con existsForInternal true permite acceso", async () => {
        const user = { role: "USUARIO", rolId: 2, rolIds: [2] };
        mockExistsForInternal.mockResolvedValueOnce(true);

        await consultaAprobadosService.assertCanAccess({
            user,
            actor,
            documentoId: 9,
            req,
            accion: "VISTA_PREVIA",
        });

        expect(mockExistsForInternal).toHaveBeenCalled();
        expect(mockExistsForExternoPermisoDescarga).not.toHaveBeenCalled();
    });

    test("usuario interno sin acceso interno pero con rol externo y permiso VIEW → permite", async () => {
        const user = { role: "USUARIO", rolId: 2, rolIds: [2, 5] };
        mockExistsForInternal.mockResolvedValueOnce(false);
        mockExistsForExternoPermisoDescarga.mockResolvedValueOnce(true);

        await consultaAprobadosService.assertCanAccess({
            user,
            actor,
            documentoId: 11,
            req,
            accion: "VISTA_PREVIA",
        });

        expect(mockExistsForExternoPermisoDescarga).toHaveBeenCalledWith({
            documentoId: 11,
            userId: 42,
        });
    });
});

describe("HU-026: Vista previa PDF (getPdfBufferForConsultaPreview)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("documento inexistente → NOT_FOUND", async () => {
        mockGetContenido.mockResolvedValueOnce(null);

        await expect(documentoService.getPdfBufferForConsultaPreview({ documento_id: 1 })).rejects.toMatchObject({
            code: "NOT_FOUND",
        });
    });

    test("estado no consultable (p. ej. CREACION) → STATE_ERROR", async () => {
        mockGetContenido.mockResolvedValueOnce({
            titulo: "X",
            estado: "CREACION",
            contenido: "<p>a</p>",
        });

        await expect(documentoService.getPdfBufferForConsultaPreview({ documento_id: 2 })).rejects.toMatchObject({
            code: "STATE_ERROR",
        });
    });

    test("ARCHIVADO con PDF firmado en metadato y archivo existente → buffer del archivo", async () => {
        mockGetContenido.mockResolvedValueOnce({
            titulo: "Acta",
            estado: "ARCHIVADO",
            contenido: "<p>html</p>",
        });
        mockPoolQuery.mockResolvedValueOnce([[{ valor: "/tmp/firmado.pdf" }]]);
        mockExistsSync.mockReturnValueOnce(true);
        const bytes = Buffer.from("%PDF-1.4 test");
        mockReadFileSync.mockReturnValueOnce(bytes);

        const out = await documentoService.getPdfBufferForConsultaPreview({ documento_id: 3 });

        expect(out.filename).toContain("Acta");
        expect(out.filename).toContain("_3_firmado.pdf");
        expect(out.buffer.equals(bytes)).toBe(true);
        expect(mockHtmlToPdfBuffer).not.toHaveBeenCalled();
    });

    test("APROBADO sin PDF firmado pero con HTML → delega en pdfService.htmlToPdfBuffer", async () => {
        mockGetContenido.mockResolvedValueOnce({
            titulo: "Guia",
            estado: "APROBADO",
            contenido: "<p>Hola <strong>mundo</strong></p>",
        });
        mockPoolQuery.mockResolvedValueOnce([[{ valor: null }]]);
        const fakePdf = Buffer.from("%PDF-generated");
        mockHtmlToPdfBuffer.mockResolvedValueOnce(fakePdf);

        const out = await documentoService.getPdfBufferForConsultaPreview({ documento_id: 4 });

        expect(mockHtmlToPdfBuffer).toHaveBeenCalled();
        const [htmlArg, opts] = mockHtmlToPdfBuffer.mock.calls[0];
        expect(String(htmlArg)).toContain("Hola");
        expect(opts.title).toBe("Guia");
        expect(out.buffer.equals(fakePdf)).toBe(true);
        expect(out.filename).toBe("Guia_4.pdf");
    });

    test("sin contenido HTML para generar PDF → BAD_REQUEST", async () => {
        mockGetContenido.mockResolvedValueOnce({
            titulo: "Vacío",
            estado: "APROBADO",
            contenido: "   ",
        });
        mockPoolQuery.mockResolvedValueOnce([[{ valor: null }]]);

        await expect(documentoService.getPdfBufferForConsultaPreview({ documento_id: 5 })).rejects.toMatchObject({
            code: "BAD_REQUEST",
        });
    });
});
