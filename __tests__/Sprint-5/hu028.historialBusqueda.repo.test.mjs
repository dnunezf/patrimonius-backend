import { jest } from "@jest/globals";

const mockPoolQuery = jest.fn();

await jest.unstable_mockModule("../../src/db/pool.js", () => ({
    pool: { query: (...a) => mockPoolQuery(...a) },
}));

const { historialBusquedaRepo } = await import(
    "../../src/repositories/historialBusqueda.repo.js"
    );

describe("HU-028: Historial de búsqueda (repo)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("create inserta historial y serializa filtros a JSON", async () => {
        mockPoolQuery.mockResolvedValueOnce([{ insertId: 77 }]);

        const out = await historialBusquedaRepo.create({
            usuario_id: 5,
            texto_busqueda: "Documento 66",
            filtros: {
                vista: "documentos",
                codigo: "PLAN-MNCR-JA-001-2026",
                titulo: "Documento 66",
            },
        });

        expect(mockPoolQuery).toHaveBeenCalledWith(
            expect.stringContaining("INSERT INTO Historial_Busqueda"),
            [
                5,
                "Documento 66",
                JSON.stringify({
                    vista: "documentos",
                    codigo: "PLAN-MNCR-JA-001-2026",
                    titulo: "Documento 66",
                }),
            ],
        );

        expect(out).toEqual({
            id: 77,
            usuario_id: 5,
            texto_busqueda: "Documento 66",
            filtros: {
                vista: "documentos",
                codigo: "PLAN-MNCR-JA-001-2026",
                titulo: "Documento 66",
            },
        });
    });

    test("listByUsuario lista por usuario y parsea filtros JSON string", async () => {
        mockPoolQuery.mockResolvedValueOnce([
            [
                {
                    id: 10,
                    usuario_id: 5,
                    texto_busqueda: "Documento 66",
                    filtros: JSON.stringify({
                        vista: "documentos",
                        titulo: "Documento 66",
                    }),
                    fecha_consulta: "2026-05-04 12:00:00",
                },
            ],
        ]);

        const out = await historialBusquedaRepo.listByUsuario({
            usuario_id: 5,
            limit: 8,
        });

        expect(mockPoolQuery).toHaveBeenCalledWith(
            expect.stringContaining("FROM Historial_Busqueda"),
            [5, 8],
        );

        expect(out).toEqual([
            expect.objectContaining({
                id: 10,
                usuario_id: 5,
                texto_busqueda: "Documento 66",
                filtros: {
                    vista: "documentos",
                    titulo: "Documento 66",
                },
            }),
        ]);
    });

    test("listByUsuario limita el máximo a 50", async () => {
        mockPoolQuery.mockResolvedValueOnce([[]]);

        await historialBusquedaRepo.listByUsuario({
            usuario_id: 5,
            limit: 999,
        });

        expect(mockPoolQuery).toHaveBeenCalledWith(
            expect.any(String),
            [5, 50],
        );
    });

    test("clearByUsuario devuelve deletedCount", async () => {
        mockPoolQuery.mockResolvedValueOnce([{ affectedRows: 3 }]);

        const out = await historialBusquedaRepo.clearByUsuario({
            usuario_id: 5,
        });

        expect(mockPoolQuery).toHaveBeenCalledWith(
            "DELETE FROM Historial_Busqueda WHERE usuario_id = ?",
            [5],
        );
        expect(out).toEqual({ deletedCount: 3 });
    });

    test("deleteOne elimina solo la entrada del usuario", async () => {
        mockPoolQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const out = await historialBusquedaRepo.deleteOne({
            id: 17,
            usuario_id: 5,
        });

        expect(mockPoolQuery).toHaveBeenCalledWith(
            "DELETE FROM Historial_Busqueda WHERE id = ? AND usuario_id = ?",
            [17, 5],
        );
        expect(out).toEqual({ deletedCount: 1 });
    });

    test("listByUsuario devuelve filtros null si el JSON viene inválido", async () => {
        mockPoolQuery.mockResolvedValueOnce([
            [
                {
                    id: 10,
                    usuario_id: 5,
                    texto_busqueda: "x",
                    filtros: "{json-roto",
                    fecha_consulta: "2026-05-04 12:00:00",
                },
            ],
        ]);

        const out = await historialBusquedaRepo.listByUsuario({
            usuario_id: 5,
            limit: 10,
        });

        expect(out[0].filtros).toBeNull();
    });
});