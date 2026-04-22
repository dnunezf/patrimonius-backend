import { jest } from "@jest/globals";

const mockGestionPlazosRepo = {
    getExpedienteParaDisposicionHu032: jest.fn(),
    updateExpedienteDisposicionHu032: jest.fn(),
};

const mockInsertBitacoraExpedienteSafe = jest.fn(async () => {});

const mockResolveBitacoraUsuarioId = jest.fn((actorId) => {
    if (actorId == null || actorId === "") {
        return 1;
    }
    return actorId;
});

const mockBitacoraList = jest.fn(async () => []);

const mockIndiceRepo = {
    getDocumentosByExpedienteId: jest.fn(async () => [
        { id: 10, titulo: "Doc A", estado: "ARCHIVADO" },
    ]),
};

const mockSaveActa = jest.fn(async () => ({
    relativePath: "uploads/disposicion-eliminacion/acta-test.pdf",
}));

const mockZip = jest.fn(async () => ({
    relativePath: "uploads/disposicion-transferencias/paq-test.zip",
}));

await jest.unstable_mockModule("../src/repositories/gestionPlazosRepo.js", () => ({
    gestionPlazosRepo: mockGestionPlazosRepo,
}));

await jest.unstable_mockModule("../src/repositories/bitacoraExpedienteRepo.js", () => ({
    insertBitacoraExpedienteSafe: mockInsertBitacoraExpedienteSafe,
    resolveBitacoraUsuarioId: mockResolveBitacoraUsuarioId,
    bitacoraExpedienteRepo: {
        listByExpedienteId: mockBitacoraList,
    },
}));

await jest.unstable_mockModule("../src/repositories/indiceRepo.js", () => ({
    indiceRepo: mockIndiceRepo,
}));

await jest.unstable_mockModule("../src/utils/expedienteActaEliminacionPdf.js", () => ({
    saveActaEliminacionPdf: mockSaveActa,
}));

await jest.unstable_mockModule("../src/utils/expedienteTransferenciaZip.js", () => ({
    crearPaqueteTransferenciaZip: mockZip,
}));

const {
    iniciarDisposicionExpediente,
    registrarRevisionDisposicionExpediente,
    aprobarYEjecutarDisposicionExpediente,
    rechazarDisposicionExpediente,
    obtenerDetalleConservacionExpediente,
    ejecutarDisposicionTransferenciaCompleta,
} = await import("../src/services/gestionPlazos.service.js");

function baseExpediente(over = {}) {
    const hoy = new Date();
    const ayer = new Date(hoy.getTime() - 86400000);
    return {
        id: 501,
        codigo: "EXP-HU032",
        nombre: "Expediente prueba HU-032",
        estado: "CERRADO",
        fecha_cierre: ayer,
        fecha_inicio_vigencia: ayer,
        fecha_vencimiento: ayer,
        politica_disposicion: null,
        disposicion_estado: null,
        disposicion_tipo: null,
        disposicion_justificacion_inicio: null,
        disposicion_revision_json: null,
        disposicion_justificacion_aprobacion: null,
        disposicion_motivo_rechazo: null,
        acta_eliminacion_codigo: null,
        acta_eliminacion_pdf_path: null,
        paquete_transferencia_zip_path: null,
        disposicion_metadatos_resumen: null,
        unidad_nombre: "Unidad",
        serie_nombre: "Serie",
        subserie_nombre: null,
        ...over,
    };
}

