// __tests__/controlAcceso.repository.test.mjs
import { jest } from "@jest/globals";

await jest.unstable_mockModule("../src/db/pool.js", () => ({
    pool: { execute: jest.fn() },
}));

const { pool } = await import("../src/db/pool.js");
const { getDocumentsByUnit } = await import("../src/repositories/controlAcceso.repository.js");

afterEach(() => jest.clearAllMocks());

describe("controlAcceso.repository.getDocumentsByUnit", () => {
    test("devuelve documentos con flags según unidad, usuario y rol", async () => {
        pool.execute
            // 1. Documentos
            .mockResolvedValueOnce([
                [
                    { id: 1, code: "2023-001", title: "Acta", unit: "DG", status: "EDICION", unitId: 1 },
                    { id: 2, code: "2023-002", title: "Informe", unit: "DG", status: "ARCHIVADO", unitId: 2 },
                    { id: 3, code: "2023-003", title: "Protocolo", unit: "DG", status: "FIRMA", unitId: 1 },
                ],
            ])
            // 2. Permiso_Usuario (vacío en este test)
            .mockResolvedValueOnce([[]])
            // 3. Documento_Allowed_User (para userId = 99)
            .mockResolvedValueOnce([
                [
                    { documento_id: 1, actions: "VIEW,EDIT" },
                    { documento_id: 3, actions: "VIEW,EDIT,SIGN" },
                ],
            ])
            // 4. Documento_Allowed_Rol (vacío en este test)
            .mockResolvedValueOnce([[]]);

        const result = await getDocumentsByUnit(99, 1, 1);

        expect(result).toEqual([
            {
                id: 1,
                code: "2023-001",
                title: "Acta",
                unit: "DG",
                status: "EDICION",
                unitId: 1,
                canView: true,
                canEdit: true,
                canSign: false,
            },
            {
                id: 2,
                code: "2023-002",
                title: "Informe",
                unit: "DG",
                status: "ARCHIVADO",
                unitId: 2,
                canView: false,
                canEdit: false,
                canSign: false,
            },
            {
                id: 3,
                code: "2023-003",
                title: "Protocolo",
                unit: "DG",
                status: "FIRMA",
                unitId: 1,
                canView: true,
                canEdit: true,
                canSign: true,
            },
        ]);
    });
});