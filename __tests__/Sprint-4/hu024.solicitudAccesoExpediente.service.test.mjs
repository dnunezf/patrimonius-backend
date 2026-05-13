import { jest } from "@jest/globals";

const mockSolicitudAccesoExpedienteRepo = {
  findPendingByUsuarioAndExpediente: jest.fn(),
  create: jest.fn(),
  findByIdDetailed: jest.fn(),
  findById: jest.fn(),
  updateResolution: jest.fn(),
  listAll: jest.fn(),
  listByUsuarioSolicitante: jest.fn(),
};

const mockExpedienteRepo = {
  getById: jest.fn(),
};

const mockPool = {
  query: jest.fn(),
};

const mockBitacoraRepo = {
  insertBase: jest.fn(),
  insertActividad: jest.fn(),
};

await jest.unstable_mockModule("../../src/repositories/solicitudAccesoExpedienteRepo.js", () => ({
  solicitudAccesoExpedienteRepo: mockSolicitudAccesoExpedienteRepo,
}));

await jest.unstable_mockModule("../../src/repositories/expedienteRepo.js", () => ({
  default: mockExpedienteRepo,
}));

await jest.unstable_mockModule("../../src/db/pool.js", () => ({
  pool: mockPool,
}));

await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
  bitacoraRepo: mockBitacoraRepo,
}));

const { solicitudAccesoExpedienteService } = await import(
  "../../src/services/solicitudAccesoExpediente.service.js"
);

