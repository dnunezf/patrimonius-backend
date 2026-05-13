import { jest } from "@jest/globals";

const mockPoolQuery = jest.fn();

await jest.unstable_mockModule("../../src/db/pool.js", () => ({
    pool: { query: (...a) => mockPoolQuery(...a) },
}));

const { default: expedienteRepo } = await import(
    "../../src/repositories/expedienteRepo.js"
    );

describe("HU-022: expedienteRepo", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("getByFilters arma SQL con joins archivísticos y filtros básicos", async () => {
        mockPoolQuery.mockResolvedValueOnce([[]]);

        await expedienteRepo.getByFilters({
            unidad_id: 1,
            serie_id: 2,
            subserie_id: 3,
            estado: "ACTIVO",
        });

        expect(mockPoolQuery).toHaveBeenCalledTimes(1);

        const sql = String(mockPoolQuery.mock.calls[0][0]);
        const params = mockPoolQuery.mock.calls[0][1];

        expect(sql).toContain("FROM Expediente e");
        expect(sql).toContain("INNER JOIN Unidad_Organizacional u ON u.id = e.unidad_id");
        expect(sql).toContain("INNER JOIN Serie s ON s.id = e.serie_id");
        expect(sql).toContain("LEFT JOIN Subserie ss ON ss.id = e.subserie_id");

        expect(sql).toContain("e.unidad_id = ?");
        expect(sql).toContain("e.serie_id = ?");
        expect(sql).toContain("e.subserie_id = ?");
        expect(sql).toContain("UPPER(TRIM(e.estado)) = UPPER(TRIM(?))");
        expect(sql).toContain("e.fecha_cierre IS NULL");

        expect(sql).toContain("u.nombre AS unidad_nombre");
        expect(sql).toContain("s.nombre AS serie_nombre");
        expect(sql).toContain("ss.nombre AS subserie_nombre");

        expect(params).toEqual([1, 2, 3, "ACTIVO"]);
    });

    test("getByFilters no agrega filtro de subserie si viene vacío", async () => {
        mockPoolQuery.mockResolvedValueOnce([[]]);

        await expedienteRepo.getByFilters({
            unidad_id: 1,
            serie_id: 2,
            subserie_id: "",
            estado: "ACTIVO",
        });

        const sql = String(mockPoolQuery.mock.calls[0][0]);
        const params = mockPoolQuery.mock.calls[0][1];

        expect(sql).not.toContain("e.subserie_id = ?");
        expect(sql).toContain("UPPER(TRIM(e.estado)) = UPPER(TRIM(?))");
        expect(sql).toContain("e.fecha_cierre IS NULL");
        expect(params).toEqual([1, 2, "ACTIVO"]);
    });

    test("getAll incluye campos archivísticos y ordena por fecha_creacion DESC", async () => {
        mockPoolQuery.mockResolvedValueOnce([[]]);

        await expedienteRepo.getAll();

        const sql = String(mockPoolQuery.mock.calls[0][0]);

        expect(sql).toContain("fecha_inicio_vigencia");
        expect(sql).toContain("fecha_vencimiento");
        expect(sql).toContain("unidad_nombre");
        expect(sql).toContain("serie_nombre");
        expect(sql).toContain("subserie_nombre");
        expect(sql).toMatch(/ORDER BY\s+e\.fecha_creacion\s+DESC/i);
    });

    test("searchAccessInternal filtra por unidad si no es master", async () => {
        mockPoolQuery
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        await expedienteRepo.searchAccessInternal({
            userId: 10,
            unidadId: 7,
            isMaster: false,
            codigo: "",
            nombre: "",
            serieId: "",
            subserieId: "",
            q: "",
            page: 1,
            pageSize: 10,
        });

        const countSql = String(mockPoolQuery.mock.calls[0][0]);
        const countParams = mockPoolQuery.mock.calls[0][1];

        expect(countSql).toContain("SELECT 1 FROM Documento d");
        expect(countSql).toContain("d.expediente_id = e.id AND d.unidad_id = ?");
        expect(countParams).toEqual(expect.arrayContaining([7]));
    });

    test("searchAccessInternal no filtra por unidad si isMaster=true", async () => {
        mockPoolQuery
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        await expedienteRepo.searchAccessInternal({
            userId: 1,
            unidadId: null,
            isMaster: true,
            codigo: "",
            nombre: "",
            serieId: "",
            subserieId: "",
            q: "",
            page: 1,
            pageSize: 10,
        });

        const countSql = String(mockPoolQuery.mock.calls[0][0]);
        expect(countSql).not.toContain("d.unidad_id = ?");
    });

    test("searchAccessInternal aplica filtros de serie, subserie y rango de fechas", async () => {
        mockPoolQuery
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        await expedienteRepo.searchAccessInternal({
            userId: 10,
            unidadId: 7,
            isMaster: false,
            serieId: "4",
            subserieId: "6",
            dateFrom: "2026-01-01",
            dateTo: "2026-12-31",
            page: 1,
            pageSize: 10,
        });

        const countSql = String(mockPoolQuery.mock.calls[0][0]);
        const params = mockPoolQuery.mock.calls[0][1];

        expect(countSql).toContain("e.serie_id = ?");
        expect(countSql).toContain("e.subserie_id = ?");
        expect(countSql).toContain("DATE(e.fecha_creacion) >= ?");
        expect(countSql).toContain("DATE(e.fecha_creacion) <= ?");

        expect(params).toEqual(
            expect.arrayContaining([7, 4, 6, "2026-01-01", "2026-12-31"]),
        );
    });
});