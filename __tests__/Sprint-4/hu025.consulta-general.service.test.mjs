// __tests__/hu025.consulta-general.service.test.mjs
/**
 * HU-025: Consulta general de documentos aprobados/archivados (búsqueda, filtros, permisos por contexto).
 * - Catálogo externo vs interno (incl. multi-rol y panel externo explícito).
 * - Filtros y ordenación delegados al repositorio; resultado enriquecido (canView, estadoEtiqueta, viewer).
 * - Bitácora de búsqueda: sin ciclo documental (interno/externo); actividad de usuario vía insertActividad.
 */
import { jest } from "@jest/globals";

const mockSearchExterno = jest.fn();
const mockSearchInternal = jest.fn();
const mockListFiltersExterno = jest.fn();
const mockListFiltersInternal = jest.fn();

const mockBitacoraInsertBase = jest.fn(async () => 9001);
const mockBitacoraInsertActividad = jest.fn(async () => {});
const mockBitacoraInsertCiclo = jest.fn(async () => {});

await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: {
        insertBase: mockBitacoraInsertBase,
        insertActividad: mockBitacoraInsertActividad,
        insertCiclo: mockBitacoraInsertCiclo,
    },
    logAdminAction: jest.fn(),
    logSecurityEvent: jest.fn(),
}));

await jest.unstable_mockModule("../../src/repositories/consultaAprobados.repo.js", () => ({
    consultaAprobadosRepo: {
        searchExterno: mockSearchExterno,
        searchInternal: mockSearchInternal,
        listFiltersExterno: mockListFiltersExterno,
        listFiltersInternal: mockListFiltersInternal,
    },
}));

await jest.unstable_mockModule("../../src/repositories/documentoRepo.js", () => ({
    documentoRepo: {
        findById: jest.fn(async () => ({})),
    },
}));

await jest.unstable_mockModule("../../src/repositories/metadatoRepo.js", () => ({
    metadatoRepo: {
        findByTipo: jest.fn(async () => null),
    },
}));

const { consultaAprobadosService } = await import("../../src/services/consultaAprobados.service.js");

const reqBase = { originalUrl: "/documents/consulta/search", ip: "127.0.0.1" };

describe("HU-025: Búsqueda — catálogo externo (solo USUARIO_EXTERNO)", () => {
    const actor = { id: 100, unidadId: 1, rolIds: [5] };
    const user = { role: "USUARIO_EXTERNO", rolId: 5, rolIds: [5] };

    beforeEach(() => {
        jest.clearAllMocks();
        mockBitacoraInsertBase.mockResolvedValue(9001);
        mockSearchExterno.mockResolvedValue({
            items: [
                {
                    id: 1,
                    codigo: "DOC-1",
                    titulo: "Informe",
                    estado: "APROBADO",
                    can_view_perm: true,
                },
                {
                    id: 2,
                    codigo: "DOC-2",
                    titulo: "Acta",
                    estado: "ARCHIVADO",
                    can_view_perm: 0,
                },
            ],
            totalItems: 2,
            totalDescargables: 1,
            totalPages: 1,
            page: 1,
            pageSize: 10,
        });
    });

    test("delega en searchExterno y expone viewer externo y flags de permiso por fila", async () => {
        const out = await consultaAprobadosService.search({
            user,
            actor,
            query: {
                q: "informe",
                categoriaId: "3",
                dateFrom: "2025-01-01",
                dateTo: "2025-12-31",
                page: 2,
                pageSize: 20,
                sortBy: "titulo",
                sortDir: "asc",
            },
            req: reqBase,
        });

        expect(mockSearchExterno).toHaveBeenCalledWith({
            userId: 100,
            unidadId: 1,
            isMaster: false,
            rolIds: [5],
            filters: expect.objectContaining({
                q: "informe",
                categoriaId: "3",
                dateFrom: "2025-01-01",
                dateTo: "2025-12-31",
            }),
            page: 2,
            pageSize: 20,
            sortBy: "titulo",
            sortDir: "asc",
        });
        expect(mockSearchInternal).not.toHaveBeenCalled();
        expect(out.viewer).toBe("externo");
        expect(out.totalDescargables).toBe(1);
        expect(out.filtroUnidadUsuario).toBe(1);
        expect(out.aplicaFiltroUnidad).toBe(true);

        const [rowA, rowB] = out.items;
        expect(rowA.canView).toBe(true);
        expect(rowA.canPreview).toBe(true);
        expect(rowA.canDownload).toBe(true);
        expect(rowA.estadoEtiqueta).toBe("Aprobado");
        expect(rowB.canView).toBe(false);
        expect(rowB.estadoEtiqueta).toBe("Archivado");
    });

    test("bitácora de búsqueda externa: BUSQUEDA_DOCUMENTO_E sin ciclo documental", async () => {
        await consultaAprobadosService.search({
            user,
            actor,
            query: { q: "x" },
            req: reqBase,
        });

        expect(mockBitacoraInsertBase).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "BUSQUEDA_DOCUMENTO_E",
                usuario_id: 100,
                documento_id: null,
            }),
        );
        expect(mockBitacoraInsertActividad).toHaveBeenCalled();
        expect(mockBitacoraInsertCiclo).not.toHaveBeenCalled();
    });
});

