import { jest } from "@jest/globals";
import request from "supertest";

process.env.AUTH_DISABLED = "true";

// Mock pool para que el e2e no use MySQL real
await jest.unstable_mockModule("../src/db/pool.js", () => ({
  pool: {
    query: jest.fn(async () => [[], []]),
    execute: jest.fn(async () => [[], []]),
    getConnection: jest.fn(async () => ({
      query: jest.fn(async () => [[], []]),
      execute: jest.fn(async () => [[], []]),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    })),
  },
}));

// Mock mailer para no enviar correos reales
await jest.unstable_mockModule("../src/utils/mailer.js", () => ({
  sendEmail: jest.fn(async () => ({ messageId: "mock-id" })),
}));

// Mock out the audit routes so importing app doesn't require extra deps
await jest.unstable_mockModule("../src/routes/audit.routes.js", async () => {
  const { Router } = await import("express");
  // Return an empty router to satisfy app mounting
  return { default: Router() };
});

// Mock jwtUtil para no requerir JWT_SECRET real
await jest.unstable_mockModule("../src/utils/jwt.util.js", () => ({
  jwtUtil: {
    sign: () => "mock-token",
    verify: () => ({}),
    decode: () => ({}),
  },
}));

const listRow = {
  id: 1,
  nombre: "Ana",
  apellido1: "Jiménez",
  email: "ana@museo.cr",
  rol: "Administrador",
  rolId: 1,
  unidad: "Junta Administrativa",
  unidadId: 1,
  editorPermissions: [],
};

/** Referencias estables: el factory de unstable_mockModule puede evaluarse más de una vez. */
const userServiceMock = {
  create: jest.fn(async (d) => ({ id: 1, ...d })),
  list: jest.fn(async () => [listRow]),
  search: jest.fn(async () => [listRow]),
  update: jest.fn(async (id, p) => ({ id, ...p })),
  remove: jest.fn(async () => {}),
};

await jest.unstable_mockModule("../src/services/userService.js", () => ({
  userService: userServiceMock,
}));

let app;

await jest.isolateModulesAsync(async () => {
  ({ app } = await import("../src/app.js"));
});

describe("HU-001 Admin Users API", () => {
  test("POST /admin/users creates user (201)", async () => {
    const payload = {
      nombre: "Ana",
      apellido1: "Jimenez",
      email: "ana@museo.cr",
      rolId: 1,
      unidadId: 1,
      editorPermissions: ["EDIT"],
    };
    const res = await request(app).post("/admin/users").send(payload);

    expect(res.status).toBe(201);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(userServiceMock.create).toHaveBeenCalledTimes(1);
    expect(res.body.user.id).toBe(1);
    expect(res.body.user.nombre).toBe("Ana");
    expect(typeof res.body.message).toBe("string");
  });

  test("GET /admin/users lists users (200)", async () => {
    const res = await request(app).get("/admin/users");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].nombre).toBe("Ana");
    expect(userServiceMock.list).toHaveBeenCalledTimes(1);
  });

  test("PATCH /admin/users/:id updates user (200)", async () => {
    const res = await request(app)
      .patch("/admin/users/1")
      .send({ nombre: "Ana María" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(userServiceMock.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ nombre: "Ana María", id: 1 }),
      expect.any(Object)
    );
    expect(res.body.id).toBe(1);
  });

  test("GET /users/signers lists users for signing flow (200)", async () => {
    // La ruta filtra por rolIds.includes(2); sin rolIds el handler lanza y responde 500.
    userServiceMock.list.mockResolvedValueOnce([
      { ...listRow, rolId: 2, rolIds: [2] },
    ]);

    const res = await request(app).get("/users/signers");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(userServiceMock.list).toHaveBeenCalled();
  });
});
