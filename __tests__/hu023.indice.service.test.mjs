import { jest } from "@jest/globals";

const mockIndiceRepo = {
    getExpedienteById: jest.fn(),
    getDocumentosByExpedienteId: jest.fn(),
    getIndexByHash: jest.fn(),
    createExpedienteIndex: jest.fn(),
    closeExpediente: jest.fn(),
    getIndexByExpedienteId: jest.fn(),
};

const mockLogAdminAction = jest.fn();

await jest.unstable_mockModule("../src/repositories/indiceRepo.js", () => ({
    indiceRepo: mockIndiceRepo,
}));

await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
    logAdminAction: mockLogAdminAction,
}));

await jest.unstable_mockModule("fs", () => ({
    default: {
        promises: {
            mkdir: jest.fn(async () => {}),
            writeFile: jest.fn(async () => {}),
        },
    },
}));

const { indiceService } = await import("../src/services/indice.service.js");

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
        serie_id: 1,
        subserie_id: 1,
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

    test("genera índice y cierra expediente cuando no existe hash previo", async () => {
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
        mockIndiceRepo.closeExpediente.mockResolvedValue(true);

        const out = await indiceService.cerrarExpediente(10, { id: 123 });

        expect(out.duplicated).toBe(false);
        expect(out.expedienteId).toBe(10);
        expect(out.indice.id).toBe(700);
        expect(mockIndiceRepo.createExpedienteIndex).toHaveBeenCalled();
        expect(mockIndiceRepo.closeExpediente).toHaveBeenCalledWith(10);
        expect(mockLogAdminAction).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "EXPEDIENTE_CLOSE_INDEX_GENERATE",
                result: "OK",
            })
        );
    });

    test("no crea índice nuevo si el hash ya existe (duplicado)", async () => {
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
        expect(mockIndiceRepo.closeExpediente).not.toHaveBeenCalled();
        expect(mockLogAdminAction).not.toHaveBeenCalled();
    });

    test("no cierra ni persiste cuando el expediente no tiene documentos", async () => {
        mockIndiceRepo.getExpedienteById.mockResolvedValue(expedienteBase);
        mockIndiceRepo.getDocumentosByExpedienteId.mockResolvedValue([]);

        await expect(indiceService.cerrarExpediente(10, { id: 1 })).rejects.toMatchObject({
            code: 404,
        });
    });

    test("rechaza documentos con estado no permitido para el índice", async () => {
        mockIndiceRepo.getExpedienteById.mockResolvedValue(expedienteBase);
        mockIndiceRepo.getDocumentosByExpedienteId.mockResolvedValue([
            { ...docOk, estado: "BORRADOR" },
        ]);

        await expect(indiceService.cerrarExpediente(10, { id: 1 })).rejects.toMatchObject({
            code: 422,
        });
    });
});
