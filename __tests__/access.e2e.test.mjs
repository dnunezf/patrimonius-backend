import { jest } from "@jest/globals";
import request from "supertest";

process.env.AUTH_DISABLED = "true";

// Mock audit router
await jest.unstable_mockModule("../src/routes/audit.routes.js", async () => {
  const { Router } = await import("express");
  return { default: Router() };
});

// Mock accessService for deterministic responses
await jest.unstable_mockModule("../src/services/accessService.js", () => ({
  accessService: {
    getDocumentConfig: jest.fn(async (id) =>
      id === 404
        ? null
        : { documentId: id, title: "Doc", level: "HIGH", users: [], roles: [] }
    ),
    setDocumentConfig: jest.fn(async (id, dto) => ({
      documentId: id,
      level: dto.level,
      users: dto.users ?? [],
      roles: dto.roles ?? [],
    })),
    checkAccess: jest.fn(async () => ({
      allowed: true,
      level: "HIGH",
      reason: "EXPLICIT_ALLOW",
    })),
  },
}));

let app;
await jest.isolateModulesAsync(async () => {
  ({ app } = await import("../src/app.js"));
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

  test("GET /admin/confidentiality/docs/:id not found (404)", async () => {
    const res = await request(app).get("/admin/confidentiality/docs/404");
    expect(res.status).toBe(404);
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

  test("PUT /admin/confidentiality/docs/:id validates id (400)", async () => {
    const res = await request(app)
      .put("/admin/confidentiality/docs/NaN")
      .send({ level: "PUBLIC" });
    expect(res.status).toBe(400);
  });
});
