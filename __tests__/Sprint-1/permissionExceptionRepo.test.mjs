// __tests__/permissionExceptionRepo.test.mjs
import { jest } from "@jest/globals";

const mockConn = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn(),
};
const mockPool = {
    getConnection: jest.fn(async () => mockConn),
    query: jest.fn(async () => [[]]),
};

await jest.unstable_mockModule("../../src/db/pool.js", () => ({ pool: mockPool }));
const { permissionExceptionRepo } = await import("../../src/repositories/permissionExceptionRepo.js");

afterEach(() => {
    jest.clearAllMocks();
    mockConn.beginTransaction.mockReset();
    mockConn.commit.mockReset();
    mockConn.rollback.mockReset();
    mockConn.release.mockReset();
    mockConn.query.mockReset();
    mockPool.query.mockReset();
});

describe("permissionExceptionRepo.upsert", () => {
    test("borra previos e inserta en bulk", async () => {
        await permissionExceptionRepo.upsert(1, 10, ["VIEW", "EDIT"], "motivo X");

        expect(mockConn.beginTransaction).toHaveBeenCalled();

        // Primera llamada: DELETE existente
        const [deleteSql, deleteArgs] = mockConn.query.mock.calls[0];
        expect(deleteSql).toEqual(expect.stringContaining("DELETE FROM Permiso_Usuario"));
        expect(deleteArgs).toEqual([1, 10]);

        // Segunda llamada: INSERT bulk
        const [insertSql, insertArgs] = mockConn.query.mock.calls[1];
        expect(insertSql).toEqual(expect.stringContaining("INSERT INTO Permiso_Usuario"));
        // El repositorio actual pasa el arreglo envuelto en otro arreglo
        expect(Array.isArray(insertArgs)).toBe(true);
        expect(insertArgs[0]).toEqual([
            [1, 10, "VIEW", "motivo X"],
            [1, 10, "EDIT", "motivo X"],
        ]);

        expect(mockConn.commit).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();
    });

    test("sin permisos: solo DELETE y commit", async () => {
        await permissionExceptionRepo.upsert(2, 20, [], "m");

        expect(mockConn.query).toHaveBeenCalledTimes(1);
        const [deleteSql, deleteArgs] = mockConn.query.mock.calls[0];
        expect(deleteSql).toEqual(expect.stringContaining("DELETE FROM Permiso_Usuario"));
        expect(deleteArgs).toEqual([2, 20]);
        expect(mockConn.commit).toHaveBeenCalled();
    });
});

describe("permissionExceptionRepo.listPaged", () => {
    test("retorna estructura paginada desde SELECT", async () => {
        // 1a llamada: COUNT(*)
        mockPool.query.mockResolvedValueOnce([[{ total: 1 }]]);

        // 2a llamada: filas de items
        mockPool.query.mockResolvedValueOnce([[
            {
                userId: 1,
                documentId: 10,
                user: "Ana J M",
                email: "a@m.cr",
                titulo: "Acta",
                numero_serie: "2023-001",
                categoria: "Informe",
                estado: "EDICION",
                permissions: "EDIT,VIEW",
                motive: "m1",
                created_at: "2025-01-01 10:00:00",
            },
        ]]);

        const out = await permissionExceptionRepo.listPaged({ page: 1, pageSize: 10 });

        expect(out.totalItems).toBe(1);
        expect(out.totalPages).toBe(1);
        expect(out.items).toHaveLength(1);
        expect(out.items[0].userId).toBe(1);
        expect(out.items[0].permissions).toBe("EDIT,VIEW");
    });
});

describe("permissionExceptionRepo.remove", () => {
    test("DELETE por dupla (user,doc)", async () => {
        await permissionExceptionRepo.remove(3, 30);

        const [sql, args] = mockPool.query.mock.calls[0];
        expect(sql).toEqual(expect.stringContaining("DELETE FROM Permiso_Usuario"));
        expect(args).toEqual([3, 30]);
    });
});
