import { jest } from "@jest/globals";

/**
 * HU-031: Trazabilidad del proceso de conservación.
 * La extensión de vigencia debe quedar registrada en bitácora del expediente (ACTUALIZACION).
 * Sin base de datos: repositorio de plazos y bitácora mockeados.
 */

const mockGestionPlazosRepo = {
    getExpedienteParaExtenderVigencia: jest.fn(),
    updateExpedienteFechaVencimiento: jest.fn(),
};

const mockInsertBitacoraExpedienteSafe = jest.fn(async () => {});

const mockResolveBitacoraUsuarioId = jest.fn((actorId) => {
    if (actorId == null || actorId === "") {
        return 1;
    }
    return actorId;
});

await jest.unstable_mockModule("../src/repositories/gestionPlazosRepo.js", () => ({
    gestionPlazosRepo: mockGestionPlazosRepo,
}));

await jest.unstable_mockModule("../src/repositories/bitacoraExpedienteRepo.js", () => ({
    insertBitacoraExpedienteSafe: mockInsertBitacoraExpedienteSafe,
    resolveBitacoraUsuarioId: mockResolveBitacoraUsuarioId,
}));

await jest.unstable_mockModule("../src/repositories/notificacionRepo.js", () => ({
    notificacionRepo: {
        createNotificacion: jest.fn(async () => ({ id: 0 })),
    },
}));

const { extenderVigenciaExpediente } = await import("../src/services/gestionPlazos.service.js");

describe("HU-031 — trazabilidad al extender vigencia de conservación", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("HU-031: extender vigencia registra bitácora ACTUALIZACION con acción extension_vigencia_expediente y fechas", async () => {
        const fechaPrev = "2026-04-20T06:00:00.000Z";
        mockGestionPlazosRepo.getExpedienteParaExtenderVigencia.mockResolvedValueOnce({
            id: 303,
            codigo: "EXP-TRZ",
            nombre: "Exp trazabilidad",
            estado: "CERRADO",
            fecha_vencimiento: new Date(fechaPrev),
        });
        mockGestionPlazosRepo.updateExpedienteFechaVencimiento.mockResolvedValueOnce(true);

        const out = await extenderVigenciaExpediente(
            303,
            { anios: 2, justificacion: "Resolución interna HU-031 — prueba unitaria." },
            { id: 42 }
        );

        expect(out.expediente_id).toBe(303);
        expect(out.anios).toBe(2);
        expect(out.fecha_vencimiento_anterior).toBe(new Date(fechaPrev).toISOString());

        const prev = new Date(fechaPrev);
        const esperada = new Date(prev.getTime());
        esperada.setFullYear(esperada.getFullYear() + 2);
        expect(out.fecha_vencimiento_nueva).toBe(esperada.toISOString());

        expect(mockGestionPlazosRepo.updateExpedienteFechaVencimiento).toHaveBeenCalledWith(303, esperada);
        expect(mockInsertBitacoraExpedienteSafe).toHaveBeenCalledTimes(1);

        const bit = mockInsertBitacoraExpedienteSafe.mock.calls[0][0];
        expect(bit.expediente_id).toBe(303);
        expect(bit.evento).toBe("ACTUALIZACION");
        expect(bit.resultado).toBe("PERMITIDO");
        expect(bit.detalle.accion).toBe("extension_vigencia_expediente");
        expect(bit.detalle.anios).toBe(2);
        expect(bit.detalle.justificacion).toContain("HU-031");
        expect(bit.detalle.fecha_vencimiento_anterior).toBe(prev.toISOString());
        expect(bit.detalle.fecha_vencimiento_nueva).toBe(esperada.toISOString());
        expect(mockResolveBitacoraUsuarioId).toHaveBeenCalledWith(42);
    });
});
