import { jest } from "@jest/globals";

const mockCreate = jest.fn();
const mockListByUsuario = jest.fn();
const mockClearByUsuario = jest.fn();
const mockDeleteOne = jest.fn();

const mockInsertBase = jest.fn(async () => 9001);
const mockInsertActividad = jest.fn(async () => {});

await jest.unstable_mockModule("../../src/repositories/historialBusqueda.repo.js", () => ({
    historialBusquedaRepo: {
        create: mockCreate,
        listByUsuario: mockListByUsuario,
        clearByUsuario: mockClearByUsuario,
        deleteOne: mockDeleteOne,
    },
}));

await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: {
        insertBase: mockInsertBase,
        insertActividad: mockInsertActividad,
    },
}));

const { historialBusquedaService } = await import(
    "../../src/services/historialBusqueda.service.js"
    );

describe("HU-028: Historial de búsqueda (service)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("registrarBusqueda retorna null si texto está vacío", async () => {
        const out = await historialBusquedaService.registrarBusqueda({
            usuario_id: 5,
            texto_busqueda: "   ",
            filtros: { vista: "documentos" },
        });

        expect(out).toBeNull();
        expect(mockListByUsuario).not.toHaveBeenCalled();
        expect(mockCreate).not.toHaveBeenCalled();
    });

    test("registrarBusqueda evita duplicar inmediatamente la última búsqueda igual", async () => {
        mockListByUsuario.mockResolvedValueOnce([
            { texto_busqueda: "Documento 66" },
        ]);

        const out = await historialBusquedaService.registrarBusqueda({
            usuario_id: 5,
            texto_busqueda: "documento 66",
            filtros: { vista: "documentos", titulo: "Documento 66" },
        });

        expect(mockListByUsuario).toHaveBeenCalledWith({
            usuario_id: 5,
            limit: 1,
        });
        expect(out).toBeNull();
        expect(mockCreate).not.toHaveBeenCalled();
    });

    test("registrarBusqueda crea historial y normaliza filtros vacíos", async () => {
        mockListByUsuario.mockResolvedValueOnce([]);
        mockCreate.mockResolvedValueOnce({
            id: 88,
            usuario_id: 5,
            texto_busqueda: "Documento 66",
            filtros: {
                vista: "documentos",
                titulo: "Documento 66",
            },
        });

        const out = await historialBusquedaService.registrarBusqueda({
            usuario_id: 5,
            texto_busqueda: " Documento 66 ",
            filtros: {
                vista: "documentos",
                titulo: "Documento 66",
                codigo: "",
                categoriaId: null,
            },
        });

        expect(mockCreate).toHaveBeenCalledWith({
            usuario_id: 5,
            texto_busqueda: "Documento 66",
            filtros: {
                vista: "documentos",
                titulo: "Documento 66",
            },
        });

        expect(out).toEqual(
            expect.objectContaining({
                id: 88,
                usuario_id: 5,
                texto_busqueda: "Documento 66",
            }),
        );
    });

    test("listarMiHistorial delega en repo", async () => {
        mockListByUsuario.mockResolvedValueOnce([{ id: 1 }]);

        const out = await historialBusquedaService.listarMiHistorial({
            usuario_id: 5,
            limit: 8,
        });

        expect(mockListByUsuario).toHaveBeenCalledWith({
            usuario_id: 5,
            limit: 8,
        });
        expect(out).toEqual([{ id: 1 }]);
    });

    test("limpiarMiHistorial elimina historial y registra bitácora", async () => {
        mockClearByUsuario.mockResolvedValueOnce({ deletedCount: 4 });

        const out = await historialBusquedaService.limpiarMiHistorial({
            usuario_id: 5,
        });

        expect(mockClearByUsuario).toHaveBeenCalledWith({ usuario_id: 5 });
        expect(mockInsertBase).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "LIMPIAR_HISTORIAL_BUSQUEDA",
                resultado: "PERMITIDO",
                usuario_id: 5,
                documento_id: null,
            }),
        );
        expect(mockInsertActividad).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 9001,
                actividad: "OTRA",
                recurso: "HISTORIAL_BUSQUEDA",
                accion: "LIMPIAR_HISTORIAL_BUSQUEDA",
            }),
        );
        expect(out).toEqual({ deletedCount: 4 });
    });

    test("eliminarUnaBusqueda delega en repo", async () => {
        mockDeleteOne.mockResolvedValueOnce({ deletedCount: 1 });

        const out = await historialBusquedaService.eliminarUnaBusqueda({
            usuario_id: 5,
            historial_id: 17,
        });

        expect(mockDeleteOne).toHaveBeenCalledWith({
            id: 17,
            usuario_id: 5,
        });
        expect(out).toEqual({ deletedCount: 1 });
    });
});