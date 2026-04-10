// __tests__/hu025.consultaAprobados.repo.test.mjs
/**
 * HU-025: Reglas de datos en consulta — solo estados APROBADO/ARCHIVADO, firmados,
 * y condiciones de confidencialidad en SQL (interno) / permisos VIEW (externo).
 */
import { jest } from "@jest/globals";

const mockPoolQuery = jest.fn();

await jest.unstable_mockModule("../src/db/pool.js", () => ({
    pool: { query: (...a) => mockPoolQuery(...a) },
}));

const { consultaAprobadosRepo, ESTADOS_CONSULTA } = await import("../src/repositories/consultaAprobados.repo.js");

describe("HU-025: Constantes de estados consultables", () => {
    test("solo APROBADO y ARCHIVADO", () => {
        expect(ESTADOS_CONSULTA).toEqual(["APROBADO", "ARCHIVADO"]);
    });
});

describe("HU-025: searchInternal — SQL (pool mockeado)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPoolQuery
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);
    });

    test("incluye filtro de estados finales y condición de firmas", async () => {
        await consultaAprobadosRepo.searchInternal({
            userId: 10,
            unidadId: 3,
            isMaster: false,
            rolIds: [2],
            filters: {},
            page: 1,
            pageSize: 10,
        });

        const sqlCount = String(mockPoolQuery.mock.calls[0][0]);
        expect(sqlCount).toContain("APROBADO");
        expect(sqlCount).toContain("ARCHIVADO");
        expect(sqlCount).toContain("numero_firmas");
        expect(sqlCount).toContain("firmas_obtenidas");
        expect(sqlCount).toContain("d.unidad_id = ?");
    });

    test("usuario master: no filtra por unidad en WHERE", async () => {
        await consultaAprobadosRepo.searchInternal({
            userId: 1,
            unidadId: 99,
            isMaster: true,
            rolIds: [1],
            filters: {},
        });

        const sqlCount = String(mockPoolQuery.mock.calls[0][0]);
        expect(sqlCount).toContain("(1=1)");
        expect(sqlCount).not.toMatch(/d\.unidad_id = \?/);
    });

    test("incluye lógica de confidencialidad interna (PUBLIC/INTERNAL o permisos VIEW)", async () => {
        await consultaAprobadosRepo.searchInternal({
            userId: 10,
            unidadId: 3,
            isMaster: false,
            filters: {},
        });

        const sqlCount = String(mockPoolQuery.mock.calls[0][0]);
        expect(sqlCount).toContain("confid_level");
        expect(sqlCount).toContain("Documento_Allowed_User");
    });

    test("ordenamiento por título refleja columna d.titulo", async () => {
        await consultaAprobadosRepo.searchInternal({
            userId: 10,
            unidadId: 3,
            isMaster: false,
            rolIds: [2],
            filters: {},
            sortBy: "titulo",
            sortDir: "asc",
        });

        const sqlData = String(mockPoolQuery.mock.calls[1][0]);
        expect(sqlData).toMatch(/ORDER BY\s+d\.titulo\s+ASC/i);
    });
});

describe("HU-025: searchExterno — SQL (pool mockeado)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPoolQuery
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);
    });

    test("incluye estados consultables, firmas y permiso VIEW en resultados", async () => {
        await consultaAprobadosRepo.searchExterno({
            userId: 20,
            rolIds: [5],
            filters: {},
            page: 1,
            pageSize: 10,
        });

        const firstSql = String(mockPoolQuery.mock.calls[0][0]);
        expect(firstSql).toContain("APROBADO");
        expect(firstSql).toContain("ARCHIVADO");

        const thirdSql = String(mockPoolQuery.mock.calls[2][0]);
        expect(thirdSql).toContain("can_view_perm");
        expect(thirdSql).toContain("Permiso_Usuario");
        expect(thirdSql).toContain("pu.permiso = 'VIEW'");
    });
});

describe("HU-025: filtro por palabra clave (_applyCommonFilters)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPoolQuery
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);
    });

    test("incluye búsqueda en título, código, categoría, unidad, contenido y metadatos", async () => {
        await consultaAprobadosRepo.searchInternal({
            userId: 10,
            unidadId: 3,
            isMaster: false,
            filters: { q: "enero" },
        });

        const sqlCount = String(mockPoolQuery.mock.calls[0][0]);
        expect(sqlCount).toContain("d.contenido");
        expect(sqlCount).toContain("Metadato");
        expect(mockPoolQuery.mock.calls[0][1]).toEqual(
            expect.arrayContaining([expect.stringContaining("%enero%")]),
        );
    });
});
