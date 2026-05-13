import { jest } from "@jest/globals";

const mockGetAll = jest.fn();
const mockGetByFilters = jest.fn();
const mockExistsByCodigo = jest.fn();
const mockCreate = jest.fn();
const mockGetById = jest.fn();
const mockSearchAccess = jest.fn();
const mockSearchAccessInternal = jest.fn();

const mockInsertBitacoraExpedienteSafe = jest.fn(async () => {});
const mockResolveBitacoraUsuarioId = jest.fn((x) => x ?? null);

const mockCatalogoSerieGetById = jest.fn();
const mockCatalogoSubserieGetById = jest.fn();

const mockHistorialRegistrar = jest.fn(async () => {});

const mockPoolQuery = jest.fn();

await jest.unstable_mockModule("../../src/repositories/expedienteRepo.js", () => ({
    default: {
        getAll: mockGetAll,
        getByFilters: mockGetByFilters,
        existsByCodigo: mockExistsByCodigo,
        create: mockCreate,
        getById: mockGetById,
        searchAccess: mockSearchAccess,
        searchAccessInternal: mockSearchAccessInternal,
    },
}));

await jest.unstable_mockModule("../../src/repositories/bitacoraExpedienteRepo.js", () => ({
    insertBitacoraExpedienteSafe: mockInsertBitacoraExpedienteSafe,
    resolveBitacoraUsuarioId: mockResolveBitacoraUsuarioId,
}));

await jest.unstable_mockModule("../../src/repositories/CatalogoSerieRepo.js", () => ({
    default: {
        getById: mockCatalogoSerieGetById,
    },
}));

await jest.unstable_mockModule("../../src/repositories/CatalogoSubserieRepo.js", () => ({
    default: {
        getById: mockCatalogoSubserieGetById,
    },
}));

await jest.unstable_mockModule("../../src/db/pool.js", () => ({
    pool: {
        query: (...a) => mockPoolQuery(...a),
    },
}));

await jest.unstable_mockModule("../../src/repositories/consultaAprobados.repo.js", () => ({
    consultaAprobadosRepo: {},
}));

await jest.unstable_mockModule("../../src/services/consultaAprobados.service.js", () => ({
    consultaAprobadosService: {},
}));

await jest.unstable_mockModule("../../src/services/documento.service.js", () => ({
    documentoService: {},
}));

await jest.unstable_mockModule("../../src/utils/consultaMaster.util.js", () => ({
    isConsultaMasterUser: (user) => Boolean(user?.isMaster),
}));

await jest.unstable_mockModule("../../src/services/historialBusqueda.service.js", () => ({
    historialBusquedaService: {
        registrarBusqueda: mockHistorialRegistrar,
    },
}));

const { expedienteService } = await import("../../src/services/expediente.service.js");

describe("HU-022: expedienteService.list", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("usa getAll cuando no hay filtros", async () => {
        mockGetAll.mockResolvedValueOnce([{ id: 1 }]);

        const out = await expedienteService.list({});

        expect(mockGetAll).toHaveBeenCalled();
        expect(mockGetByFilters).not.toHaveBeenCalled();
        expect(out).toEqual([{ id: 1 }]);
    });

    test("usa getByFilters cuando recibe filtros archivísticos", async () => {
        mockGetByFilters.mockResolvedValueOnce([{ id: 2 }]);

        const out = await expedienteService.list({ unidad_id: 1, serie_id: 2 });

        expect(mockGetByFilters).toHaveBeenCalledWith({
            unidad_id: 1,
            serie_id: 2,
        });
        expect(mockGetAll).not.toHaveBeenCalled();
        expect(out).toEqual([{ id: 2 }]);
    });
});

