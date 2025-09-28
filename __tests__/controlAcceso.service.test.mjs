// __tests__/controlAcceso.service.test.mjs
import { jest } from "@jest/globals";

await jest.unstable_mockModule("../src/repositories/controlAcceso.repository.js", () => ({
    getDocumentsByUnit: jest.fn(),
}));

const { getDocumentsByUnit } = await import("../src/repositories/controlAcceso.repository.js");
const { getAccessControl } = await import("../src/services/controlAcceso.service.js");

afterEach(() => jest.clearAllMocks());

describe("controlAcceso.service.getAccessControl", () => {
    test("retorna documentos accesibles si unidad coincide", async () => {
        getDocumentsByUnit.mockResolvedValue([
            { code: "2023-001", title: "Acta", unit: "DG", status: "EDICION", unitId: 1,
                canView: true, canEdit: true, canSign: false },
        ]);

        const user = {
            id: 99,
            email: "test@user",
            unidadId: 1,
            rolId: 1,
            role: "ADMIN"
        };
        const result = await getAccessControl(user);

        expect(result.user).toEqual(user);
        expect(result.documents).toHaveLength(1);
        expect(result.accessibleCount).toBe(1);
    });

    test("lanza error si el usuario no tiene unidadId", async () => {
        await expect(getAccessControl({ id: 1, email: "bad@user" }))
            .rejects.toThrow(/unidad|rol/);
    });
});