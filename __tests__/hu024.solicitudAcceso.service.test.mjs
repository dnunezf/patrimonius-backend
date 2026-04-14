import { jest } from "@jest/globals";

const mockSolicitudAccesoRepo = {
  create: jest.fn(),
  findByIdDetailed: jest.fn(),
  findById: jest.fn(),
  updateResolution: jest.fn(),
  listAll: jest.fn(),
  listByUsuarioSolicitante: jest.fn(),
};

const mockDocumentoRepo = {
  findById: jest.fn(),
};

const mockUserRepo = {
  findById: jest.fn(),
};

const mockPool = {
  query: jest.fn(),
};

const mockBitacoraRepo = {
  insertBase: jest.fn(),
  insertActividad: jest.fn(),
};

const mockBitacoraPermisosRepo = {
  log: jest.fn(),
};

await jest.unstable_mockModule("../src/repositories/solicitudAccesoRepo.js", () => ({
  solicitudAccesoRepo: mockSolicitudAccesoRepo,
}));

await jest.unstable_mockModule("../src/repositories/documentoRepo.js", () => ({
  documentoRepo: mockDocumentoRepo,
}));

await jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
  userRepo: mockUserRepo,
}));

await jest.unstable_mockModule("../src/db/pool.js", () => ({
  pool: mockPool,
}));

await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
  bitacoraRepo: mockBitacoraRepo,
}));

await jest.unstable_mockModule("../src/repositories/bitacoraPermisosRepo.js", () => ({
  bitacoraPermisosRepo: mockBitacoraPermisosRepo,
}));

const { solicitudAccesoService } = await import("../src/services/solicitudAcceso.service.js");

