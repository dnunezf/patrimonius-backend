import { jest } from "@jest/globals";
import request from "supertest";

// Mock pool para evitar conexión real a MySQL
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

// Mock userRepo
await jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
    userRepo: {
        findById: jest.fn(),
        update: jest.fn(),
    },
}));

// Mock jwtUtil
await jest.unstable_mockModule("../src/utils/jwt.util.js", () => ({
    jwtUtil: {
        verify: jest.fn(),
    },
}));

const { app } = await import("../src/app.js");
const { userRepo } = await import("../src/repositories/userRepo.js");
const { jwtUtil } = await import("../src/utils/jwt.util.js");

describe("POST /auth/activate", () => {
    beforeEach(() => jest.clearAllMocks());

    it("should activate account if token and password are valid", async () => {
        jwtUtil.verify.mockReturnValue({ id: 1, action: "activate" });

        userRepo.findById.mockResolvedValue({
            id: 1,
            email: "user@test.com",
            mustChangePassword: true,
        });

        userRepo.update.mockResolvedValue(true);

        const res = await request(app)
            .post("/auth/activate")
            .send({ token: "fake-token", newPassword: "MyNewPass123" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            message:
                "Su cuenta ha sido activada correctamente. Ya puede iniciar sesión en el Sistema Patrimonius del Museo Nacional de Costa Rica.",
        });

        expect(jwtUtil.verify).toHaveBeenCalledWith("fake-token");
        expect(userRepo.findById).toHaveBeenCalledWith(1);
        expect(userRepo.update).toHaveBeenCalledWith(
            1,
            expect.objectContaining({
                password: expect.any(String),
                mustChangePassword: false,
            })
        );
    });

    it("should return 400 if token is missing", async () => {
        const res = await request(app)
            .post("/auth/activate")
            .send({ newPassword: "abc123" });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "invalid_request" });
    });

    it("should return 400 if token is invalid", async () => {
        jwtUtil.verify.mockReturnValue(null);

        const res = await request(app)
            .post("/auth/activate")
            .send({ token: "invalid", newPassword: "MyNewPass123" });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "invalid_token" });
    });

    it("should return 400 if mustChangePassword is false", async () => {
        jwtUtil.verify.mockReturnValue({ id: 2, action: "activate" });

        userRepo.findById.mockResolvedValue({
            id: 2,
            email: "x@test.com",
            mustChangePassword: false,
        });

        const res = await request(app)
            .post("/auth/activate")
            .send({ token: "valid", newPassword: "MyNewPass123" });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "already_activated" });
    });

    it("should return 500 if repo throws", async () => {
        jwtUtil.verify.mockReturnValue({ id: 3, action: "activate" });
        userRepo.findById.mockRejectedValue(new Error("DB error"));

        const res = await request(app)
            .post("/auth/activate")
            .send({ token: "valid", newPassword: "MyNewPass123" });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "server_error" });
    });
});
