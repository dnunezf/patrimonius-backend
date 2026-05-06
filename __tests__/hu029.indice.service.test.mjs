import { jest } from "@jest/globals";

jest.unstable_mockModule("puppeteer", () => ({
    default: {
        launch: jest.fn(),
    },
}));

jest.unstable_mockModule("fs", () => ({
    default: {
        existsSync: jest.fn(() => false),
        readFileSync: jest.fn(),
        promises: {
            mkdir: jest.fn().mockResolvedValue(undefined),
            writeFile: jest.fn().mockResolvedValue(undefined),
        },
    },
}));

jest.unstable_mockModule("../src/repositories/indiceRepo.js", () => ({
    indiceRepo: {
        getExpedienteById: jest.fn(),
        getIndexByExpedienteId: jest.fn(),
        getDocumentosByExpedienteId: jest.fn(),
        getIndexByHash: jest.fn(),
        createExpedienteIndex: jest.fn(),
        updateIndexFiles: jest.fn(),
        closeExpediente: jest.fn(),
        getAllIndices: jest.fn(),
        getIndexById: jest.fn(),
        getIndicesByExpedienteId: jest.fn(),
    },
}));

jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
    logAdminAction: jest.fn(),
}));

jest.unstable_mockModule("../src/repositories/bitacoraExpedienteRepo.js", () => ({
    insertBitacoraExpedienteSafe: jest.fn(),
    resolveBitacoraUsuarioId: jest.fn((id) => id ?? 2),
}));

const puppeteer = (await import("puppeteer")).default;
const { indiceRepo } = await import("../src/repositories/indiceRepo.js");
const { logAdminAction } = await import("../src/repositories/bitacoraRepo.js");
const {
    insertBitacoraExpedienteSafe,
} = await import("../src/repositories/bitacoraExpedienteRepo.js");
const { indiceService } = await import("../src/services/indice.service.js");

