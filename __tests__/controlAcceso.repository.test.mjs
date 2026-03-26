// __tests__/controlAcceso.repository.test.mjs
import { jest } from "@jest/globals";

// Mock pool para no tocar MySQL real; usaremos query() porque es lo que usa listPaged
const mockQuery = jest.fn();

await jest.unstable_mockModule("../src/db/pool.js", () => ({
    pool: { query: mockQuery },
}));

const { controlAccesoRepo } = await import("../src/repositories/controlAcceso.repository.js");

afterEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
});

describe("controlAccesoRepo.listPaged", () => {
    test("mapea canView/canEdit/canSign según unidad y estado sin excepciones", async () => {
        // 1) COUNT(*)
        mockQuery.mockResolvedValueOnce([[{ total: 3 }]]);

        // 2) SELECT docs
        mockQuery.mockResolvedValueOnce([
            [
                { id: 1, code: "2023-001", title: "Acta", unit: "DG", status: "EDICION", unitId: 1, ownerId: 10 },
                { id: 2, code: "2023-002", title: "Informe", unit: "DG", status: "ARCHIVADO", unitId: 2, ownerId: 10 },
                { id: 3, code: "2023-003", title: "Protocolo", unit: "DG", status: "FIRMA", unitId: 1, ownerId: 10 },
            ],
        ]);

        // 3) Permiso_Usuario (sin excepciones)
        mockQuery.mockResolvedValueOnce([[]]);
        // 4) Documento_Allowed_User (sin excepciones)
        mockQuery.mockResolvedValueOnce([[]]);
        // 5) Documento_Allowed_Rol (sin excepciones)
        mockQuery.mockResolvedValueOnce([[]]);

        const { items, accessibleCount } = await controlAccesoRepo.listPaged({
            userId: 99,
            userUnitId: 1,
            roleIds: [],
            caps: { canEdit: true, canSign: true },
            page: 1,
            pageSize: 10,
        });

        expect(items).toEqual([
            {
                id: 1,
                code: "2023-001",
                title: "Acta",
                unit: "DG",
                status: "EDICION",
                unitId: 1,
                ownerId: 10,
                canView: true,
                canEdit: true,
                canSign: false,
                hasSign: true,
            },
            {
                id: 2,
                code: "2023-002",
                title: "Informe",
                unit: "DG",
                status: "ARCHIVADO",
                unitId: 2,
                ownerId: 10,
                canView: false,
                canEdit: false,
                canSign: false,
                hasSign: false,
            },
            {
                id: 3,
                code: "2023-003",
                title: "Protocolo",
                unit: "DG",
                status: "FIRMA",
                unitId: 1,
                ownerId: 10,
                canView: true,
                canEdit: true,
                canSign: true,
                hasSign: true,
            },
        ]);
        expect(accessibleCount).toBe(2);
    });
});
