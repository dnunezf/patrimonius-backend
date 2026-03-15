// __tests__/controlAcceso.service.test.mjs
import { jest } from "@jest/globals";

// Mock pool para que el servicio no use la BD real
await jest.unstable_mockModule("../src/db/pool.js", () => ({
    pool: {
        execute: jest.fn(async (sql) => {
            const text = String(sql);
            if (text.includes("FROM Usuario_Rol")) {
                return [[]]; // sin roles adicionales
            }
            if (text.includes("FROM Unidad_Organizacional")) {
                return [[{ nombre: "DG" }]];
            }
            if (text.includes("FROM Rol")) {
                return [[{ nombre: "ADMINISTRADOR" }]];
            }
            if (text.includes("FROM INFORMATION_SCHEMA.COLUMNS")) {
                // fuerza fallback_true en resolveUserCaps
                return [[{ cnt: 0 }]];
            }
            return [[[]]];
        }),
    },
}));

// Mock del repo para no tocar la implementación real de listPaged
const mockPaged = {
    items: [
        {
            id: 1,
            code: "2023-001",
            title: "Acta",
            status: "EDICION",
            ownerId: 99,
            unitId: 1,
            unit: "DG",
            categoria: "General",
            created_at: new Date(),
            canView: true,
            canEdit: true,
            canSign: false,
        },
    ],
    totalItems: 1,
    totalPages: 1,
    page: 1,
    pageSize: 10,
    accessibleCount: 1,
};

await jest.unstable_mockModule("../src/repositories/controlAcceso.repository.js", () => ({
    controlAccesoRepo: {
        listPaged: jest.fn(async () => mockPaged),
    },
}));

const { getAccessControl } = await import("../src/services/controlAcceso.service.js");

afterEach(() => jest.clearAllMocks());

describe("controlAcceso.service.getAccessControl", () => {
    test("retorna resumen de acceso con documentos paginados", async () => {
        const user = { id: 99, email: "test@user", unidadId: 1, rolId: 1, role: "ADMIN" };
        const result = await getAccessControl(user, { page: 1, pageSize: 10 });

        expect(result.user).toEqual(
            expect.objectContaining({
                id: 99,
                email: "test@user",
                unidad: "DG",
                unidadId: 1,
                roles: ["ADMINISTRADOR"],
            })
        );
        expect(result.documents).toHaveLength(1);
        expect(result.accessibleCount).toBe(1);
    });

    test("lanza error si el usuario no tiene id, unidad o rol", async () => {
        await expect(getAccessControl({ id: 1, email: "bad@user" }))
            .rejects.toThrow("Usuario no tiene id, unidad o rol asignado en el token");
    });
});