describe("HU029 - Plazos de conservación automáticos al cerrar expediente", () => {
    beforeEach(() => {
        jest.clearAllMocks();

        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-04-20T20:47:17.000Z"));

        puppeteer.launch.mockResolvedValue({
            newPage: jest.fn().mockResolvedValue({
                setContent: jest.fn().mockResolvedValue(undefined),
                pdf: jest.fn().mockResolvedValue(undefined),
            }),
            close: jest.fn().mockResolvedValue(undefined),
        });

        indiceRepo.getExpedienteById.mockResolvedValue({
            id: 3,
            codigo: "EXP-003",
            nombre: "Expediente de prueba",
            estado: "ACTIVO",
            fecha_creacion: "2026-03-01",
            fecha_cierre: null,
            unidad_id: 1,
            unidad_nombre: "Informática",
            serie_id: 10,
            serie_nombre: "Acta",
            subserie_id: null,
            subserie_nombre: null,
            plazo_conservacion_anios: 5,
        });

        indiceRepo.getDocumentosByExpedienteId.mockResolvedValue([
            {
                id: 100,
                titulo: "Documento antiguo",
                estado: "APROBADO",
                numero_serie: "DOC-001",
                expediente_id: 3,
                numero_firmas: 1,
                firmas_obtenidas: 1,
                fecha: "2026-03-29",
                contenido_hash: "hash-1",
                fecha_incorporacion: "2026-03-29",
            },
        ]);

        indiceRepo.getIndexByHash.mockResolvedValue(null);

        indiceRepo.createExpedienteIndex.mockResolvedValue({
            id: 55,
            hash: "hash-indice",
            expediente_id: 3,
        });

        indiceRepo.updateIndexFiles.mockResolvedValue({
            id: 55,
            hash: "hash-indice",
            expediente_id: 3,
            json_path: "uploads/indices/indice-expediente-3-55.json",
            acta_pdf_path: "uploads/indices/acta-cierre-expediente-3-55.pdf",
        });

        indiceRepo.closeExpediente.mockResolvedValue(true);
        logAdminAction.mockResolvedValue(undefined);
        insertBitacoraExpedienteSafe.mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("debe calcular la vigencia desde la fecha de cierre, no desde la fecha del último documento", async () => {
        const result = await indiceService.cerrarExpediente(3, { id: 7 });

        expect(result.duplicated).toBe(false);
        expect(result.expedienteId).toBe(3);

        expect(indiceRepo.closeExpediente).toHaveBeenCalledWith(
            3,
            expect.objectContaining({
                fechaCierre: expect.any(Date),
                fechaInicioVigencia: expect.any(Date),
                fechaVencimiento: expect.any(Date),
            })
        );

        const closePayload = indiceRepo.closeExpediente.mock.calls[0][1];

        expect(closePayload.fechaCierre.toISOString()).toBe(
            "2026-04-20T20:47:17.000Z"
        );

        expect(closePayload.fechaInicioVigencia.toISOString()).toBe(
            "2026-04-20T20:47:17.000Z"
        );

        expect(closePayload.fechaVencimiento.toISOString()).toBe(
            "2031-04-20T20:47:17.000Z"
        );

        expect(result.vigencia.fecha_inicio_vigencia.toISOString()).toBe(
            "2026-04-20T20:47:17.000Z"
        );

        expect(result.vigencia.fecha_vencimiento.toISOString()).toBe(
            "2031-04-20T20:47:17.000Z"
        );
    });

    it("debe tomar el plazo de conservación desde la serie asociada al expediente", async () => {
        indiceRepo.getExpedienteById.mockResolvedValueOnce({
            id: 4,
            codigo: "EXP-004",
            nombre: "Expediente plazo 1 año",
            estado: "ACTIVO",
            fecha_creacion: "2026-04-01",
            fecha_cierre: null,
            unidad_id: 1,
            unidad_nombre: "Informática",
            serie_id: 11,
            serie_nombre: "Minutas",
            subserie_id: null,
            subserie_nombre: null,
            plazo_conservacion_anios: 1,
        });

        const result = await indiceService.cerrarExpediente(4, { id: 7 });

        expect(result.vigencia.plazo_conservacion_anios).toBe(1);

        const closePayload = indiceRepo.closeExpediente.mock.calls[0][1];

        expect(closePayload.fechaInicioVigencia.toISOString()).toBe(
            "2026-04-20T20:47:17.000Z"
        );

        expect(closePayload.fechaVencimiento.toISOString()).toBe(
            "2027-04-20T20:47:17.000Z"
        );
    });

    it("debe rechazar el cierre si el expediente no existe", async () => {
        indiceRepo.getExpedienteById.mockResolvedValueOnce(null);

        await expect(
            indiceService.cerrarExpediente(999, { id: 7 })
        ).rejects.toThrow("Expediente no encontrado");

        expect(indiceRepo.closeExpediente).not.toHaveBeenCalled();
    });

    it("debe rechazar el cierre si el expediente ya está cerrado", async () => {
        indiceRepo.getExpedienteById.mockResolvedValueOnce({
            id: 3,
            estado: "CERRADO",
        });

        indiceRepo.getIndexByExpedienteId.mockResolvedValueOnce({
            id: 20,
            expediente_id: 3,
        });

        await expect(
            indiceService.cerrarExpediente(3, { id: 7 })
        ).rejects.toThrow("El expediente ya se encuentra cerrado");

        expect(indiceRepo.closeExpediente).not.toHaveBeenCalled();
    });

    it("debe rechazar el cierre si la serie no tiene plazo válido", async () => {
        indiceRepo.getExpedienteById.mockResolvedValueOnce({
            id: 3,
            codigo: "EXP-003",
            nombre: "Expediente sin plazo",
            estado: "ACTIVO",
            fecha_creacion: "2026-03-01",
            fecha_cierre: null,
            unidad_id: 1,
            unidad_nombre: "Informática",
            serie_id: 10,
            serie_nombre: "Acta",
            subserie_id: null,
            subserie_nombre: null,
            plazo_conservacion_anios: -1,
        });

        await expect(
            indiceService.cerrarExpediente(3, { id: 7 })
        ).rejects.toThrow(
            "La serie asociada al expediente no tiene un plazo de conservación válido"
        );

        expect(indiceRepo.closeExpediente).not.toHaveBeenCalled();
    });

    it("debe rechazar el cierre si hay documentos con estado no permitido para índice", async () => {
        indiceRepo.getDocumentosByExpedienteId.mockResolvedValueOnce([
            {
                id: 100,
                titulo: "Documento en edición",
                estado: "EDICION",
                numero_serie: "DOC-001",
                fecha: "2026-03-29",
            },
        ]);

        await expect(
            indiceService.cerrarExpediente(3, { id: 7 })
        ).rejects.toThrow(
            "El expediente no puede cerrarse porque tiene documentos con inconsistencias"
        );

        expect(indiceRepo.closeExpediente).not.toHaveBeenCalled();
    });

    it("debe registrar bitácora del cierre con las fechas de vigencia calculadas", async () => {
        await indiceService.cerrarExpediente(3, { id: 7 });

        expect(insertBitacoraExpedienteSafe).toHaveBeenCalledWith(
            expect.objectContaining({
                expediente_id: 3,
                usuario_id: 7,
                evento: "CIERRE",
                resultado: "PERMITIDO",
                estado_anterior: "ACTIVO",
                estado_nuevo: "CERRADO",
                detalle: expect.objectContaining({
                    cierre: true,
                    origen: "indices_cerrar_expediente",
                    plazoConservacionAnios: 5,
                    fechaInicioVigencia: expect.any(Date),
                    fechaVencimiento: expect.any(Date),
                }),
            })
        );

        expect(logAdminAction).toHaveBeenCalledWith(
            expect.objectContaining({
                actorId: 7,
                action: "EXPEDIENTE_CLOSE_INDEX_GENERATE",
                result: "OK",
            })
        );
    });
});