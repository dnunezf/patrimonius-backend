import { jest } from "@jest/globals";
import request from "supertest";
import express from "express";


//Hay varios tests que se fuerzan a dar errores, como senEmail o userRepo.findByID
//con la siguiente funcion oculta esos errores
let consoleErrorSpy;

beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    consoleErrorSpy.mockRestore();
});
// Mock pool para que NINGÚN test use la BD real
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

// Mock bcryptjs
await jest.unstable_mockModule("bcryptjs", () => ({
    default: {
        hash: jest.fn(async (value) => `hashed:${value}`),
        compare: jest.fn(async (plain, hashed) => hashed === `hashed:${plain}`),
    },
}));

// Mock mailer
await jest.unstable_mockModule("../src/utils/mailer.js", () => ({
    sendEmail: jest.fn(),
}));

// Mock userRepo
await jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
    userRepo: {
        findByEmail: jest.fn(),
        save2FACode: jest.fn(),
        findById: jest.fn(),
        clear2FACode: jest.fn(),
        update: jest.fn(),
    },
}));

// Mock bitácora
await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: {
        logSecurityEvent: jest.fn(async () => true),
        insertBase: jest.fn(async () => 1),
        insertCiclo: jest.fn(async () => true),
        insertActividad: jest.fn(async () => true),
    },
    logAdminAction: jest.fn(async () => true),
    logSecurityEvent: jest.fn(async () => true),
}));

// Mock refresh token repo
await jest.unstable_mockModule("../src/repositories/refreshTokenRepo.js", () => ({
    refreshTokenRepo: {
        create: jest.fn(async () => true),
        findValidByHash: jest.fn(async () => null),
        revokeByHash: jest.fn(async () => true),
    },
}));

// Mock master config
await jest.unstable_mockModule("../src/config/master.config.js", () => ({
    masterConfig: {
        enabled: false,
        email: "",
        password: "",
        rolId: 1,
        unidadId: 1,
    },
    safeEqual: (a, b) => String(a) === String(b),
}));

// Mock refresh token utils
await jest.unstable_mockModule("../src/utils/refreshToken.util.js", () => ({
    generateRefreshToken: () => "mock-refresh-token",
    hashRefreshToken: (token) => `hash:${token}`,
}));

// Mock jwtUtil
await jest.unstable_mockModule("../src/utils/jwt.util.js", () => ({
    jwtUtil: {
        sign: (payload) =>
            Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
        verify: (token) =>
            JSON.parse(Buffer.from(token, "base64").toString("utf8")),
        decode: (token) =>
            JSON.parse(Buffer.from(token, "base64").toString("utf8")),
    },
}));

let app;
let sendEmail;
let userRepo;
let jwtUtil;
let bcrypt;

await jest.isolateModulesAsync(async () => {
    const authRoutes = (await import("../src/routes/auth.routes.js")).default;
    ({ sendEmail } = await import("../src/utils/mailer.js"));
    ({ userRepo } = await import("../src/repositories/userRepo.js"));
    ({ jwtUtil } = await import("../src/utils/jwt.util.js"));
    bcrypt = (await import("bcryptjs")).default;

    app = express();
    app.use(express.json());
    app.use("/auth", authRoutes);
});

