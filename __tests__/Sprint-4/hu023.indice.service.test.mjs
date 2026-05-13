import { jest } from "@jest/globals";

const mockIndiceRepo = {
    getExpedienteById: jest.fn(),
    getDocumentosByExpedienteId: jest.fn(),
    getIndexByHash: jest.fn(),
    createExpedienteIndex: jest.fn(),
    updateIndexFiles: jest.fn(),
    closeExpediente: jest.fn(),
    getIndexByExpedienteId: jest.fn(),
    getIndicesByExpedienteId: jest.fn(),
    getAllIndices: jest.fn(),
    getIndexById: jest.fn(),
};

const mockLogAdminAction = jest.fn();

await jest.unstable_mockModule("../../src/repositories/indiceRepo.js", () => ({
    indiceRepo: mockIndiceRepo,
}));

await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
    logAdminAction: mockLogAdminAction,
}));

await jest.unstable_mockModule("fs", () => ({
    default: {
        existsSync: jest.fn(() => false),
        readFileSync: jest.fn(() => Buffer.from("")),
        promises: {
            mkdir: jest.fn(async () => {}),
            writeFile: jest.fn(async () => {}),
            readFile: jest.fn(async () => Buffer.from("fake")),
        },
    },
}));

await jest.unstable_mockModule("puppeteer", () => ({
    default: {
        launch: jest.fn(async () => ({
            newPage: jest.fn(async () => ({
                setContent: jest.fn(async () => {}),
                pdf: jest.fn(async () => {}),
            })),
            close: jest.fn(async () => {}),
        })),
    },
}));

await jest.unstable_mockModule("docx", () => ({
    Document: class {},
    Packer: { toBuffer: jest.fn(async () => Buffer.from("docx")) },
    Paragraph: class {},
    TextRun: class {},
    Table: class {},
    TableRow: class {},
    TableCell: class {},
    WidthType: { PERCENTAGE: "PERCENTAGE" },
    AlignmentType: { CENTER: "CENTER", JUSTIFIED: "JUSTIFIED" },
    BorderStyle: { SINGLE: "SINGLE" },
    ShadingType: { CLEAR: "CLEAR" },
    VerticalAlign: { CENTER: "CENTER" },
    ImageRun: class {},
}));

const { indiceService } = await import("../../src/services/indice.service.js");