describe("HU-024: Solicitud Acceso Expediente (service)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBitacoraRepo.insertBase.mockResolvedValue(200);
    mockBitacoraRepo.insertActividad.mockResolvedValue(true);
    mockPool.query.mockResolvedValue([[], []]);
  });

  describe("createSolicitud", () => {
    test("crea una solicitud correctamente cuando el expediente existe y no hay pendiente", async () => {
      mockExpedienteRepo.getById.mockResolvedValue({
        id: 11,
        nombre: "Expediente 11",
      });

      mockSolicitudAccesoExpedienteRepo.findPendingByUsuarioAndExpediente.mockResolvedValue(null);

      mockSolicitudAccesoExpedienteRepo.create.mockResolvedValue({
        id: 80,
        estado_solicitud: "PENDIENTE",
      });

      mockSolicitudAccesoExpedienteRepo.findByIdDetailed.mockResolvedValue({
        id: 80,
        expediente_id: 11,
        estado_solicitud: "PENDIENTE",
      });

      const out = await solicitudAccesoExpedienteService.createSolicitud({
        justificacion: "  Necesito consultar el expediente  ",
        usuario_solicitante_id: 9,
        expediente_id: 11,
      });

      expect(mockSolicitudAccesoExpedienteRepo.create).toHaveBeenCalledWith({
        justificacion: "Necesito consultar el expediente",
        usuario_solicitante_id: 9,
        expediente_id: 11,
        estado_solicitud: "PENDIENTE",
      });

      expect(out.id).toBe(80);
    });

    test("lanza BAD_REQUEST cuando la justificación viene vacía", async () => {
      await expect(
        solicitudAccesoExpedienteService.createSolicitud({
          justificacion: "   ",
          usuario_solicitante_id: 9,
          expediente_id: 11,
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("lanza NOT_FOUND cuando el expediente no existe", async () => {
      mockExpedienteRepo.getById.mockResolvedValue(null);

      await expect(
        solicitudAccesoExpedienteService.createSolicitud({
          justificacion: "Motivo",
          usuario_solicitante_id: 9,
          expediente_id: 99,
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("lanza CONFLICT cuando ya existe una solicitud pendiente", async () => {
      mockExpedienteRepo.getById.mockResolvedValue({
        id: 11,
      });

      mockSolicitudAccesoExpedienteRepo.findPendingByUsuarioAndExpediente.mockResolvedValue({
        id: 81,
        estado_solicitud: "PENDIENTE",
      });

      await expect(
        solicitudAccesoExpedienteService.createSolicitud({
          justificacion: "Motivo",
          usuario_solicitante_id: 9,
          expediente_id: 11,
        })
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });
  });

  describe("resolveSolicitud", () => {
    test("aprueba una solicitud y crea permiso VIEW sobre expediente", async () => {
      mockSolicitudAccesoExpedienteRepo.findById.mockResolvedValue({
        id: 33,
        expediente_id: 11,
        usuario_solicitante_id: 9,
        estado_solicitud: "PENDIENTE",
      });

      mockSolicitudAccesoExpedienteRepo.updateResolution.mockResolvedValue({
        id: 33,
      });

      mockSolicitudAccesoExpedienteRepo.findByIdDetailed.mockResolvedValue({
        id: 33,
        estado_solicitud: "APROBADA",
      });

      const out = await solicitudAccesoExpedienteService.resolveSolicitud({
        solicitud_id: 33,
        admin_responsable_id: 1,
        estado_solicitud: "APROBADA",
        motivo_resolucion: "  Aprobado por revisión  ",
      });

      expect(mockSolicitudAccesoExpedienteRepo.updateResolution).toHaveBeenCalledWith({
        id: 33,
        estado_solicitud: "APROBADA",
        motivo_resolucion: "Aprobado por revisión",
        admin_responsable_id: 1,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO Permiso_Usuario_Expediente"),
        [9, 11, "Otorgado por aprobación de solicitud de acceso a expediente #33", 1]
      );

      expect(out.estado_solicitud).toBe("APROBADA");
    });

    test("rechaza una solicitud sin crear permiso", async () => {
      mockExpedienteRepo.getById.mockResolvedValue({
        id: 11,
        nombre: "Expediente 11",
        estado: "ABIERTO",
      });

      mockSolicitudAccesoExpedienteRepo.findById.mockResolvedValue({
        id: 34,
        expediente_id: 11,
        usuario_solicitante_id: 9,
        estado_solicitud: "PENDIENTE",
      });

      mockSolicitudAccesoExpedienteRepo.updateResolution.mockResolvedValue({
        id: 34,
      });

      mockSolicitudAccesoExpedienteRepo.findByIdDetailed.mockResolvedValue({
        id: 34,
        estado_solicitud: "RECHAZADA",
      });

      const out = await solicitudAccesoExpedienteService.resolveSolicitud({
        solicitud_id: 34,
        admin_responsable_id: 1,
        estado_solicitud: "RECHAZADA",
        motivo_resolucion: "No procede",
      });

      const permisoInserts = mockPool.query.mock.calls.filter(
        (c) =>
          typeof c[0] === "string" &&
          c[0].includes("INSERT INTO Permiso_Usuario_Expediente"),
      );
      expect(permisoInserts).toHaveLength(0);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO Bitacora_Expediente"),
        expect.arrayContaining([11, 1, "PERMISO_REVOCADO", "DENEGADO"]),
      );

      expect(out.estado_solicitud).toBe("RECHAZADA");
    });

    test("lanza BAD_REQUEST cuando el estado no es válido", async () => {
      await expect(
        solicitudAccesoExpedienteService.resolveSolicitud({
          solicitud_id: 33,
          admin_responsable_id: 1,
          estado_solicitud: "PENDIENTE",
          motivo_resolucion: "Motivo",
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("lanza BAD_REQUEST cuando el motivo viene vacío", async () => {
      await expect(
        solicitudAccesoExpedienteService.resolveSolicitud({
          solicitud_id: 33,
          admin_responsable_id: 1,
          estado_solicitud: "APROBADA",
          motivo_resolucion: "   ",
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("lanza NOT_FOUND cuando la solicitud no existe", async () => {
      mockSolicitudAccesoExpedienteRepo.findById.mockResolvedValue(null);

      await expect(
        solicitudAccesoExpedienteService.resolveSolicitud({
          solicitud_id: 33,
          admin_responsable_id: 1,
          estado_solicitud: "APROBADA",
          motivo_resolucion: "Motivo",
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("lanza STATE_ERROR cuando la solicitud ya fue resuelta", async () => {
      mockSolicitudAccesoExpedienteRepo.findById.mockResolvedValue({
        id: 33,
        estado_solicitud: "APROBADA",
      });

      await expect(
        solicitudAccesoExpedienteService.resolveSolicitud({
          solicitud_id: 33,
          admin_responsable_id: 1,
          estado_solicitud: "RECHAZADA",
          motivo_resolucion: "Motivo",
        })
      ).rejects.toMatchObject({
        code: "STATE_ERROR",
      });
    });
  });

  describe("listados y consulta", () => {
    test("listSolicitudes delega en el repo", async () => {
      mockSolicitudAccesoExpedienteRepo.listAll.mockResolvedValue([{ id: 1 }]);

      const out = await solicitudAccesoExpedienteService.listSolicitudes();

      expect(out).toEqual([{ id: 1 }]);
    });

    test("listMisSolicitudes delega en el repo", async () => {
      mockSolicitudAccesoExpedienteRepo.listByUsuarioSolicitante.mockResolvedValue([{ id: 2 }]);

      const out = await solicitudAccesoExpedienteService.listMisSolicitudes(9);

      expect(out).toEqual([{ id: 2 }]);
      expect(mockSolicitudAccesoExpedienteRepo.listByUsuarioSolicitante).toHaveBeenCalledWith(9);
    });

    test("getSolicitudById devuelve la solicitud si existe", async () => {
      mockSolicitudAccesoExpedienteRepo.findByIdDetailed.mockResolvedValue({ id: 88 });

      const out = await solicitudAccesoExpedienteService.getSolicitudById(88);

      expect(out).toEqual({ id: 88 });
    });

    test("getSolicitudById lanza NOT_FOUND si no existe", async () => {
      mockSolicitudAccesoExpedienteRepo.findByIdDetailed.mockResolvedValue(null);

      await expect(
        solicitudAccesoExpedienteService.getSolicitudById(88)
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});