describe("HU-025: Búsqueda — consulta interna (unidad y confidencialidad en SQL)", () => {
    const actor = { id: 50, unidadId: 7, rolIds: [2] };
    const user = { role: "USUARIO", rolId: 2, rolIds: [2] };

    beforeEach(() => {
        jest.clearAllMocks();
        mockBitacoraInsertBase.mockResolvedValue(8002);
        mockSearchInternal.mockResolvedValue({
            items: [{ id: 9, estado: "APROBADO", codigo: "X", titulo: "Y" }],
            totalItems: 1,
            totalPages: 1,
            page: 1,
            pageSize: 10,
        });
    });

    test("delega en searchInternal con unidad del actor; items con vista/descarga permitida", async () => {
        const out = await consultaAprobadosService.search({
            user,
            actor,
            query: { unidadId: "7", serieId: "1" },
            req: reqBase,
        });

        expect(mockSearchInternal).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 50,
                unidadId: 7,
                isMaster: false,
                filters: expect.objectContaining({
                    unidadId: "7",
                    serieId: "1",
                }),
            }),
        );
        expect(mockSearchExterno).not.toHaveBeenCalled();
        expect(out.viewer).toBe("interno");
        expect(out.aplicaFiltroUnidad).toBe(true);
        expect(out.filtroUnidadUsuario).toBe(7);
        expect(out.items[0].canPreview).toBe(true);
        expect(out.items[0].canDownload).toBe(true);
    });

    test("bitácora de búsqueda interna: BUSQUEDA_DOCUMENTO_I sin ciclo documental (solo actividad usuario)", async () => {
        await consultaAprobadosService.search({
            user,
            actor,
            query: {},
            req: reqBase,
        });

        expect(mockBitacoraInsertBase).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "BUSQUEDA_DOCUMENTO_I",
            }),
        );
        expect(mockBitacoraInsertActividad).toHaveBeenCalled();
        expect(mockBitacoraInsertCiclo).not.toHaveBeenCalled();
    });

    test("usuario interno sin unidad resoluble → BAD_REQUEST", async () => {
        await expect(
            consultaAprobadosService.search({
                user,
                actor: { id: 50, rolIds: [2] },
                query: {},
                req: reqBase,
            }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(mockSearchInternal).not.toHaveBeenCalled();
    });
});

