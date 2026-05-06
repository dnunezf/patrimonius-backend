// __tests__/permissions.routes.test.mjs
import { jest } from "@jest/globals";
import request from "supertest";

// Mock pool para que las rutas no usen BD real
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

await jest.unstable_mockModule("../src/middleware/authGuard.js", () => ({
    authGuard: (req, _res, next) => {
        req.user = { id: 1, rolId: 1, role: "ADMINISTRADOR" };
        req.actor = { id: 1, rolId: 1, role: "ADMINISTRADOR", isMaster: true };
        next();
    },
}));

await jest.unstable_mockModule("../src/middleware/adminGuard.js", () => ({
    adminGuard: (req, _res, next) => {
        req.actor = { id: 1, rolId: 1, role: "ADMINISTRADOR", isMaster: true };
        next();
    },
}));

await jest.unstable_mockModule("../src/services/accessException.service.js", () => ({
    accessExceptionService: {
        apply: jest.fn(),
        list: jest.fn(),
        remove: jest.fn(),
    },
}));

let app, accessExceptionService;

await jest.isolateModulesAsync(async () => {
    ({ app } = await import("../src/app.js"));
    ({ accessExceptionService } = await import("../src/services/accessException.service.js"));
});

describe("Permissions Exceptions API (HU-005)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("POST /permissions/exceptions -> 201", async () => {
        accessExceptionService.apply.mockResolvedValue({
            userId: 1,
            documentId: 2,
            permissions: ["VIEW"],
        });

        const res = await request(app).post("/permissions/exceptions").send({
            userId: 1,
            documentId: 2,
            permissions: ["VIEW"],
            reason: "caso",
        });

        expect(res.status).toBe(201);
        expect(accessExceptionService.apply).toHaveBeenCalledWith(
            { userId: 1, documentId: 2, permissions: ["VIEW"], reason: "caso" },
            expect.objectContaining({ id: 1 }),
            expect.any(Object),
        );
    });

    test("GET /permissions/exceptions -> 200", async () => {
        accessExceptionService.list.mockResolvedValue([
            { userId: 1, documentId: 2, permissions: "EDIT,VIEW" },
        ]);

        const res = await request(app).get("/permissions/exceptions");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test("DELETE /permissions/exceptions -> 204", async () => {
        accessExceptionService.remove.mockResolvedValue();

        const res = await request(app)
            .delete("/permissions/exceptions")
            .send({ userId: 1, documentId: 2, reason: "fin" });

        expect(res.status).toBe(204);
        expect(accessExceptionService.remove).toHaveBeenCalledWith(
            { userId: 1, documentId: 2, reason: "fin" },
            expect.objectContaining({ id: 1 }),
            expect.any(Object),
        );
    });

    test("POST valida 400 cuando service lanza code=400", async () => {
        accessExceptionService.apply.mockRejectedValue(
            Object.assign(new Error("reason is required"), { code: 400 }),
        );

        const res = await request(app)
            .post("/permissions/exceptions")
            .send({ userId: 1, documentId: 2 });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe(400);
    });
});