describe("Auth routes (login + 2FA)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should send email with 2FA code if credentials are valid", async () => {
        userRepo.findByEmail.mockResolvedValue({
            id: 1,
            email: "test@patrimonius.com",
            passwordHash: await bcrypt.hash("secret", 10),
            activo: 1,
        });
        userRepo.save2FACode.mockResolvedValue(true);
        sendEmail.mockResolvedValue({ messageId: "mocked-id" });

        const res = await request(app)
            .post("/auth/login")
            .send({ email: "test@patrimonius.com", password: "secret" });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("message");
        expect(res.body).toHaveProperty("userId", 1);

        expect(userRepo.findByEmail).toHaveBeenCalledWith("test@patrimonius.com");
        expect(userRepo.save2FACode).toHaveBeenCalled();
        expect(sendEmail).toHaveBeenCalledWith(
            "test@patrimonius.com",
            "Código de verificación – Sistema Patrimonius MNCR",
            expect.stringMatching(/(\d{6})/),
        );
    });

    it("should return 401 if user not found", async () => {
        userRepo.findByEmail.mockResolvedValue(null);

        const res = await request(app)
            .post("/auth/login")
            .send({ email: "notfound@patrimonius.com", password: "secret" });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "Usuario o contraseña incorrectos" });
    });

    it("should return 401 if password is invalid", async () => {
        userRepo.findByEmail.mockResolvedValue({
            id: 2,
            email: "test@patrimonius.com",
            passwordHash: await bcrypt.hash("otherpass", 10),
            activo: 1,
        });

        const res = await request(app)
            .post("/auth/login")
            .send({ email: "test@patrimonius.com", password: "secret" });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "Usuario o contraseña incorrectos" });
    });

    it("should return 500 if sendEmail throws", async () => {
        userRepo.findByEmail.mockResolvedValue({
            id: 3,
            email: "test@patrimonius.com",
            passwordHash: await bcrypt.hash("secret", 10),
            activo: 1,
        });
        userRepo.save2FACode.mockResolvedValue(true);
        sendEmail.mockRejectedValue(new Error("SMTP error"));

        const res = await request(app)
            .post("/auth/login")
            .send({ email: "test@patrimonius.com", password: "secret" });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "server_error" });
    });

    it("should return JWT if 2FA code is valid", async () => {
        const fakeUser = {
            id: 10,
            email: "user@patrimonius.com",
            rolId: 1,
            unidadId: 1,
            rolIds: [1],
            roles: ["ADMINISTRADOR"],
            rol: "ADMINISTRADOR",
            last2FACode: "123456",
            last2FAExpiry: new Date(Date.now() + 60000),
            activo: 1,
        };

        userRepo.findById.mockResolvedValue(fakeUser);
        userRepo.clear2FACode.mockResolvedValue(true);

        const res = await request(app)
            .post("/auth/verify-2fa")
            .send({ userId: 10, code: "123456" });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("token");
        expect(res.body).toHaveProperty("user");

        const decoded = jwtUtil.decode(res.body.token);
        expect(decoded).toMatchObject({
            id: 10,
            email: "user@patrimonius.com",
        });
    });

    it("should return 401 if code is invalid", async () => {
        userRepo.findById.mockResolvedValue({
            id: 11,
            email: "user@patrimonius.com",
            last2FACode: "999999",
            last2FAExpiry: new Date(Date.now() + 60000),
            activo: 1,
        });

        const res = await request(app)
            .post("/auth/verify-2fa")
            .send({ userId: 11, code: "123456" });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "Código inválido o vencido" });
    });

    it("should return 401 if code is expired", async () => {
        userRepo.findById.mockResolvedValue({
            id: 12,
            email: "user@patrimonius.com",
            last2FACode: "123456",
            last2FAExpiry: new Date(Date.now() - 60000),
            activo: 1,
        });

        const res = await request(app)
            .post("/auth/verify-2fa")
            .send({ userId: 12, code: "123456" });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "Código inválido o vencido" });
    });

    it("should return 500 if service throws", async () => {
        userRepo.findById.mockRejectedValue(new Error("DB error"));

        const res = await request(app)
            .post("/auth/verify-2fa")
            .send({ userId: 99, code: "000000" });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "server_error" });
    });

    it("should resend a new 2FA code if user exists", async () => {
        userRepo.findById.mockResolvedValue({
            id: 20,
            email: "resend@patrimonius.com",
            activo: 1,
        });
        userRepo.save2FACode.mockResolvedValue(true);
        sendEmail.mockResolvedValue({ messageId: "mocked-resend" });

        const res = await request(app)
            .post("/auth/resend-2fa")
            .send({ userId: 20 });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            message:
                "Se ha generado y enviado un nuevo código de verificación a su correo electrónico. El código anterior ha quedado invalidado.",
        });

        expect(userRepo.findById).toHaveBeenCalledWith(20);
        expect(userRepo.save2FACode).toHaveBeenCalled();
        expect(sendEmail).toHaveBeenCalledWith(
            "resend@patrimonius.com",
            "Nuevo código de verificación – Sistema Patrimonius MNCR",
            expect.stringMatching(/(\d{6})/),
        );
    });

    it("should return 400 if userId is missing", async () => {
        const res = await request(app).post("/auth/resend-2fa").send({});
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "invalid_request" });
    });

    it("should return 404 if user not found", async () => {
        userRepo.findById.mockResolvedValue(null);

        const res = await request(app)
            .post("/auth/resend-2fa")
            .send({ userId: 12345 });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "Usuario no encontrado" });
    });

    it("should return 500 if sendEmail fails", async () => {
        userRepo.findById.mockResolvedValue({
            id: 30,
            email: "fail@patrimonius.com",
            activo: 1,
        });
        userRepo.save2FACode.mockResolvedValue(true);
        sendEmail.mockRejectedValue(new Error("SMTP error"));

        const res = await request(app)
            .post("/auth/resend-2fa")
            .send({ userId: 30 });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "server_error" });
    });
});

