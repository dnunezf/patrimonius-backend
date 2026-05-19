import { jest } from "@jest/globals";

const mockSerieCreate = jest.fn();
const mockSerieGetAll = jest.fn();
const mockSerieGetById = jest.fn();
const mockSerieGetByUnidadId = jest.fn();
const mockSerieUpdate = jest.fn();
const mockSerieCountSubseries = jest.fn();
const mockSerieCountExpedientes = jest.fn();
const mockSerieDelete = jest.fn();

const mockSubserieCreate = jest.fn();
const mockSubserieGetAll = jest.fn();
const mockSubserieGetById = jest.fn();
const mockSubserieGetByUnidadId = jest.fn();
const mockSubserieUpdate = jest.fn();
const mockSubserieCountExpedientes = jest.fn();
const mockSubserieDelete = jest.fn();

const mockLogAdminAction = jest.fn(async () => {});

await jest.unstable_mockModule("../../src/repositories/serieRepo.js", () => ({
    serieRepo: {
        createSerie: mockSerieCreate,
        getAllSeries: mockSerieGetAll,
        getSerieById: mockSerieGetById,
        getSeriesByUnidadId: mockSerieGetByUnidadId,
        updateSerie: mockSerieUpdate,
        countSubseriesBySerieId: mockSerieCountSubseries,
        countExpedientesBySerieId: mockSerieCountExpedientes,
        deleteSerie: mockSerieDelete,
    },
}));

await jest.unstable_mockModule("../../src/repositories/subserieRepo.js", () => ({
    subserieRepo: {
        createSubserie: mockSubserieCreate,
        getAllSubseries: mockSubserieGetAll,
        getSubserieById: mockSubserieGetById,
        getSubseriesByUnidadId: mockSubserieGetByUnidadId,
        updateSubserie: mockSubserieUpdate,
        countExpedientesBySubserieId: mockSubserieCountExpedientes,
        deleteSubserie: mockSubserieDelete,
    },
}));

await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
    logAdminAction: mockLogAdminAction,
}));

const { serieService } = await import("../../src/services/serie.service.js");
const { subserieService } = await import("../../src/services/subserie.service.js");

describe("HU-022: serieService", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("createSerie valida requeridos y registra bitácora", async () => {
        mockSerieCreate.mockResolvedValueOnce({
            id: 11,
            codigo: "SER-001",
            nombre: "Serie A",
            unidad_id: 1,
        });

        const out = await serieService.createSerie({
            codigo: "SER-001",
            nombre: "Serie A",
            unidad_id: 1,
            descripcion: "desc",
        });

        expect(mockSerieCreate).toHaveBeenCalledWith({
            codigo: "SER-001",
            nombre: "Serie A",
            unidad_id: 1,
            descripcion: "desc",
        });

        expect(mockLogAdminAction).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "SERIE_CREATE",
                result: "OK",
                serieId: 11,
                serieCodigo: "SER-001",
            }),
        );

        expect(out).toEqual(expect.objectContaining({ id: 11 }));
    });

    test("getSeriesByUnidadId exige unidad", async () => {
        await expect(serieService.getSeriesByUnidadId()).rejects.toThrow(
            "La unidad del usuario es requerida",
        );
    });

    test("deleteSerie rechaza si tiene subseries", async () => {
        mockSerieGetById.mockResolvedValueOnce({ id: 9, codigo: "SER-9" });
        mockSerieCountSubseries.mockResolvedValueOnce(2);

        await expect(serieService.deleteSerie(9)).rejects.toThrow(
            "Esta serie tiene subseries asignadas",
        );

        expect(mockSerieDelete).not.toHaveBeenCalled();
    });

    test("deleteSerie rechaza si tiene expedientes", async () => {
        mockSerieGetById.mockResolvedValueOnce({ id: 9, codigo: "SER-9" });
        mockSerieCountSubseries.mockResolvedValueOnce(0);
        mockSerieCountExpedientes.mockResolvedValueOnce(3);

        await expect(serieService.deleteSerie(9)).rejects.toThrow(
            "Esta serie tiene expedientes asignados",
        );

        expect(mockSerieDelete).not.toHaveBeenCalled();
    });
});

describe("HU-022: subserieService", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("createSubserie valida requeridos y registra bitácora", async () => {
        mockSubserieCreate.mockResolvedValueOnce({
            id: 21,
            codigo: "SUB-001",
            nombre: "Subserie A",
            serie_id: 11,
        });

        const out = await subserieService.createSubserie({
            codigo: "SUB-001",
            nombre: "Subserie A",
            serie_id: 11,
            descripcion: "desc",
        });

        expect(mockSubserieCreate).toHaveBeenCalledWith({
            codigo: "SUB-001",
            nombre: "Subserie A",
            serie_id: 11,
            descripcion: "desc",
        });

        expect(mockLogAdminAction).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "SUBSERIE_CREATE",
                result: "OK",
                subserieId: 21,
                subserieCodigo: "SUB-001",
            }),
        );

        expect(out).toEqual(expect.objectContaining({ id: 21 }));
    });

    test("getSubseriesByUnidadId exige unidad", async () => {
        await expect(subserieService.getSubseriesByUnidadId()).rejects.toThrow(
            "La unidad del usuario es requerida",
        );
    });

    test("deleteSubserie rechaza si tiene expedientes", async () => {
        mockSubserieGetById.mockResolvedValueOnce({ id: 5, codigo: "SUB-5" });
        mockSubserieCountExpedientes.mockResolvedValueOnce(1);

        await expect(subserieService.deleteSubserie(5)).rejects.toThrow(
            "Esta subserie tiene expedientes asignados",
        );

        expect(mockSubserieDelete).not.toHaveBeenCalled();
    });
});