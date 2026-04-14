import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const solicitudAccesoServiceMock = {
  createSolicitud: jest.fn(),
  listMisSolicitudes: jest.fn(),
  listSolicitudes: jest.fn(),
  getSolicitudById: jest.fn(),
  resolveSolicitud: jest.fn(),
};

await jest.unstable_mockModule("../src/services/solicitudAcceso.service.js", () => ({
  solicitudAccesoService: solicitudAccesoServiceMock,
}));

await jest.unstable_mockModule("../src/middleware/authGuard.js", () => ({
  authGuard: (req, _res, next) => {
    req.user = { id: 123, nombre: "Admin" };
    next();
  },
}));

await jest.unstable_mockModule("../src/middleware/adminGuard.js", () => ({
  adminGuard: (_req, _res, next) => next(),
}));

const { default: solicitudAccesoRouter } = await import(
  "../src/routes/solicitudAcceso.routes.js"
);

const app = express();
app.use(express.json());
app.use(solicitudAccesoRouter);

describe("HU-024: Solicitud Acceso Documento (routes)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST /documentos/:documentoId/solicitudes-acceso -> 201 crea solicitud", async () => {
    solicitudAccesoServiceMock.createSolicitud.mockResolvedValue({
      id: 10,
      estado_solicitud: "PENDIENTE",
    });

    const res = await request(app)
      .post("/documentos/7/solicitudes-acceso")
      .send({ justificacion: "Necesito acceso" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(10);
    expect(solicitudAccesoServiceMock.createSolicitud).toHaveBeenCalledWith({
      justificacion: "Necesito acceso",
      usuario_solicitante_id: 123,
      documento_id: 7,
    });
  });

  test("POST /documentos/:documentoId/solicitudes-acceso -> 400 BAD_REQUEST", async () => {
    const err = Object.assign(new Error("La justificación es obligatoria."), {
      code: "BAD_REQUEST",
    });
    solicitudAccesoServiceMock.createSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .post("/documentos/7/solicitudes-acceso")
      .send({ justificacion: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("BAD_REQUEST");
  });

  test("POST /documentos/:documentoId/solicitudes-acceso -> 403 FORBIDDEN", async () => {
    const err = Object.assign(new Error("Prohibido"), {
      code: "FORBIDDEN",
    });
    solicitudAccesoServiceMock.createSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .post("/documentos/7/solicitudes-acceso")
      .send({ justificacion: "abc" });

    expect(res.status).toBe(403);
  });

  test("POST /documentos/:documentoId/solicitudes-acceso -> 404 NOT_FOUND", async () => {
    const err = Object.assign(new Error("Documento no existe."), {
      code: "NOT_FOUND",
    });
    solicitudAccesoServiceMock.createSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .post("/documentos/99/solicitudes-acceso")
      .send({ justificacion: "abc" });

    expect(res.status).toBe(404);
  });

  test("POST /documentos/:documentoId/solicitudes-acceso -> 409 STATE_ERROR", async () => {
    const err = Object.assign(new Error("Solo se pueden solicitar documentos archivados."), {
      code: "STATE_ERROR",
    });
    solicitudAccesoServiceMock.createSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .post("/documentos/7/solicitudes-acceso")
      .send({ justificacion: "abc" });

    expect(res.status).toBe(409);
  });

  test("GET /mis-solicitudes-acceso -> 200 lista mis solicitudes", async () => {
    solicitudAccesoServiceMock.listMisSolicitudes.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const res = await request(app).get("/mis-solicitudes-acceso");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(solicitudAccesoServiceMock.listMisSolicitudes).toHaveBeenCalledWith(123);
  });

  test("GET /solicitudes-acceso -> 200 lista todas las solicitudes", async () => {
    solicitudAccesoServiceMock.listSolicitudes.mockResolvedValue([{ id: 1 }]);

    const res = await request(app).get("/solicitudes-acceso");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1 }]);
  });

  test("GET /solicitudes-acceso/:id -> 200 obtiene solicitud por id", async () => {
    solicitudAccesoServiceMock.getSolicitudById.mockResolvedValue({ id: 44 });

    const res = await request(app).get("/solicitudes-acceso/44");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(44);
    expect(solicitudAccesoServiceMock.getSolicitudById).toHaveBeenCalledWith(44);
  });

  test("GET /solicitudes-acceso/:id -> 404 cuando no existe", async () => {
    const err = Object.assign(new Error("La solicitud no existe."), {
      code: "NOT_FOUND",
    });
    solicitudAccesoServiceMock.getSolicitudById.mockRejectedValue(err);

    const res = await request(app).get("/solicitudes-acceso/44");

    expect(res.status).toBe(404);
  });

  test("PATCH /solicitudes-acceso/:id/resolver -> 200 resuelve solicitud", async () => {
    solicitudAccesoServiceMock.resolveSolicitud.mockResolvedValue({
      id: 44,
      estado_solicitud: "APROBADA",
    });

    const res = await request(app)
      .patch("/solicitudes-acceso/44/resolver")
      .set("User-Agent", "Mozilla/5.0 Test")
      .send({
        estado_solicitud: "APROBADA",
        motivo_resolucion: "Cumple requisitos",
      });

    expect(res.status).toBe(200);
    expect(res.body.estado_solicitud).toBe("APROBADA");
    expect(solicitudAccesoServiceMock.resolveSolicitud).toHaveBeenCalledWith({
      solicitud_id: 44,
      admin_responsable_id: 123,
      estado_solicitud: "APROBADA",
      motivo_resolucion: "Cumple requisitos",
      user_agent: "Mozilla/5.0 Test",
    });
  });

  test("PATCH /solicitudes-acceso/:id/resolver -> 400 BAD_REQUEST", async () => {
    const err = Object.assign(new Error("Motivo requerido"), {
      code: "BAD_REQUEST",
    });
    solicitudAccesoServiceMock.resolveSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .patch("/solicitudes-acceso/44/resolver")
      .send({
        estado_solicitud: "APROBADA",
        motivo_resolucion: "",
      });

    expect(res.status).toBe(400);
  });

  test("PATCH /solicitudes-acceso/:id/resolver -> 404 NOT_FOUND", async () => {
    const err = Object.assign(new Error("No existe"), {
      code: "NOT_FOUND",
    });
    solicitudAccesoServiceMock.resolveSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .patch("/solicitudes-acceso/44/resolver")
      .send({
        estado_solicitud: "APROBADA",
        motivo_resolucion: "abc",
      });

    expect(res.status).toBe(404);
  });

  test("PATCH /solicitudes-acceso/:id/resolver -> 409 STATE_ERROR", async () => {
    const err = Object.assign(new Error("Ya fue resuelta"), {
      code: "STATE_ERROR",
    });
    solicitudAccesoServiceMock.resolveSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .patch("/solicitudes-acceso/44/resolver")
      .send({
        estado_solicitud: "RECHAZADA",
        motivo_resolucion: "abc",
      });

    expect(res.status).toBe(409);
  });
});