import { jest } from "@jest/globals";

/**
 * HU-031: Seguimiento de conservación y disposición documental.
 * Alertas al alcanzar vencimiento (notificación in-app + correo cuando el plazo ya venció).
 * Sin base de datos: repos y correo mockeados (mismo patrón que notificacion.service.hu014.test.mjs).
 */

const mockGestionPlazosRepo = {
    listExpedientesCerradosVencimientoPasado: jest.fn(),
};

const mockUserRepo = {
    findArchivistaUsers: jest.fn(),
};

const mockExpedienteRepo = {
    findMinDocumentoIdByExpedienteId: jest.fn(),
};

const mockNotificacionRepo = {
    createNotificacion: jest.fn(),
    existsNotificacionExpedienteConservacionVencido: jest.fn(),
};

const mockEntregaRepo = {
    createForNotificacion: jest.fn(async () => {}),
    markEnviada: jest.fn(async () => {}),
    markFallida: jest.fn(async () => {}),
};

const mockSendEmail = jest.fn(async () => ({ messageId: "test-msg" }));
const mockLogAdminAction = jest.fn(async () => {});

let notifSeq = 7000;

await jest.unstable_mockModule("../../src/repositories/gestionPlazosRepo.js", () => ({
    gestionPlazosRepo: mockGestionPlazosRepo,
}));

await jest.unstable_mockModule("../../src/repositories/userRepo.js", () => ({
    userRepo: mockUserRepo,
}));

await jest.unstable_mockModule("../../src/repositories/expedienteRepo.js", () => ({
    default: mockExpedienteRepo,
}));

await jest.unstable_mockModule("../../src/repositories/notificacionRepo.js", () => ({
    notificacionRepo: mockNotificacionRepo,
}));

await jest.unstable_mockModule("../../src/repositories/notificacionEntregaRepo.js", () => ({
    notificacionEntregaRepo: mockEntregaRepo,
}));

await jest.unstable_mockModule("../../src/utils/mailer.js", () => ({
    sendEmail: mockSendEmail,
}));

await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
    logAdminAction: mockLogAdminAction,
}));

process.env.FRONTEND_URL = "https://patrimonius.test/";

const { notificacionService } = await import("../../src/services/notificacion.service.js");

describe("HU-031 — alertas de vencimiento de conservación (notifyExpedientesConservacionVencidosPasados)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        notifSeq = 7000;
        mockNotificacionRepo.createNotificacion.mockImplementation(async (data) => {
            notifSeq += 1;
            return { id: notifSeq, ...data };
        });
        mockNotificacionRepo.existsNotificacionExpedienteConservacionVencido.mockResolvedValue(false);
    });

    test("HU-031: sin expedientes con vencimiento cumplido no crea notificaciones ni envía correos", async () => {
        mockGestionPlazosRepo.listExpedientesCerradosVencimientoPasado.mockResolvedValueOnce([]);

        const out = await notificacionService.notifyExpedientesConservacionVencidosPasados();

        expect(out).toMatchObject({
            ok: true,
            expedientesEvaluados: 0,
            notificacionesCreadas: 0,
            skipped: true,
            reason: "sin_expedientes_vencidos",
        });
        expect(mockUserRepo.findArchivistaUsers).not.toHaveBeenCalled();
        expect(mockNotificacionRepo.createNotificacion).not.toHaveBeenCalled();
        expect(mockSendEmail).not.toHaveBeenCalled();
    });

    test("HU-031: expediente archivado con plazo vencido notifica a archivista (in-app + correo) con tipo EXPEDIENTE_CONSERVACION_VENCIDO", async () => {
        mockGestionPlazosRepo.listExpedientesCerradosVencimientoPasado.mockResolvedValueOnce([
            {
                id: 101,
                codigo: "EXP-HU031",
                nombre: "Expediente conservación prueba",
                estado: "CERRADO",
                fecha_vencimiento: "2026-04-10T00:00:00.000Z",
            },
        ]);
        mockUserRepo.findArchivistaUsers.mockResolvedValueOnce([
            { id: 55, email: "archivista.hu031@test.cr", nombre: "María", apellido1: "Pérez" },
        ]);
        mockExpedienteRepo.findMinDocumentoIdByExpedienteId.mockResolvedValue(9001);

        const out = await notificacionService.notifyExpedientesConservacionVencidosPasados();

        expect(out).toMatchObject({
            ok: true,
            expedientesEvaluados: 1,
            notificacionesCreadas: 1,
            archivistas: 1,
        });

        expect(mockExpedienteRepo.findMinDocumentoIdByExpedienteId).toHaveBeenCalledWith(101);
        expect(mockNotificacionRepo.createNotificacion).toHaveBeenCalledTimes(1);
        const payload = mockNotificacionRepo.createNotificacion.mock.calls[0][0];
        expect(payload.tipo).toBe("EXPEDIENTE_CONSERVACION_VENCIDO");
        expect(payload.usuarioId).toBe(55);
        expect(payload.documentoId).toBe(9001);
        expect(String(payload.enlaceDirecto || "")).toContain("expVencId=101");
        expect(String(payload.resultado || "")).toContain("EXP-HU031");

        expect(mockEntregaRepo.createForNotificacion).toHaveBeenCalled();
        expect(mockEntregaRepo.markEnviada).toHaveBeenCalledWith(
            expect.objectContaining({ canal: "IN_APP" })
        );
        expect(mockSendEmail).toHaveBeenCalledTimes(1);
        const [to, subject, body] = mockSendEmail.mock.calls[0];
        expect(to).toBe("archivista.hu031@test.cr");
        expect(subject).toMatch(/plazo de conservación vencido/i);
        expect(body).toContain("EXP-HU031");
        expect(mockEntregaRepo.markEnviada).toHaveBeenCalledWith(
            expect.objectContaining({ canal: "EMAIL" })
        );
    });
});
