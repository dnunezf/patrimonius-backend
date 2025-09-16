// __tests__/controlAcceso.repository.test.mjs
import { jest } from "@jest/globals";

// Mock pool antes de importarlo
await jest.unstable_mockModule("../src/db/pool.js", () => ({
    pool: { execute: jest.fn() },
}));

const { pool } = await import("../src/db/pool.js");
const { getDocumentsByUnit } = await import("../src/repositories/controlAcceso.repository.js");

afterEach(() => jest.clearAllMocks());

describe("controlAcceso.repository.getDocumentsByUnit", () => {
    test("devuelve documentos con flags según unidad", async () => {
        pool.execute.mockResolvedValue([
            [
                { code: "2023-001", title: "Acta", unit: "DG", status: "EDICION", unitId: 1 },
                { code: "2023-002", title: "Informe", unit: "DG", status: "ARCHIVADO", unitId: 2 },
                { code: "2023-003", title: "Protocolo", unit: "DG", status: "FIRMA", unitId: 1 },
            ],
        ]);

        const result = await getDocumentsByUnit(1);

        expect(result).toEqual([
            { code: "2023-001", title: "Acta", unit: "DG", status: "EDICION", unitId: 1,
                canView: true, canEdit: true, canSign: false },
            { code: "2023-002", title: "Informe", unit: "DG", status: "ARCHIVADO", unitId: 2,
                canView: false, canEdit: false, canSign: false },
            { code: "2023-003", title: "Protocolo", unit: "DG", status: "FIRMA", unitId: 1,
                canView: true, canEdit: true, canSign: true },
        ]);
    });
});
