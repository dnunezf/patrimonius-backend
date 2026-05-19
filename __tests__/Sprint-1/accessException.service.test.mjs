// __tests__/accessException.service.test.mjs
import { jest } from "@jest/globals";

await jest.unstable_mockModule("../../src/repositories/permissionExceptionRepo.js", () => ({
    permissionExceptionRepo: {
        upsert: jest.fn(async () => {}),
        list: jest.fn(async () => []),
        remove: jest.fn(async () => {}),
    },
}));

await jest.unstable_mockModule("../../src/repositories/bitacoraPermisosRepo.js", () => ({
    bitacoraPermisosRepo: {
        log: jest.fn(async () => {}),
        findLastSolicitudIdExcepcion: jest.fn(async () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    },
}));

await jest.unstable_mockModule("../../src/repositories/documentoRepo.js", () => ({
    documentoRepo: {
        findById: jest.fn(async (id) => {
            if (id === 2) {
                return {
                    titulo: "Documento prueba",
                    numero_serie: "2026-001",
                    estado: "EDICION",
                };
            }
            if (id === 3) {
                return {
                    titulo: "Doc archivado",
                    numero_serie: "A-1",
                    estado: "ARCHIVADO",
                };
            }
            return null;
        }),
    },
}));

const { permissionExceptionRepo } = await import("../../src/repositories/permissionExceptionRepo.js");
const { bitacoraPermisosRepo } = await import("../../src/repositories/bitacoraPermisosRepo.js");
const { accessExceptionService } = await import("../../src/services/accessException.service.js");

const mockReq = { headers: { "user-agent": "jest-test" } };

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

    test("rechaza cualquier excepción si el documento no está en Creación o Edición (p. ej. archivado)", async () => {
        await expect(
            accessExceptionService.apply(
                {
                    userId: 1,
                    documentId: 3,
                    permissions: ["VIEW"],
                    reason: "no debe",
                },
                { id: 99 },
                mockReq
            )
        ).rejects.toMatchObject({ code: 400 });
        expect(permissionExceptionRepo.upsert).not.toHaveBeenCalled();

        await expect(
            accessExceptionService.apply(
                {
                    userId: 1,
                    documentId: 3,
                    permissions: ["EDIT", "VIEW"],
                    reason: "no debe",
                },
                { id: 99 },
                mockReq
            )
        ).rejects.toMatchObject({ code: 400 });
    });

    test("normaliza permisos, hace upsert y escribe una fila en bitácora (CSV)", async () => {
        const res = await accessExceptionService.apply(
            {
                userId: 1,
                documentId: 2,
                permissions: ["VIEW", "X", "EDIT", "VIEW"], // inválidos y duplicados
                reason: "justificación A",
            },
            { id: 99 },
            mockReq
        );

        expect(permissionExceptionRepo.upsert).toHaveBeenCalledWith(1, 2, ["EDIT", "VIEW"], "justificación A");
        expect(bitacoraPermisosRepo.log).toHaveBeenCalledTimes(1);
        expect(bitacoraPermisosRepo.log).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "EXCEPTION_APPLY",
                permiso: "EDIT,VIEW",
                tipo_flujo: "EXCEPCION_ACCESO",
                estado_flujo: "APROBADA",
                solicitud_id: expect.any(String),
                target_usuario_id: 1,
                responsable_id: 99,
                justificacion: "justificación A",
                fecha_fin_acceso: null,
                user_agent: "jest-test",
                detalle: {
                    documento_titulo: "Documento prueba",
                    documento_codigo_unico: "2026-001",
                },
            })
        );

        expect(res.userId).toBe(1);
        expect(res.documentId).toBe(2);
        expect(res.permissions).toEqual(["EDIT", "VIEW"]);
        expect(res.solicitud_id).toEqual(expect.any(String));
        expect(res.solicitud_id).toBe(bitacoraPermisosRepo.log.mock.calls[0][0].solicitud_id);
    });

    test("permissions vacíos: aún registra un APPLY con VIEW (huella)", async () => {
        bitacoraPermisosRepo.log.mockClear();
        await accessExceptionService.apply(
            {
                userId: 1,
                documentId: 2,
                permissions: [],
                reason: "limpieza",
            },
            { id: 50 },
            mockReq
        );

        expect(permissionExceptionRepo.upsert).toHaveBeenCalledWith(1, 2, [], "limpieza");
        expect(bitacoraPermisosRepo.log).toHaveBeenCalledTimes(1);
        expect(bitacoraPermisosRepo.log).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "EXCEPTION_APPLY",
                permiso: "VIEW",
                estado_flujo: "APROBADA",
                motive: "limpieza",
                solicitud_id: expect.any(String),
                detalle: {
                    documento_titulo: "Documento prueba",
                    documento_codigo_unico: "2026-001",
                },
            })
        );
    });
});

describe("accessExceptionService.remove", () => {
    test("borra permisos y registra EXCEPTION_REMOVE con REVOCADA y mismo solicitud_id que la última APROBADA", async () => {
        bitacoraPermisosRepo.log.mockClear();

        await accessExceptionService.remove({ userId: 1, documentId: 2, reason: "revocado" }, { id: 77 }, mockReq);

        expect(bitacoraPermisosRepo.findLastSolicitudIdExcepcion).toHaveBeenCalledWith({
            targetUsuarioId: 1,
            documentoId: 2,
        });
        expect(permissionExceptionRepo.remove).toHaveBeenCalledWith(1, 2);
        expect(bitacoraPermisosRepo.log).toHaveBeenCalledTimes(1);
        expect(bitacoraPermisosRepo.log).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "EXCEPTION_REMOVE",
                permiso: "REVOCADA",
                estado_flujo: "REVOCADA",
                motive: "revocado",
                tipo_flujo: "EXCEPCION_ACCESO",
                solicitud_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                fecha_inicio_acceso: null,
                user_agent: "jest-test",
                detalle: {
                    documento_titulo: "Documento prueba",
                    documento_codigo_unico: "2026-001",
                },
            })
        );
    });
});
