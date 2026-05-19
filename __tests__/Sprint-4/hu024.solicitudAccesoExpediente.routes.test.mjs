import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const solicitudAccesoExpedienteServiceMock = {
  createSolicitud: jest.fn(),
  listMisSolicitudes: jest.fn(),
  listSolicitudes: jest.fn(),
  getSolicitudById: jest.fn(),
  resolveSolicitud: jest.fn(),
};

await jest.unstable_mockModule("../../src/services/solicitudAccesoExpediente.service.js", () => ({
  solicitudAccesoExpedienteService: solicitudAccesoExpedienteServiceMock,
}));

await jest.unstable_mockModule("../../src/middleware/authGuard.js", () => ({
  authGuard: (req, _res, next) => {
    req.user = { id: 123, nombre: "Admin" };
    next();
  },
}));

await jest.unstable_mockModule("../../src/middleware/adminGuard.js", () => ({
  adminGuard: (_req, _res, next) => next(),
}));

const { default: solicitudAccesoExpedienteRouter } = await import(
  "../../src/routes/solicitudAccesoExpediente.routes.js"
);

const app = express();
app.use(express.json());
app.use(solicitudAccesoExpedienteRouter);

describe("HU-024: Solicitud Acceso Expediente (routes)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST /expedientes/:expedienteId/solicitudes-acceso -> 201 crea solicitud", async () => {
    solicitudAccesoExpedienteServiceMock.createSolicitud.mockResolvedValue({
      id: 10,
      estado_solicitud: "PENDIENTE",
    });

    const res = await request(app)
      .post("/expedientes/7/solicitudes-acceso")
      .send({ justificacion: "Necesito acceso al expediente" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(10);
    expect(solicitudAccesoExpedienteServiceMock.createSolicitud).toHaveBeenCalledWith({
      justificacion: "Necesito acceso al expediente",
      usuario_solicitante_id: 123,
      expediente_id: 7,
    });
  });

  test("POST /expedientes/:expedienteId/solicitudes-acceso -> 400 BAD_REQUEST", async () => {
    const err = Object.assign(new Error("La justificación es obligatoria."), {
      code: "BAD_REQUEST",
    });
    solicitudAccesoExpedienteServiceMock.createSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .post("/expedientes/7/solicitudes-acceso")
      .send({ justificacion: "" });

    expect(res.status).toBe(400);
  });

  test("POST /expedientes/:expedienteId/solicitudes-acceso -> 404 NOT_FOUND", async () => {
    const err = Object.assign(new Error("El expediente no existe."), {
      code: "NOT_FOUND",
    });
    solicitudAccesoExpedienteServiceMock.createSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .post("/expedientes/99/solicitudes-acceso")
      .send({ justificacion: "abc" });

    expect(res.status).toBe(404);
  });

  test("POST /expedientes/:expedienteId/solicitudes-acceso -> 409 CONFLICT", async () => {
    const err = Object.assign(new Error("Ya existe una solicitud pendiente para este expediente."), {
      code: "CONFLICT",
    });
    solicitudAccesoExpedienteServiceMock.createSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .post("/expedientes/7/solicitudes-acceso")
      .send({ justificacion: "abc" });

    expect(res.status).toBe(409);
  });

  test("GET /mis-solicitudes-acceso-expediente -> 200 lista mis solicitudes", async () => {
    solicitudAccesoExpedienteServiceMock.listMisSolicitudes.mockResolvedValue([{ id: 1 }]);

    const res = await request(app).get("/mis-solicitudes-acceso-expediente");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1 }]);
    expect(solicitudAccesoExpedienteServiceMock.listMisSolicitudes).toHaveBeenCalledWith(123);
  });

  test("GET /solicitudes-acceso-expediente -> 200 lista todas", async () => {
    solicitudAccesoExpedienteServiceMock.listSolicitudes.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const res = await request(app).get("/solicitudes-acceso-expediente");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test("GET /solicitudes-acceso-expediente/:id -> 200 obtiene por id", async () => {
    solicitudAccesoExpedienteServiceMock.getSolicitudById.mockResolvedValue({ id: 22 });

    const res = await request(app).get("/solicitudes-acceso-expediente/22");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(22);
    expect(solicitudAccesoExpedienteServiceMock.getSolicitudById).toHaveBeenCalledWith(22);
  });

  test("GET /solicitudes-acceso-expediente/:id -> 404 si no existe", async () => {
    const err = Object.assign(new Error("La solicitud no existe."), {
      code: "NOT_FOUND",
    });
    solicitudAccesoExpedienteServiceMock.getSolicitudById.mockRejectedValue(err);

    const res = await request(app).get("/solicitudes-acceso-expediente/22");

    expect(res.status).toBe(404);
  });

  test("PATCH /solicitudes-acceso-expediente/:id/resolver -> 200 resuelve solicitud", async () => {
    solicitudAccesoExpedienteServiceMock.resolveSolicitud.mockResolvedValue({
      id: 22,
      estado_solicitud: "APROBADA",
    });

    const res = await request(app)
      .patch("/solicitudes-acceso-expediente/22/resolver")
      .send({
        estado_solicitud: "APROBADA",
        motivo_resolucion: "Cumple requisitos",
      });

    expect(res.status).toBe(200);
    expect(res.body.estado_solicitud).toBe("APROBADA");
    expect(solicitudAccesoExpedienteServiceMock.resolveSolicitud).toHaveBeenCalledWith({
      solicitud_id: 22,
      admin_responsable_id: 123,
      estado_solicitud: "APROBADA",
      motivo_resolucion: "Cumple requisitos",
    });
  });

  test("PATCH /solicitudes-acceso-expediente/:id/resolver -> 400 BAD_REQUEST", async () => {
    const err = Object.assign(new Error("Motivo requerido"), {
      code: "BAD_REQUEST",
    });
    solicitudAccesoExpedienteServiceMock.resolveSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .patch("/solicitudes-acceso-expediente/22/resolver")
      .send({
        estado_solicitud: "APROBADA",
        motivo_resolucion: "",
      });

    expect(res.status).toBe(400);
  });

  test("PATCH /solicitudes-acceso-expediente/:id/resolver -> 404 NOT_FOUND", async () => {
    const err = Object.assign(new Error("No existe"), {
      code: "NOT_FOUND",
    });
    solicitudAccesoExpedienteServiceMock.resolveSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .patch("/solicitudes-acceso-expediente/22/resolver")
      .send({
        estado_solicitud: "APROBADA",
        motivo_resolucion: "abc",
      });

    expect(res.status).toBe(404);
  });

  test("PATCH /solicitudes-acceso-expediente/:id/resolver -> 409 STATE_ERROR", async () => {
    const err = Object.assign(new Error("Ya fue resuelta"), {
      code: "STATE_ERROR",
    });
    solicitudAccesoExpedienteServiceMock.resolveSolicitud.mockRejectedValue(err);

    const res = await request(app)
      .patch("/solicitudes-acceso-expediente/22/resolver")
      .send({
        estado_solicitud: "RECHAZADA",
        motivo_resolucion: "abc",
      });

    expect(res.status).toBe(409);
  });
});