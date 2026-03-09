import { jest } from "@jest/globals";

// Mocks de repos/correo usados por sendDailyEditDigestEmails
const mockEntregaRepo = {
    listPendingEmailEdits: jest.fn(async () => []),
    markEmailBatchSent: jest.fn(async () => {}),
    markFallida: jest.fn(async () => {}),
};
const mockSendEmail = jest.fn(async () => ({ messageId: "digest-id" }));

await jest.unstable_mockModule("../src/repositories/notificacionEntregaRepo.js", () => ({
    notificacionEntregaRepo: mockEntregaRepo,
}));
await jest.unstable_mockModule("../src/utils/mailer.js", () => ({
    sendEmail: mockSendEmail,
}));

const { notificacionService } = await import("../src/services/notificacion.service.js");

describe("HU-014 Digest periódico de tareas pendientes (sendDailyEditDigestEmails)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("HU-014 debe enviar un resumen por correo cuando hay ediciones pendientes agrupadas por usuario", async () => {
        mockEntregaRepo.listPendingEmailEdits.mockResolvedValueOnce([
            {
                notificacion_id: 1,
                destinatario_id: 10,
                destinatario_email: "editor@museo.cr",
                destinatario_nombre: "Ana",
                documento_id: 100,
                documento_titulo: "Acta 100",
                documento_numero_serie: "2026-001",
                fecha: "2026-03-09T07:30:00Z",
                enlace_directo: "https://front/editor/document/100/edit",
                resultado: "Editado por: Ana",
            },
            {
                notificacion_id: 2,
                destinatario_id: 10,
                destinatario_email: "editor@museo.cr",
                destinatario_nombre: "Ana",
                documento_id: 101,
                documento_titulo: "Informe 101",
                documento_numero_serie: "2026-002",
                fecha: "2026-03-09T07:45:00Z",
                enlace_directo: null,
                resultado: "Editado por: Carlos",
            },
        ]);

        const out = await notificacionService.sendDailyEditDigestEmails();

        expect(out).toEqual({ sent: 1 });
        expect(mockSendEmail).toHaveBeenCalledTimes(1);

        const [to, subject, body] = mockSendEmail.mock.calls[0];
        expect(to).toBe("editor@museo.cr");
        expect(subject).toMatch(/resumen de documentos editados/i);
        expect(body).toContain("Acta 100");
        expect(body).toContain("Informe 101");
        expect(body).toContain("Editado por");
        expect(body).toContain("Enlace");

        // Debe marcar las notificaciones del batch correcto como ENVIADA
        expect(mockEntregaRepo.markEmailBatchSent).toHaveBeenCalledWith([1, 2]);
    });

    test("HU-014 no debe enviar notificación vacía cuando no hay pendientes", async () => {
        mockEntregaRepo.listPendingEmailEdits.mockResolvedValueOnce([]);

        const out = await notificacionService.sendDailyEditDigestEmails();

        expect(out).toEqual({ sent: 0 });
        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(mockEntregaRepo.markEmailBatchSent).not.toHaveBeenCalled();
    });

    test("HU-014 debe marcar entregas como FALLIDAS si el correo falla", async () => {
        mockEntregaRepo.listPendingEmailEdits.mockResolvedValueOnce([
            {
                notificacion_id: 10,
                destinatario_id: 20,
                destinatario_email: "editor2@museo.cr",
                destinatario_nombre: "Luis",
                documento_id: 200,
                documento_titulo: "Acta 200",
                documento_numero_serie: "2026-010",
                fecha: "2026-03-09T07:30:00Z",
                enlace_directo: null,
                resultado: "Editado por: Luis",
            },
        ]);
        mockSendEmail.mockRejectedValueOnce(new Error("SMTP error"));

        const out = await notificacionService.sendDailyEditDigestEmails();

        expect(out).toEqual({ sent: 0 });
        expect(mockEntregaRepo.markFallida).toHaveBeenCalledWith(
            expect.objectContaining({
                notificacionId: 10,
                canal: "EMAIL",
                errorMsg: expect.stringContaining("SMTP error"),
            })
        );
    });
});