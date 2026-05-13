// __tests__/bitacoraPermisosRepo.test.mjs
import { jest } from "@jest/globals";

const executeMock = jest.fn(async () => [[], []]);

await jest.unstable_mockModule("../../src/db/pool.js", () => ({
    pool: { execute: executeMock },
}));

const { bitacoraPermisosRepo } = await import("../../src/repositories/bitacoraPermisosRepo.js");

describe("bitacoraPermisosRepo.log resultado EXCEPCION_ACCESO", () => {
    beforeEach(() => {
        executeMock.mockClear();
    });

    test("APPLY APROBADA: ignora resultado viejo y guarda texto legible con permisos", async () => {
        await bitacoraPermisosRepo.log({
            actorUserId: 10,
            targetDocId: 27,
            permiso: "EDIT,SIGN,VIEW",
            accion: "EXCEPTION_APPLY",
            motive: "LKJLJK",
            scope: "documento",
            target_usuario_id: 17,
            responsable_id: 10,
            tipo_flujo: "EXCEPCION_ACCESO",
            estado_flujo: "APROBADA",
            justificacion: "LKJLJK",
            resultado: "motivo:viejo; alcance:documento",
        });

        const inserted = executeMock.mock.calls[0][1];
        const resultadoCol = inserted[2];
        expect(resultadoCol).toBe(
            "Permisos EDIT, SIGN, VIEW asignados al usuario con ID 17 para el documento con ID 27."
        );
    });

    test("REMOVE REVOCADA: resultado legible aunque motive sea antiguo", async () => {
        await bitacoraPermisosRepo.log({
            actorUserId: 10,
            targetDocId: 30,
            permiso: "REVOCADA",
            accion: "EXCEPTION_REMOVE",
            motive: "remoción por admin",
            scope: "documento",
            target_usuario_id: 10,
            responsable_id: 10,
            tipo_flujo: "EXCEPCION_ACCESO",
            estado_flujo: "REVOCADA",
            justificacion: "remoción por admin",
            resultado: "motivo:remoción por admin; alcance:documento",
        });

        const inserted = executeMock.mock.calls[0][1];
        expect(inserted[2]).toBe(
            "Permisos de excepción revocados al usuario con ID 10 para el documento con ID 30."
        );
    });
});
