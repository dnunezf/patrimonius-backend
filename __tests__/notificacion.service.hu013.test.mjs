import { jest } from "@jest/globals";

// --- Mocks de repos y dependencias que tocan BD/correo/bitácora ---
const mockNotificacionRepo = {
    createNotificacion: jest.fn(async (data) => ({ id: 1, ...data })),
};
const mockEntregaRepo = {
    createForNotificacion: jest.fn(async () => {}),
    markEnviada: jest.fn(async () => {}),
    markFallida: jest.fn(async () => {}),
};
const mockFirmaRepo = {
    listSignerUserIds: jest.fn(async () => []),
};
const mockUserRepo = {
    findEmailsByIds: jest.fn(async (ids) =>
        ids.map((id) => ({
            id,
            email: `user${id}@museo.cr`,
            nombre: `User${id}`,
            apellido1: "Test",
        }))
    ),
};
const mockDocumentoRepo = {
    findById: jest.fn(async (id) => ({
        id,
        titulo: `Documento ${id}`,
        fecha: "2026-03-01T00:00:00Z",
    })),
};
const mockMetadatoRepo = {
    getMap: jest.fn(async () => ({
        FIRMANTES_ASIGNADOS: JSON.stringify([10, 11]),
    })),
};
const mockBitacoraRepo = {
    logAdminAction: jest.fn(async () => {}),
};
const mockSendEmail = jest.fn(async () => ({ messageId: "mock-id" }));

// Inyectamos los mocks ANTES de importar el servicio real
await jest.unstable_mockModule("../src/repositories/notificacionRepo.js", () => ({
    notificacionRepo: mockNotificacionRepo,
}));
await jest.unstable_mockModule("../src/repositories/notificacionEntregaRepo.js", () => ({
    notificacionEntregaRepo: mockEntregaRepo,
}));
await jest.unstable_mockModule("../src/repositories/firmaRepo.js", () => ({
    firmaRepo: mockFirmaRepo,
}));
await jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
    userRepo: mockUserRepo,
}));
await jest.unstable_mockModule("../src/repositories/documentoRepo.js", () => ({
    documentoRepo: mockDocumentoRepo,
}));
await jest.unstable_mockModule("../src/repositories/metadatoRepo.js", () => ({
    metadatoRepo: mockMetadatoRepo,
}));
await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
    logAdminAction: mockBitacoraRepo.logAdminAction,
}));
await jest.unstable_mockModule("../src/utils/mailer.js", () => ({
    sendEmail: mockSendEmail,
}));

// Import real del servicio YA con mocks aplicados
const { notificacionService } = await import("../src/services/notificacion.service.js");

describe("HU-013 Notificación inmediata de tareas pendientes", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("HU-013 notifyFirma debe crear notificaciones inmediatas de firma para usuarios seleccionados válidos", async () => {
        // actorId no debe ser notificado
        mockFirmaRepo.listSignerUserIds.mockResolvedValueOnce([]); // nadie ha firmado todavía

        const out = await notificacionService.notifyFirma({
            documentoId: 20,
            actorId: 5,
            selectedUserIds: [5, 10, 11], // incluye actor, debe ser filtrado
            fechaLimite: new Date("2026-03-15T23:59:59Z"),
            link: "/firma/20",
        });

        expect(out).toEqual({ notified: 2 });

        // Se crea una notificación por cada destinatario válido
        expect(mockNotificacionRepo.createNotificacion).toHaveBeenCalledTimes(2);

        const firstCall = mockNotificacionRepo.createNotificacion.mock.calls[0][0];
        expect(firstCall).toMatchObject({
            tipo: "DOC_FIRMA_SOLICITADA",
            accionRequerida: "FIRMAR",
            usuarioId: 10,
            documentoId: 20,
        });
        expect(firstCall.enlaceDirecto || firstCall.enlace_directo).toContain("20");

        // IN_APP marcada como enviada inmediatamente
        expect(mockEntregaRepo.markEnviada).toHaveBeenCalledWith(
            expect.objectContaining({
                canal: "IN_APP",
            })
        );

        // Se envían correos a los dos destinatarios
        expect(mockSendEmail).toHaveBeenCalledTimes(2);
        expect(mockSendEmail).toHaveBeenCalledWith(
            "user10@museo.cr",
            expect.stringContaining("Firma requerida"),
            expect.stringContaining("Documento 20")
        );
    });

    test("HU-013 notifyFirma no debe notificar si todos los destinatarios ya firmaron", async () => {
        mockFirmaRepo.listSignerUserIds.mockResolvedValueOnce([10, 11]);

        const out = await notificacionService.notifyFirma({
            documentoId: 30,
            actorId: 5,
            selectedUserIds: [10, 11],
            fechaLimite: null,
            link: "/firma/30",
        });

        expect(out).toEqual({ notified: 0 });
        expect(mockNotificacionRepo.createNotificacion).not.toHaveBeenCalled();
        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(mockEntregaRepo.markEnviada).not.toHaveBeenCalled();
    });

    test("HU-013 notifyArchivado debe crear notificaciones inmediatas a firmantes asignados", async () => {
        const out = await notificacionService.notifyArchivado({
            documentoId: 40,
            actorId: 5,
        });

        // Hay dos destinatarios en el metadato mockeado (10, 11), excluyendo actorId si estuviera
        expect(out.notified).toBeGreaterThan(0);
        expect(mockNotificacionRepo.createNotificacion).toHaveBeenCalled();

        const dto = mockNotificacionRepo.createNotificacion.mock.calls[0][0];
        expect(dto).toMatchObject({
            tipo: "DOC_ARCHIVADO",
            accionRequerida: "ARCHIVAR",
            documentoId: 40,
        });
        expect(dto.enlaceDirecto || dto.enlace_directo).toContain(`/editor/document/40`);
    });

    test("HU-013 notifyEliminacion debe crear notificaciones a quienes firmaron", async () => {
        mockFirmaRepo.listSignerUserIds.mockResolvedValueOnce([10, 11]);

        const out = await notificacionService.notifyEliminacion({
            documentoId: 50,
            actorId: 5,
        });

        expect(out.notified).toBe(2);
        expect(mockNotificacionRepo.createNotificacion).toHaveBeenCalledTimes(2);

        const dto = mockNotificacionRepo.createNotificacion.mock.calls[0][0];
        expect(dto).toMatchObject({
            tipo: "DOC_ELIMINACION",
            accionRequerida: "ELIMINAR",
            documentoId: 50,
        });
        expect(dto.resultado).toContain("Creado en:");
    });
});