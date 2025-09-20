// __tests__/accessException.service.test.mjs
import { jest } from "@jest/globals";

await jest.unstable_mockModule("../src/repositories/permissionExceptionRepo.js", () => ({
    permissionExceptionRepo: {
        upsert: jest.fn(async () => {}),
        list: jest.fn(async () => []),
        remove: jest.fn(async () => {})
    }
}));

await jest.unstable_mockModule("../src/repositories/bitacoraPermisosRepo.js", () => ({
    bitacoraPermisosRepo: {
        log: jest.fn(async () => {})
    }
}));

const { permissionExceptionRepo } = await import("../src/repositories/permissionExceptionRepo.js");
const { bitacoraPermisosRepo } = await import("../src/repositories/bitacoraPermisosRepo.js");
const { accessExceptionService } = await import("../src/services/accessException.service.js");

describe("accessExceptionService.apply (HU-005)", () => {
    test("falla con 400 si faltan userId/documentId", async () => {
        await expect(
            accessExceptionService.apply({ userId: null, documentId: 1, permissions: ["VIEW"], reason: "ok" }, { id: 9 })
        ).rejects.toMatchObject({ code: 400 });

        await expect(
            accessExceptionService.apply({ userId: 1, documentId: null, permissions: ["VIEW"], reason: "ok" }, { id: 9 })
        ).rejects.toMatchObject({ code: 400 });
    });

    test("falla con 400 si reason vacío", async () => {
        await expect(
            accessExceptionService.apply({ userId: 1, documentId: 2, permissions: ["VIEW"], reason: "   " }, { id: 9 })
        ).rejects.toMatchObject({ code: 400 });
    });

    test("normaliza permisos, hace upsert y escribe bitácora", async () => {
        const res = await accessExceptionService.apply({
            userId: 1,
            documentId: 2,
            permissions: ["VIEW", "X", "EDIT", "VIEW"], // inválidos y duplicados
            reason: "justificación A"
        }, { id: 99 });

        expect(permissionExceptionRepo.upsert).toHaveBeenCalledWith(1, 2, ["VIEW", "EDIT"], "justificación A");
        // bitácora: una fila por permiso
        expect(bitacoraPermisosRepo.log).toHaveBeenCalledTimes(2);
        const permisosLog = new Set(
            Array.from({length: bitacoraPermisosRepo.log.mock.calls.length})
                .map((_,i)=> bitacoraPermisosRepo.log.mock.calls[i][0].permiso)
        );
        expect(permisosLog).toEqual(new Set(["VIEW","EDIT"]));

        expect(res).toEqual({ userId: 1, documentId: 2, permissions: ["VIEW","EDIT"] });
    });

    test("permissions vacíos: aún registra un APPLY con VIEW (huella)", async () => {
        bitacoraPermisosRepo.log.mockClear();
        await accessExceptionService.apply({
            userId: 1, documentId: 2, permissions: [], reason: "limpieza"
        }, { id: 50 });

        expect(permissionExceptionRepo.upsert).toHaveBeenCalledWith(1, 2, [], "limpieza");
        expect(bitacoraPermisosRepo.log).toHaveBeenCalledTimes(1);
        expect(bitacoraPermisosRepo.log).toHaveBeenCalledWith(expect.objectContaining({
            accion: "EXCEPTION_APPLY", permiso: "VIEW", motive: "limpieza"
        }));
    });
});

describe("accessExceptionService.remove", () => {
    test("borra permisos y registra EXCEPTION_REMOVE", async () => {
        bitacoraPermisosRepo.log.mockClear();

        await accessExceptionService.remove({ userId: 1, documentId: 2, reason: "revocado" }, { id: 77 });

        expect(permissionExceptionRepo.remove).toHaveBeenCalledWith(1, 2);
        expect(bitacoraPermisosRepo.log).toHaveBeenCalledTimes(1);
        expect(bitacoraPermisosRepo.log).toHaveBeenCalledWith(expect.objectContaining({
            accion: "EXCEPTION_REMOVE", permiso: "VIEW", motive: "revocado"
        }));
    });
});
