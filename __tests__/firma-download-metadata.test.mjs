/**
 * Descarga para firma: mismos metadatos embebidos que consulta (PDF) y propiedades DOCX.
 */
import { jest } from "@jest/globals";
import { PDFDocument } from "pdf-lib";

const mockPoolQuery = jest.fn();
const mockDocumentoFindById = jest.fn();
const mockHtmlToPdfBuffer = jest.fn();
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockHtmlToDocxBuffer = jest.fn();

await jest.unstable_mockModule("../src/db/pool.js", () => ({
    pool: { query: mockPoolQuery },
}));

await jest.unstable_mockModule("../src/repositories/documentoRepo.js", () => ({
    documentoRepo: {
        findById: (...a) => mockDocumentoFindById(...a),
    },
}));

await jest.unstable_mockModule("../src/repositories/metadatoRepo.js", () => ({
    metadatoRepo: {
        getMap: jest.fn(async () => ({
            EDIT_MANUAL_TITLE: "Título meta",
            EDIT_MANUAL_DOCUMENT_TYPE: "Oficio",
            EDIT_MANUAL_KEYWORDS_JSON: JSON.stringify(["kw1"]),
            EDIT_AUTO_CREATION_RESPONSIBLE: "Autor Test",
            EDIT_AUTO_SOFTWARE_VERSION: "Patrimonius v1.0",
        })),
    },
}));

await jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
    userRepo: {
        findById: jest.fn(async () => null),
    },
}));

await jest.unstable_mockModule("fs", () => ({
    default: {
        existsSync: (...a) => mockExistsSync(...a),
        readFileSync: (...a) => mockReadFileSync(...a),
    },
}));

await jest.unstable_mockModule("../src/services/pdf.service.js", () => ({
    pdfService: {
        htmlToPdfBuffer: (...a) => mockHtmlToPdfBuffer(...a),
    },
}));

await jest.unstable_mockModule("../src/services/word.service.js", () => ({
    wordService: {
        htmlToDocxBuffer: (...a) => mockHtmlToDocxBuffer(...a),
    },
}));

await jest.unstable_mockModule("../src/repositories/permRepo.js", () => ({
    permRepo: { getForUser: jest.fn(async () => []) },
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
await jest.unstable_mockModule("../src/repositories/documentoAnexoRepo.js", () => ({
    documentoAnexoRepo: {},
}));
await jest.unstable_mockModule("../src/services/notificacion.service.js", () => ({
    notificacionService: {},
}));
await jest.unstable_mockModule("../src/services/indice.service.js", () => ({
    indiceService: {},
}));

const { documentoService } = await import("../src/services/documento.service.js");

describe("Firma: descarga con metadatos (PDF/DOCX)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPoolQuery.mockReset();
        mockPoolQuery.mockResolvedValue([[]]);
    });

    test("downloadPdfForSignature (HTML→PDF) incrusta metadatos vía embedStandardMetadataInPdfBuffer", async () => {
        mockDocumentoFindById.mockResolvedValueOnce({
            id: 50,
            titulo: "Doc firma",
            estado: "FIRMA",
            contenido: "<p>x</p>",
            usuario_id: 1,
            unidad_id: 2,
            numero_serie: "COD-50",
            categoria_id: null,
        });
        mockPoolQuery
            .mockResolvedValueOnce([[{ nombre: "Unidad X" }]])
            .mockResolvedValueOnce([[{ valor: null }]]);
        const tmp = await PDFDocument.create();
        tmp.addPage();
        const rawPdf = Buffer.from(await tmp.save());
        mockHtmlToPdfBuffer.mockResolvedValueOnce(rawPdf);

        const out = await documentoService.downloadPdfForSignature({
            documento_id: 50,
            usuario_id: 99,
            skipAccessCheck: true,
        });

        expect(mockHtmlToPdfBuffer).toHaveBeenCalled();
        expect(out.buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
        expect(out.filename).toContain("_50.pdf");
        expect(out.buffer.equals(rawPdf)).toBe(false);
    });

    test("downloadPdfForSignature (PDF firmado en disco) pasa por embed sobre el archivo leído", async () => {
        mockDocumentoFindById.mockResolvedValueOnce({
            id: 51,
            titulo: "Firmado",
            estado: "ARCHIVADO",
            contenido: "<p>x</p>",
            usuario_id: 1,
            unidad_id: 2,
            numero_serie: "COD-51",
            categoria_id: null,
        });
        mockPoolQuery
            .mockResolvedValueOnce([[{ nombre: "Unidad X" }]])
            .mockResolvedValueOnce([[{ valor: "/tmp/signed.pdf" }]]);
        mockExistsSync.mockReturnValueOnce(true);
        const tmp2 = await PDFDocument.create();
        tmp2.addPage();
        const rawFile = Buffer.from(await tmp2.save());
        mockReadFileSync.mockReturnValueOnce(rawFile);

        const out = await documentoService.downloadPdfForSignature({
            documento_id: 51,
            usuario_id: 99,
            skipAccessCheck: true,
        });

        expect(mockReadFileSync).toHaveBeenCalledWith("/tmp/signed.pdf");
        expect(mockHtmlToPdfBuffer).not.toHaveBeenCalled();
        expect(out.buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
        expect(out.buffer.equals(rawFile)).toBe(false);
        expect(out.filename).toContain("_firmado_actual.pdf");
    });

    test("downloadDocxForSignature pasa título, asunto, creador y fechas a htmlToDocxBuffer", async () => {
        mockPoolQuery
            .mockResolvedValueOnce([[{ ok: 1 }]])
            .mockResolvedValueOnce([[{ nombre: "Unidad X" }]]);
        mockDocumentoFindById.mockResolvedValueOnce({
            id: 52,
            titulo: "Word",
            estado: "FIRMA",
            contenido: "<p>h</p>",
            usuario_id: 1,
            unidad_id: 2,
            numero_serie: "COD-52",
            categoria_id: null,
        });
        mockHtmlToDocxBuffer.mockResolvedValueOnce(Buffer.from("DOCX"));

        const out = await documentoService.downloadDocxForSignature({
            documento_id: 52,
            usuario_id: 99,
        });

        expect(mockHtmlToDocxBuffer).toHaveBeenCalled();
        const opts = mockHtmlToDocxBuffer.mock.calls[0][1];
        expect(opts.title).toBe("Título meta");
        expect(opts.creator).toContain("Patrimonius");
        expect(opts.subject).toBeTruthy();
        expect(Array.isArray(opts.keywords)).toBe(true);
        expect(out.filename).toContain("_52.docx");
    });
});