describe("HU-022: expedienteService.create", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("crea expediente válido y registra bitácora", async () => {
        mockPoolQuery.mockResolvedValueOnce([[{ id: 1 }]]);

        mockExistsByCodigo.mockResolvedValueOnce(null);
        mockCatalogoSerieGetById.mockResolvedValueOnce({ id: 3, unidad_id: 1 });
        mockCatalogoSubserieGetById.mockResolvedValueOnce({ id: 9, serie_id: 3 });
        mockCreate.mockResolvedValueOnce({
            id: 44,
            codigo: "EXP-001",
            nombre: "Expediente de prueba",
            descripcion: null,
            unidad_id: 1,
            serie_id: 3,
            subserie_id: 9,
            estado: "ACTIVO",
        });

        const out = await expedienteService.create(
            {
                codigo: "EXP-001",
                nombre: "Expediente de prueba",
                unidad_id: 1,
                serie_id: 3,
                subserie_id: 9,
            },
            { actorUserId: 15 },
        );

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                codigo: "EXP-001",
                nombre: "Expediente de prueba",
                unidad_id: 1,
                serie_id: 3,
                subserie_id: 9,
                estado: "ACTIVO",
            }),
        );

        expect(mockInsertBitacoraExpedienteSafe).toHaveBeenCalledWith(
            expect.objectContaining({
                expediente_id: 44,
                usuario_id: 15,
                evento: "CREACION",
                resultado: "PERMITIDO",
            }),
        );

        expect(out).toEqual(expect.objectContaining({ id: 44, codigo: "EXP-001" }));
    });

    test("rechaza si la serie no pertenece a la unidad", async () => {
        mockPoolQuery.mockResolvedValueOnce([[{ id: 1 }]]);

        mockExistsByCodigo.mockResolvedValueOnce(null);
        mockCatalogoSerieGetById.mockResolvedValueOnce({ id: 3, unidad_id: 99 });

        await expect(
            expedienteService.create({
                codigo: "EXP-001",
                nombre: "Expediente de prueba",
                unidad_id: 1,
                serie_id: 3,
            }),
        ).rejects.toMatchObject({
            code: "BAD_REQUEST",
            message: "La serie no pertenece a la unidad organizacional indicada",
        });

        expect(mockCreate).not.toHaveBeenCalled();
    });

    test("rechaza si la subserie no pertenece a la serie", async () => {
        mockPoolQuery.mockResolvedValueOnce([[{ id: 1 }]]);

        mockExistsByCodigo.mockResolvedValueOnce(null);
        mockCatalogoSerieGetById.mockResolvedValueOnce({ id: 3, unidad_id: 1 });
        mockCatalogoSubserieGetById.mockResolvedValueOnce({ id: 9, serie_id: 55 });

        await expect(
            expedienteService.create({
                codigo: "EXP-001",
                nombre: "Expediente de prueba",
                unidad_id: 1,
                serie_id: 3,
                subserie_id: 9,
            }),
        ).rejects.toMatchObject({
            code: "BAD_REQUEST",
            message: "La subserie no pertenece a la serie indicada",
        });

        expect(mockCreate).not.toHaveBeenCalled();
    });

    test("rechaza duplicados por código", async () => {
        mockExistsByCodigo.mockResolvedValueOnce({ id: 2 });

        await expect(
            expedienteService.create({
                codigo: "EXP-001",
                nombre: "Expediente de prueba",
                unidad_id: 1,
                serie_id: 3,
            }),
        ).rejects.toMatchObject({
            code: "ER_DUP_ENTRY",
            message: "Ya existe un expediente con ese código",
        });
    });
});

describe("HU-022: expedienteService.searchAccess", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("panel interno usa searchAccessInternal", async () => {
        mockSearchAccessInternal.mockResolvedValueOnce({
            items: [],
            totalItems: 0,
            totalPages: 1,
            page: 1,
            pageSize: 10,
        });

        const out = await expedienteService.searchAccess({
            userId: 20,
            user: { unidadId: 4, isMaster: false },
            query: {
                codigo: "EXP",
                nombre: "Archivo",
                serieId: "2",
                subserieId: "3",
            },
        });

        expect(mockSearchAccessInternal).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 20,
                unidadId: 4,
                isMaster: false,
                codigo: "EXP",
                nombre: "Archivo",
                serieId: "2",
                subserieId: "3",
            }),
        );
        expect(mockSearchAccess).not.toHaveBeenCalled();
        expect(out.totalPages).toBe(1);
    });

    test("panel externo usa searchAccess", async () => {
        mockSearchAccess.mockResolvedValueOnce({
            items: [],
            totalItems: 0,
            totalPages: 1,
            page: 1,
            pageSize: 10,
        });

        await expedienteService.searchAccess({
            userId: 20,
            user: { unidadId: 4, isMaster: false },
            query: {
                panelExterno: "1",
                codigo: "EXP",
            },
        });

        expect(mockSearchAccess).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 20,
                unidadId: 4,
                isMaster: false,
                codigo: "EXP",
            }),
        );
        expect(mockSearchAccessInternal).not.toHaveBeenCalled();
    });

    test("si hay búsqueda con resultados registra historial", async () => {
        mockSearchAccessInternal.mockResolvedValueOnce({
            items: [{ id: 1 }],
            totalItems: 1,
            totalPages: 1,
            page: 1,
            pageSize: 10,
        });

        await expedienteService.searchAccess({
            userId: 20,
            user: { unidadId: 4, isMaster: false },
            query: {
                nombre: "Expediente 1",
                vista: "expedientes",
            },
        });

        expect(mockHistorialRegistrar).toHaveBeenCalledWith(
            expect.objectContaining({
                usuario_id: 20,
                texto_busqueda: "Expediente 1",
                filtros: expect.objectContaining({
                    vista: "expedientes",
                    viewer: "interno",
                }),
            }),
        );
    });
});