import { jest } from "@jest/globals";
import request from "supertest";
import express from "express";

// Mock pool para evitar conexión real a MySQL
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

// Mock bcryptjs
await jest.unstable_mockModule("bcryptjs", () => ({
    default: {
        hash: jest.fn(async (value) => `hashed:${value}`),
        compare: jest.fn(async (plain, hashed) => hashed === `hashed:${plain}`),
    },
}));

// Mock userRepo
await jest.unstable_mockModule("../../src/repositories/userRepo.js", () => ({
    userRepo: {
        findById: jest.fn(),
        update: jest.fn(),
        findByEmail: jest.fn(),
        save2FACode: jest.fn(),
        clear2FACode: jest.fn(),
    },
}));

// Mock jwtUtil
await jest.unstable_mockModule("../../src/utils/jwt.util.js", () => ({
    jwtUtil: {
        verify: jest.fn(),
        sign: jest.fn((payload) =>
            Buffer.from(JSON.stringify(payload), "utf8").toString("base64")
        ),
        decode: jest.fn((token) =>
            JSON.parse(Buffer.from(token, "base64").toString("utf8"))
        ),
    },
}));

// Mock bitácora
await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: {
        logSecurityEvent: jest.fn(async () => true),
        insertBase: jest.fn(async () => 1),
        insertCiclo: jest.fn(async () => true),
        insertActividad: jest.fn(async () => true),
    },
    logAdminAction: jest.fn(async () => true),
    logSecurityEvent: jest.fn(async () => true),
}));

// Mock mailer
await jest.unstable_mockModule("../../src/utils/mailer.js", () => ({
    sendEmail: jest.fn(),
}));

// Mock master config
await jest.unstable_mockModule("../../src/config/master.config.js", () => ({
    masterConfig: {
        enabled: false,
        email: "",
        password: "",
        rolId: 1,
        unidadId: 1,
    },
    safeEqual: (a, b) => String(a) === String(b),
}));

// Mock refresh token repo
await jest.unstable_mockModule("../../src/repositories/refreshTokenRepo.js", () => ({
    refreshTokenRepo: {
        create: jest.fn(async () => true),
        findValidByHash: jest.fn(async () => null),
        revokeByHash: jest.fn(async () => true),
    },
}));

// Mock refresh token utils
await jest.unstable_mockModule("../../src/utils/refreshToken.util.js", () => ({
    generateRefreshToken: () => "mock-refresh-token",
    hashRefreshToken: (token) => `hash:${token}`,
}));

let app;
let userRepo;
let jwtUtil;

await jest.isolateModulesAsync(async () => {
    const authRoutes = (await import("../../src/routes/auth.routes.js")).default;
    ({ userRepo } = await import("../../src/repositories/userRepo.js"));
    ({ jwtUtil } = await import("../../src/utils/jwt.util.js"));

    app = express();
    app.use(express.json());
    app.use("/auth", authRoutes);
});

describe("POST /auth/activate", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        console.error.mockRestore();
    });

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
            }),
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
        jwtUtil.verify.mockImplementation(() => {
            throw new Error("invalid token");
        });

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
