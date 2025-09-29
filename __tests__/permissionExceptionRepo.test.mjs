// __tests__/permissionExceptionRepo.test.mjs
import { jest } from "@jest/globals";

const mockConn = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    execute: jest.fn(),
    query: jest.fn()
};
const mockPool = {
    getConnection: jest.fn(async () => mockConn),
    query: jest.fn(async () => [[]]),
    execute: jest.fn(async () => [[], []])
};

await jest.unstable_mockModule("../src/db/pool.js", () => ({ pool: mockPool }));
const { permissionExceptionRepo } = await import("../src/repositories/permissionExceptionRepo.js");

afterEach(() => jest.clearAllMocks());

describe("permissionExceptionRepo.upsert", () => {
    test("borra previos e inserta en bulk", async () => {
        mockConn.query.mockResolvedValue([{}, {}]); // para el INSERT
        await permissionExceptionRepo.upsert(1, 10, ["VIEW", "EDIT"], "motivo X");

        expect(mockConn.beginTransaction).toHaveBeenCalled();
        expect(mockConn.execute).toHaveBeenCalledWith(
            "DELETE FROM Permiso_Usuario WHERE usuario_id=? AND documento_id=?",
            [1, 10]
        );
        expect(mockConn.query).toHaveBeenCalledWith(
            "INSERT INTO Permiso_Usuario (usuario_id, permiso, documento_id,motive) VALUES ?",
            [[[1, "VIEW", 10, "motivo X"], [1, "EDIT", 10, "motivo X"]]]
        );
        expect(mockConn.commit).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();
    });

    test("sin permisos: solo DELETE y commit", async () => {
        await permissionExceptionRepo.upsert(2, 20, [], "m");
        expect(mockConn.execute).toHaveBeenCalledWith(
            "DELETE FROM Permiso_Usuario WHERE usuario_id=? AND documento_id=?",
            [2, 20]
        );
        expect(mockConn.query).not.toHaveBeenCalled(); // no hay insert
    });
});

describe("permissionExceptionRepo.list", () => {
    test("retorna filas mapeadas desde SELECT", async () => {
        mockPool.query.mockResolvedValueOnce([[
            {
                userId: 1, nombre: "Ana", apellido1: "J", apellido2: "M",
                email: "a@m.cr", documentId: 10, titulo: "Acta",
                numero_serie: "2023-001", permissions: "EDIT,VIEW", motive: "m1"
            }
        ]]);
        const rows = await permissionExceptionRepo.list();
        expect(Array.isArray(rows)).toBe(true);
        expect(rows[0].userId).toBe(1);
        expect(rows[0].permissions).toBe("EDIT,VIEW");
    });
});

describe("permissionExceptionRepo.remove", () => {
    test("DELETE por dupla (user,doc)", async () => {
        await permissionExceptionRepo.remove(3, 30);
        expect(mockPool.execute).toHaveBeenCalledWith(
            "DELETE FROM Permiso_Usuario WHERE usuario_id=? AND documento_id=?",
            [3, 30]
        );
    });
});