describe("HU-025: Búsqueda — administrador (master) sin restricción por unidad en validación", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockBitacoraInsertBase.mockResolvedValue(1);
        mockSearchInternal.mockResolvedValue({
            items: [],
            totalItems: 0,
            totalPages: 1,
            page: 1,
            pageSize: 10,
        });
    });

    test("master puede buscar aunque actor.unidadId sea null", async () => {
        const user = { role: "ADMINISTRADOR", rolId: 1, rolIds: [1] };
        const actor = { id: 2, unidadId: null, rolIds: [1] };

        await consultaAprobadosService.search({ user, actor, query: {}, req: reqBase });

        expect(mockSearchInternal).toHaveBeenCalledWith(
            expect.objectContaining({
                isMaster: true,
                userId: 2,
            }),
        );
        const call = mockSearchInternal.mock.calls[0][0];
        expect(call.unidadId === undefined || call.unidadId === null).toBe(true);
    });
});

describe("HU-025: Búsqueda — multi-rol y panel de catálogo externo explícito", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockBitacoraInsertBase.mockResolvedValue(1);
        mockSearchExterno.mockResolvedValue({
            items: [],
            totalItems: 0,
            totalDescargables: 0,
            totalPages: 1,
            page: 1,
            pageSize: 10,
        });
        mockSearchInternal.mockResolvedValue({
            items: [],
            totalItems: 0,
            totalPages: 1,
            page: 1,
            pageSize: 10,
        });
    });

    test("rol interno + EXTERNO y panelExterno=1 → catálogo externo", async () => {
        const user = { role: "USUARIO", rolId: 2, rolIds: [2, 5] };
        const actor = { id: 3, unidadId: 4, rolIds: [2, 5] };

        const out = await consultaAprobadosService.search({
            user,
            actor,
            query: { panelExterno: "1" },
            req: reqBase,
        });

        expect(mockSearchExterno).toHaveBeenCalled();
        expect(mockSearchInternal).not.toHaveBeenCalled();
        expect(out.viewer).toBe("externo");
    });

    test("multi-rol sin panel externo → consulta interna (no forzar catálogo solo-APROBADO)", async () => {
        const user = { role: "USUARIO", rolId: 2, rolIds: [2, 5] };
        const actor = { id: 3, unidadId: 4, rolIds: [2, 5] };

        await consultaAprobadosService.search({
            user,
            actor,
            query: {},
            req: reqBase,
        });

        expect(mockSearchInternal).toHaveBeenCalled();
        expect(mockSearchExterno).not.toHaveBeenCalled();
    });
});

describe("HU-025: Filtros del listado (metadatos para la UI)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("listFilters: catálogo externo → listFiltersExterno", async () => {
        mockListFiltersExterno.mockResolvedValueOnce({ categorias: [{ id: 1, nombre: "A" }] });
        const user = { role: "USUARIO_EXTERNO", rolId: 5, rolIds: [5] };
        const actor = { id: 1, unidadId: 1, rolIds: [5] };

        const data = await consultaAprobadosService.listFilters({ user, actor, query: {} });

        expect(mockListFiltersExterno).toHaveBeenCalledWith({
            unidadId: 1,
            isMaster: false,
        });
        expect(mockListFiltersInternal).not.toHaveBeenCalled();
        expect(data.categorias).toEqual([{ id: 1, nombre: "A" }]);
    });

    test("listFilters: interno → listFiltersInternal con unidad", async () => {
        mockListFiltersInternal.mockResolvedValueOnce({ categorias: [] });
        const user = { role: "USUARIO", rolId: 2, rolIds: [2] };
        const actor = { id: 1, unidadId: 9, rolIds: [2] };

        await consultaAprobadosService.listFilters({ user, actor, query: {} });

        expect(mockListFiltersInternal).toHaveBeenCalledWith({
            userId: 1,
            unidadId: 9,
            isMaster: false,
        });
    });

    test("listFilters: interno sin unidad → BAD_REQUEST", async () => {
        const user = { role: "USUARIO", rolId: 2, rolIds: [2] };
        await expect(
            consultaAprobadosService.listFilters({ user, actor: { id: 1, rolIds: [2] }, query: {} }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
});