describe("HU-024: Solicitud Acceso Documento (service)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ROL_ID_EXTERNO = "5";

    mockBitacoraRepo.insertBase.mockResolvedValue(100);
    mockBitacoraRepo.insertActividad.mockResolvedValue(true);
    mockBitacoraPermisosRepo.log.mockResolvedValue(true);
    mockPool.query.mockResolvedValue([[], []]);
  });

  describe("createSolicitud", () => {
    test("crea una solicitud correctamente cuando el documento está ARCHIVADO", async () => {
      mockDocumentoRepo.findById.mockResolvedValue({
        id: 10,
        estado: "ARCHIVADO",
      });

      mockSolicitudAccesoRepo.create.mockResolvedValue({
        id: 55,
        justificacion: "Necesito revisar el documento",
        estado_solicitud: "PENDIENTE",
      });

      mockSolicitudAccesoRepo.findByIdDetailed.mockResolvedValue({
        id: 55,
        documento_id: 10,
        usuario_solicitante_id: 7,
        justificacion: "Necesito revisar el documento",
        estado_solicitud: "PENDIENTE",
      });

      const out = await solicitudAccesoService.createSolicitud({
        justificacion: "  Necesito revisar el documento  ",
        usuario_solicitante_id: 7,
        documento_id: 10,
      });

      expect(mockSolicitudAccesoRepo.create).toHaveBeenCalledWith({
        justificacion: "Necesito revisar el documento",
        usuario_solicitante_id: 7,
        documento_id: 10,
        estado_solicitud: "PENDIENTE",
      });

      expect(mockBitacoraRepo.insertBase).toHaveBeenCalled();
      expect(mockSolicitudAccesoRepo.findByIdDetailed).toHaveBeenCalledWith(55);
      expect(out.id).toBe(55);
    });

    test("lanza BAD_REQUEST cuando la justificación viene vacía", async () => {
      await expect(
        solicitudAccesoService.createSolicitud({
          justificacion: "   ",
          usuario_solicitante_id: 7,
          documento_id: 10,
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });

      expect(mockSolicitudAccesoRepo.create).not.toHaveBeenCalled();
    });

    test("lanza NOT_FOUND cuando el documento no existe", async () => {
      mockDocumentoRepo.findById.mockResolvedValue(null);

      await expect(
        solicitudAccesoService.createSolicitud({
          justificacion: "Motivo",
          usuario_solicitante_id: 7,
          documento_id: 99,
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("lanza STATE_ERROR cuando el documento no está ARCHIVADO", async () => {
      mockDocumentoRepo.findById.mockResolvedValue({
        id: 10,
        estado: "BORRADOR",
      });

      await expect(
        solicitudAccesoService.createSolicitud({
          justificacion: "Motivo",
          usuario_solicitante_id: 7,
          documento_id: 10,
        })
      ).rejects.toMatchObject({
        code: "STATE_ERROR",
      });
    });

    test("continúa aunque falle la bitácora", async () => {
      mockDocumentoRepo.findById.mockResolvedValue({
        id: 10,
        estado: "ARCHIVADO",
      });

      mockSolicitudAccesoRepo.create.mockResolvedValue({
        id: 70,
        justificacion: "Motivo",
        estado_solicitud: "PENDIENTE",
      });

      mockSolicitudAccesoRepo.findByIdDetailed.mockResolvedValue({
        id: 70,
      });

      mockBitacoraRepo.insertBase.mockRejectedValue(new Error("falló bitácora"));

      const out = await solicitudAccesoService.createSolicitud({
        justificacion: "Motivo",
        usuario_solicitante_id: 7,
        documento_id: 10,
      });

      expect(out.id).toBe(70);
    });
  });

  describe("resolveSolicitud", () => {
    test("aprueba una solicitud, crea permiso VIEW y registra bitácoras", async () => {
      mockSolicitudAccesoRepo.findById.mockResolvedValue({
        id: 20,
        estado_solicitud: "PENDIENTE",
        usuario_solicitante_id: 8,
        documento_id: 15,
        justificacion: "Necesito acceso",
      });

      mockSolicitudAccesoRepo.updateResolution.mockResolvedValue({
        id: 20,
      });

      mockUserRepo.findById.mockResolvedValue({
        id: 8,
        rolId: 5,
        rol: "USUARIO_EXTERNO",
        rolIds: [5],
      });

      mockDocumentoRepo.findById.mockResolvedValue({
        id: 15,
        titulo: "Documento A",
        numero_serie: "DOC-001",
      });

      mockSolicitudAccesoRepo.findByIdDetailed.mockResolvedValue({
        id: 20,
        estado_solicitud: "APROBADA",
      });

      const out = await solicitudAccesoService.resolveSolicitud({
        solicitud_id: 20,
        admin_responsable_id: 1,
        estado_solicitud: "APROBADA",
        motivo_resolucion: "  Cumple requisitos  ",
        user_agent: "Mozilla/5.0",
      });

      expect(mockSolicitudAccesoRepo.updateResolution).toHaveBeenCalledWith({
        id: 20,
        estado_solicitud: "APROBADA",
        motivo_resolucion: "Cumple requisitos",
        admin_responsable_id: 1,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO Permiso_Usuario"),
        [8, 15, "Otorgado por aprobación de solicitud de acceso #20"]
      );

      expect(mockBitacoraPermisosRepo.log).toHaveBeenCalled();
      expect(mockBitacoraRepo.insertBase).toHaveBeenCalled();
      expect(out.estado_solicitud).toBe("APROBADA");
    });

    test("rechaza una solicitud sin crear permiso VIEW", async () => {
      mockSolicitudAccesoRepo.findById.mockResolvedValue({
        id: 21,
        estado_solicitud: "PENDIENTE",
        usuario_solicitante_id: 8,
        documento_id: 15,
        justificacion: "Necesito acceso",
      });

      mockSolicitudAccesoRepo.updateResolution.mockResolvedValue({
        id: 21,
      });

      mockUserRepo.findById.mockResolvedValue({
        id: 8,
        rolId: 2,
        rol: "ADMIN",
        rolIds: [2],
      });

      mockDocumentoRepo.findById.mockResolvedValue({
        id: 15,
        titulo: "Documento A",
        numero_serie: "DOC-001",
      });

      mockSolicitudAccesoRepo.findByIdDetailed.mockResolvedValue({
        id: 21,
        estado_solicitud: "RECHAZADA",
      });

      const out = await solicitudAccesoService.resolveSolicitud({
        solicitud_id: 21,
        admin_responsable_id: 1,
        estado_solicitud: "RECHAZADA",
        motivo_resolucion: "No procede",
      });

      expect(mockPool.query).not.toHaveBeenCalled();
      expect(mockBitacoraPermisosRepo.log).toHaveBeenCalled();
      expect(out.estado_solicitud).toBe("RECHAZADA");
    });

    test("lanza BAD_REQUEST cuando el estado no es válido", async () => {
      await expect(
        solicitudAccesoService.resolveSolicitud({
          solicitud_id: 20,
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
        solicitudAccesoService.resolveSolicitud({
          solicitud_id: 20,
          admin_responsable_id: 1,
          estado_solicitud: "APROBADA",
          motivo_resolucion: "   ",
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("lanza NOT_FOUND cuando la solicitud no existe", async () => {
      mockSolicitudAccesoRepo.findById.mockResolvedValue(null);

      await expect(
        solicitudAccesoService.resolveSolicitud({
          solicitud_id: 20,
          admin_responsable_id: 1,
          estado_solicitud: "APROBADA",
          motivo_resolucion: "Motivo",
        })
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("lanza STATE_ERROR cuando la solicitud ya fue resuelta", async () => {
      mockSolicitudAccesoRepo.findById.mockResolvedValue({
        id: 20,
        estado_solicitud: "APROBADA",
      });

      await expect(
        solicitudAccesoService.resolveSolicitud({
          solicitud_id: 20,
          admin_responsable_id: 1,
          estado_solicitud: "RECHAZADA",
          motivo_resolucion: "Motivo",
        })
      ).rejects.toMatchObject({
        code: "STATE_ERROR",
      });
    });
  });

  describe("getSolicitudById", () => {
    test("devuelve la solicitud si existe", async () => {
      mockSolicitudAccesoRepo.findByIdDetailed.mockResolvedValue({ id: 50 });

      const out = await solicitudAccesoService.getSolicitudById(50);

      expect(out).toEqual({ id: 50 });
    });

    test("lanza NOT_FOUND si no existe", async () => {
      mockSolicitudAccesoRepo.findByIdDetailed.mockResolvedValue(null);

      await expect(solicitudAccesoService.getSolicitudById(50)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("listados", () => {
    test("listSolicitudes delega en el repo", async () => {
      mockSolicitudAccesoRepo.listAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const out = await solicitudAccesoService.listSolicitudes();

      expect(out).toHaveLength(2);
      expect(mockSolicitudAccesoRepo.listAll).toHaveBeenCalledTimes(1);
    });

    test("listMisSolicitudes delega en el repo", async () => {
      mockSolicitudAccesoRepo.listByUsuarioSolicitante.mockResolvedValue([{ id: 3 }]);

      const out = await solicitudAccesoService.listMisSolicitudes(9);

      expect(out).toEqual([{ id: 3 }]);
      expect(mockSolicitudAccesoRepo.listByUsuarioSolicitante).toHaveBeenCalledWith(9);
    });
  });
});