describe("HU-032 — disposición documental por expediente (servicio)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGestionPlazosRepo.getExpedienteParaDisposicionHu032.mockReset();
        mockGestionPlazosRepo.updateExpedienteDisposicionHu032.mockReset();
        mockGestionPlazosRepo.updateExpedienteDisposicionHu032.mockResolvedValue(true);
    });

    test("iniciar disposición: vencido, CERRADO, sin flujo → REVISION_PENDIENTE + bitácora", async () => {
        mockGestionPlazosRepo.getExpedienteParaDisposicionHu032.mockResolvedValueOnce(
            baseExpediente({ politica_disposicion: null })
        );
        mockGestionPlazosRepo.updateExpedienteDisposicionHu032.mockResolvedValueOnce(true);

        const out = await iniciarDisposicionExpediente(
            501,
            { tipo_disposicion: "ELIMINACION", justificacion: "Justificación inicial HU-032." },
            { id: 9 }
        );

        expect(out.disposicion_estado).toBe("DISPOSICION_REVISION_PENDIENTE");
        expect(out.disposicion_tipo).toBe("ELIMINACION");
        expect(mockInsertBitacoraExpedienteSafe).toHaveBeenCalled();
        const bit = mockInsertBitacoraExpedienteSafe.mock.calls[0][0];
        expect(bit.detalle.accion).toBe("disposicion_inicio");
    });

    test("iniciar disposición: rechaza si política de serie no coincide", async () => {
        mockGestionPlazosRepo.getExpedienteParaDisposicionHu032.mockResolvedValueOnce(
            baseExpediente({ politica_disposicion: "TRANSFERENCIA" })
        );

        await expect(
            iniciarDisposicionExpediente(
                501,
                { tipo_disposicion: "ELIMINACION", justificacion: "xxxxxxxx" },
                { id: 9 }
            )
        ).rejects.toMatchObject({ status: 422 });
    });

    test("iniciar disposición: rechaza conservación permanente (tipo no permitido)", async () => {
        mockGestionPlazosRepo.getExpedienteParaDisposicionHu032.mockResolvedValueOnce(
            baseExpediente({ politica_disposicion: null })
        );

        await expect(
            iniciarDisposicionExpediente(
                501,
                { tipo_disposicion: "CONSERVACION_PERMANENTE", justificacion: "xxxxxxxx" },
                { id: 9 }
            )
        ).rejects.toMatchObject({ status: 400 });
    });

    test("ejecutar transferencia completa: encadena inicio, revisión y aprobación", async () => {
        mockGestionPlazosRepo.getExpedienteParaDisposicionHu032
            .mockResolvedValueOnce(baseExpediente())
            .mockResolvedValueOnce(
                baseExpediente({
                    disposicion_estado: "DISPOSICION_REVISION_PENDIENTE",
                    disposicion_tipo: "TRANSFERENCIA",
                })
            )
            .mockResolvedValueOnce(
                baseExpediente({
                    disposicion_estado: "DISPOSICION_REVISION_COMPLETADA",
                    disposicion_tipo: "TRANSFERENCIA",
                    disposicion_revision_json: JSON.stringify({
                        metadatos_ok: true,
                        firma_ok: true,
                        plazo_ok: true,
                        politica_ok: true,
                    }),
                })
            );
        mockGestionPlazosRepo.updateExpedienteDisposicionHu032.mockResolvedValue(true);

        const out = await ejecutarDisposicionTransferenciaCompleta(
            501,
            {
                justificacion_inicio: "Inicio transferencia HU-032.",
                justificacion_aprobacion: "Aprobación transferencia HU-032.",
            },
            { id: 9 }
        );

        expect(out.expediente_estado).toBe("TRANSFERIDO");
        expect(mockZip).toHaveBeenCalled();
        expect(mockGestionPlazosRepo.updateExpedienteDisposicionHu032.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    test("registrar revisión: checklist completo", async () => {
        mockGestionPlazosRepo.getExpedienteParaDisposicionHu032.mockResolvedValueOnce(
            baseExpediente({
                disposicion_estado: "DISPOSICION_REVISION_PENDIENTE",
                disposicion_tipo: "ELIMINACION",
            })
        );
        mockGestionPlazosRepo.updateExpedienteDisposicionHu032.mockResolvedValueOnce(true);

        const out = await registrarRevisionDisposicionExpediente(
            501,
            {
                checklist: {
                    metadatos_ok: true,
                    firma_ok: true,
                    plazo_ok: true,
                    politica_ok: true,
                },
                notas: "",
            },
            { id: 9 }
        );

        expect(out.disposicion_estado).toBe("DISPOSICION_REVISION_COMPLETADA");
    });

    test("aprobar eliminación: genera acta y marca ELIMINADO", async () => {
        mockGestionPlazosRepo.getExpedienteParaDisposicionHu032.mockResolvedValueOnce(
            baseExpediente({
                disposicion_estado: "DISPOSICION_REVISION_COMPLETADA",
                disposicion_tipo: "ELIMINACION",
                disposicion_revision_json: JSON.stringify({
                    metadatos_ok: true,
                    firma_ok: true,
                    plazo_ok: true,
                    politica_ok: true,
                }),
            })
        );
        mockGestionPlazosRepo.updateExpedienteDisposicionHu032.mockResolvedValueOnce(true);

        const out = await aprobarYEjecutarDisposicionExpediente(
            501,
            { justificacion: "Aprobación archivística HU-032." },
            { id: 9 }
        );

        expect(out.expediente_estado).toBe("ELIMINADO");
        expect(mockSaveActa).toHaveBeenCalled();
        expect(mockGestionPlazosRepo.updateExpedienteDisposicionHu032).toHaveBeenCalled();
    });

    test("aprobar transferencia: genera ZIP y marca TRANSFERIDO", async () => {
        mockGestionPlazosRepo.getExpedienteParaDisposicionHu032.mockResolvedValueOnce(
            baseExpediente({
                disposicion_estado: "DISPOSICION_REVISION_COMPLETADA",
                disposicion_tipo: "TRANSFERENCIA",
                disposicion_revision_json: JSON.stringify({
                    metadatos_ok: true,
                    firma_ok: true,
                    plazo_ok: true,
                    politica_ok: true,
                }),
            })
        );
        mockGestionPlazosRepo.updateExpedienteDisposicionHu032.mockResolvedValueOnce(true);

        const out = await aprobarYEjecutarDisposicionExpediente(
            501,
            { justificacion: "Aprobación transferencia HU-032." },
            { id: 9 }
        );

        expect(out.expediente_estado).toBe("TRANSFERIDO");
        expect(mockZip).toHaveBeenCalled();
    });

    test("rechazar disposición con motivo", async () => {
        mockGestionPlazosRepo.getExpedienteParaDisposicionHu032.mockResolvedValueOnce(
            baseExpediente({
                disposicion_estado: "DISPOSICION_REVISION_PENDIENTE",
            })
        );
        mockGestionPlazosRepo.updateExpedienteDisposicionHu032.mockResolvedValueOnce(true);

        const out = await rechazarDisposicionExpediente(
            501,
            { motivo: "Correcciones necesarias en metadatos del expediente." },
            { id: 9 }
        );

        expect(out.disposicion_estado).toBe("DISPOSICION_RECHAZADA");
        expect(mockInsertBitacoraExpedienteSafe).toHaveBeenCalled();
    });

    test("obtenerDetalleConservacionExpediente devuelve bitácora", async () => {
        mockGestionPlazosRepo.getExpedienteParaDisposicionHu032.mockResolvedValueOnce(
            baseExpediente()
        );
        mockBitacoraList.mockResolvedValueOnce([
            {
                id: 1,
                fecha: new Date("2026-04-01T10:00:00Z"),
                evento: "CIERRE",
                resultado: "PERMITIDO",
                estado_anterior: "ACTIVO",
                estado_nuevo: "CERRADO",
                detalle: null,
                usuario_email: "a@b.cr",
                usuario_nombre: "Arch",
            },
        ]);

        const det = await obtenerDetalleConservacionExpediente(501);
        expect(det.bitacora.length).toBe(1);
        expect(det.expediente.id).toBe(501);
    });
});