describe("HU-023: Índice electrónico (servicio) — cerrar expediente", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const expedienteBase = {
        id: 10,
        codigo: "EXP-10",
        nombre: "Exp test",
        estado: "ACTIVO",
        fecha_creacion: new Date("2026-01-01T00:00:00.000Z"),
        fecha_cierre: null,
        unidad_id: 1,
        unidad_nombre: "Archivo Central",
        serie_id: 1,
        serie_nombre: "Serie 1",
        subserie_id: 1,
        subserie_nombre: "Subserie 1",
        created_by: 1,
    };

    const docOk = {
        id: 1,
        titulo: "Doc 1",
        estado: "APROBADO",
        numero_serie: "DOC-1",
        expediente_id: 10,
        numero_firmas: 1,
        firmas_obtenidas: 1,
        fecha: new Date("2026-01-02T00:00:00.000Z"),
        contenido_hash: "abc",
    };

    test("genera índice, guarda archivos y cierra expediente cuando no existe hash previo", async () => {
        mockIndiceRepo.getExpedienteById.mockResolvedValue(expedienteBase);
        mockIndiceRepo.getDocumentosByExpedienteId.mockResolvedValue([docOk]);
        mockIndiceRepo.getIndexByHash.mockResolvedValue(null);
        mockIndiceRepo.createExpedienteIndex.mockResolvedValue({
            id: 700,
            hash: "somehash",
            fecha: new Date(),
            firma_id: null,
            expediente_id: 10,
        });
        mockIndiceRepo.updateIndexFiles.mockResolvedValue({
            id: 700,
            expediente_id: 10,
            json_path: "uploads/indices/indice-expediente-10-700.json",
            acta_pdf_path: "uploads/indices/acta-cierre-expediente-10-700.pdf",
        });
        mockIndiceRepo.closeExpediente.mockResolvedValue(true);

        const out = await indiceService.cerrarExpediente(10, { id: 123 });

        expect(out.duplicated).toBe(false);
        expect(out.expedienteId).toBe(10);
        expect(out.indice.id).toBe(700);

        expect(mockIndiceRepo.createExpedienteIndex).toHaveBeenCalledWith(
            expect.objectContaining({
                expedienteId: 10,
                firmaId: null,
            }),
        );

        expect(mockIndiceRepo.updateIndexFiles).toHaveBeenCalledWith(
            700,
            expect.objectContaining({
                jsonPath: expect.stringContaining("uploads/indices/"),
                actaPdfPath: expect.stringContaining("uploads/indices/"),
            }),
        );

        expect(mockIndiceRepo.closeExpediente).toHaveBeenCalledTimes(1);
        const [closeId, closeFechas] = mockIndiceRepo.closeExpediente.mock.calls[0];
        expect(closeId).toBe(10);
        expect(closeFechas).toEqual(
            expect.objectContaining({
                fechaCierre: expect.any(Date),
                fechaInicioVigencia: expect.any(Date),
                fechaVencimiento: expect.any(Date),
            }),
        );
        expect(closeFechas.fechaInicioVigencia.getTime()).toBe(
            closeFechas.fechaCierre.getTime(),
        );
        expect(closeFechas.fechaInicioVigencia.getTime()).toBe(
            closeFechas.fechaVencimiento.getTime(),
        );
        expect(mockLogAdminAction).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "EXPEDIENTE_CLOSE_INDEX_GENERATE",
                result: "OK",
            }),
        );
    });

    test("no crea índice nuevo si el hash ya existe", async () => {
        mockIndiceRepo.getExpedienteById.mockResolvedValue(expedienteBase);
        mockIndiceRepo.getDocumentosByExpedienteId.mockResolvedValue([docOk]);
        mockIndiceRepo.getIndexByHash.mockResolvedValue({
            id: 44,
            hash: "dup",
            expediente_id: 10,
        });

        const out = await indiceService.cerrarExpediente(10, { id: 1 });

        expect(out.duplicated).toBe(true);
        expect(mockIndiceRepo.createExpedienteIndex).not.toHaveBeenCalled();
        expect(mockIndiceRepo.updateIndexFiles).not.toHaveBeenCalled();
        expect(mockIndiceRepo.closeExpediente).not.toHaveBeenCalled();
        expect(mockLogAdminAction).not.toHaveBeenCalled();
    });

    test("lanza 404 cuando el expediente no existe", async () => {
        mockIndiceRepo.getExpedienteById.mockResolvedValue(null);

        await expect(indiceService.cerrarExpediente(10, { id: 1 })).rejects.toMatchObject({
            code: 404,
        });
    });

    test("lanza 404 cuando el expediente no tiene documentos", async () => {
        mockIndiceRepo.getExpedienteById.mockResolvedValue(expedienteBase);
        mockIndiceRepo.getDocumentosByExpedienteId.mockResolvedValue([]);

        await expect(indiceService.cerrarExpediente(10, { id: 1 })).rejects.toMatchObject({
            code: 404,
        });
    });

    test("lanza 422 cuando hay documentos con estado no permitido", async () => {
        mockIndiceRepo.getExpedienteById.mockResolvedValue(expedienteBase);
        mockIndiceRepo.getDocumentosByExpedienteId.mockResolvedValue([
            { ...docOk, estado: "BORRADOR" },
        ]);

        await expect(indiceService.cerrarExpediente(10, { id: 1 })).rejects.toMatchObject({
            code: 422,
        });
    });

    test("list delega en el repo", async () => {
        mockIndiceRepo.getAllIndices.mockResolvedValue([{ id: 1 }]);

        const out = await indiceService.list();

        expect(out).toEqual([{ id: 1 }]);
        expect(mockIndiceRepo.getAllIndices).toHaveBeenCalledTimes(1);
    });

    test("getById devuelve 404 cuando no existe", async () => {
        mockIndiceRepo.getIndexById.mockResolvedValue(null);

        await expect(indiceService.getById(99)).rejects.toMatchObject({
            code: 404,
        });
    });

    test("getByExpedienteId devuelve 404 cuando no existe", async () => {
        mockIndiceRepo.getIndexByExpedienteId.mockResolvedValue(null);

        await expect(indiceService.getByExpedienteId(99)).rejects.toMatchObject({
            code: 404,
        });
    });

    test("listByExpedienteId delega en el repo", async () => {
        mockIndiceRepo.getIndicesByExpedienteId.mockResolvedValue([{ id: 7 }]);

        const out = await indiceService.listByExpedienteId(10);

        expect(out).toEqual([{ id: 7 }]);
        expect(mockIndiceRepo.getIndicesByExpedienteId).toHaveBeenCalledWith(10);
    });
});
