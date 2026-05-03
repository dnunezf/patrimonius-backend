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

await jest.unstable_mockModule("../src/services/userService.js", () => ({
  userService: {
    create: jest.fn(async (d) => ({ id: 1, ...d })),
    list: jest.fn(async () => [
      {
        id: 1,
        nombre: "Ana",
        apellido1: "Jiménez",
        email: "ana@museo.cr",
        rol: "Administrador",
        rolId: 1,
        unidad: "Junta Administrativa",
        unidadId: 1,
        editorPermissions: [],
      },
    ]),
    update: jest.fn(async (id, p) => ({ id, ...p })),
    remove: jest.fn(async () => {}),
  },
}));

let app, userService;

await jest.isolateModulesAsync(async () => {
  ({ app } = await import("../src/app.js"));
  ({ userService } = await import("../src/services/userService.js"));
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
    expect(userService.create).toHaveBeenCalledTimes(1);
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
    expect(userService.list).toHaveBeenCalledTimes(1);
  });

  test("PATCH /admin/users/:id updates user (200)", async () => {
    const res = await request(app)
      .patch("/admin/users/1")
      .send({ nombre: "Ana María" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(userService.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ nombre: "Ana María", id: 1 }),
      expect.any(Object)
    );
    expect(res.body.id).toBe(1);
  });

  test("DELETE /admin/users/:id soft-deactivates user (204)", async () => {
    const res = await request(app).delete("/admin/users/1");

    expect(res.status).toBe(204);
    expect(userService.remove).toHaveBeenCalledWith(1, expect.any(Object));
  });
});
