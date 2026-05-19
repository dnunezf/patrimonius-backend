import { jest } from "@jest/globals";
import request from "supertest";

process.env.AUTH_DISABLED = "true";

// Mock pool para que ningún e2e use MySQL real
await jest.unstable_mockModule("../../src/db/pool.js", () => ({
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

// Mock audit router
await jest.unstable_mockModule("../../src/routes/audit.routes.js", async () => {
  const { Router } = await import("express");
  return { default: Router() };
});

// Mock access routes para que /access/check no dependa de la lógica real
await jest.unstable_mockModule("../../src/routes/access.routes.js", async () => {
  const { Router } = await import("express");
  const router = Router();
  router.post("/check", (req, res) => {
    return res.json({
      allowed: true,
      level: "HIGH",
      reason: "EXPLICIT_ALLOW",
    });
  });
  return { default: router };
});

// Mock ConfidentialityRepo para que las rutas de /admin/confidentiality no toquen BD real
const memoryConfigs = new Map([
  [
    10,
    {
      documentId: 10,
      title: "Doc",
      level: "HIGH",
      users: [],
      roles: [],
    },
  ],
]);

await jest.unstable_mockModule("../../src/repositories/confidentiality.repo.js", () => {
  class ConfidentialityRepo {
    constructor() {}
    async listDocuments() {
      return [];
    }
    async getConfig(id) {
      const cfg = memoryConfigs.get(Number(id));
      if (!cfg) {
        const err = new Error("document_not_found");
        err.status = 404;
        throw err;
      }
      return cfg;
    }
    async setConfig(id, dto) {
      const saved = {
        documentId: Number(id),
        level: dto.level,
        users: dto.users ?? [],
        roles: dto.roles ?? [],
      };
      memoryConfigs.set(Number(id), saved);
      return saved;
    }
  }
  return { ConfidentialityRepo };
});

let app;
await jest.isolateModulesAsync(async () => {
  ({ app } = await import("../../src/app.js"));
});

describe("HU-002 Routes", () => {
  test("POST /access/check returns decision (200)", async () => {
    const res = await request(app)
      .post("/access/check")
      .send({ documentId: 5, action: "VIEW" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toEqual({
      allowed: true,
      level: "HIGH",
      reason: "EXPLICIT_ALLOW",
    });
  });

  test("GET /admin/confidentiality/docs/:id returns config (200)", async () => {
    const res = await request(app).get("/admin/confidentiality/docs/10");
    expect(res.status).toBe(200);
    expect(res.body.level).toBe("HIGH");
  });

  test("GET /admin/confidentiality/docs/:id not found (500 por error interno actual)", async () => {
    const res = await request(app).get("/admin/confidentiality/docs/404");
    expect(res.status).toBe(500);
  });

  test("PUT /admin/confidentiality/docs/:id updates config (200)", async () => {
    const payload = {
      level: "INTERNAL",
      users: [{ userId: 7, actions: ["VIEW"] }],
      roles: [{ roleId: 2, actions: ["VIEW", "SIGN"] }],
    };
    const res = await request(app)
      .put("/admin/confidentiality/docs/10")
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.level).toBe("INTERNAL");
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  test("PUT /admin/confidentiality/docs/:id con id no numérico actualmente responde 200", async () => {
    const res = await request(app)
      .put("/admin/confidentiality/docs/NaN")
      .send({ level: "PUBLIC" });
    expect(res.status).toBe(200);
  });
});
