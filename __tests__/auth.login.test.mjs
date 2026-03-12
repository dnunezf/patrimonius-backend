import { jest } from "@jest/globals";
import request from "supertest";

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
    },
}));

// Mock jwtUtil para no depender de JWT_SECRET real
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

const { app } = await import("../src/app.js");
const { sendEmail } = await import("../src/utils/mailer.js");
const { userRepo } = await import("../src/repositories/userRepo.js");
const bcrypt = await import("bcryptjs");
const { jwtUtil } = await import("../src/utils/jwt.util.js");

describe("Auth routes (login + 2FA)", () => {
    beforeEach(() => jest.clearAllMocks());

    // ========== LOGIN TESTS ==========
    it("should send email with 2FA code if credentials are valid", async () => {
        userRepo.findByEmail.mockResolvedValue({
            id: 1,
            email: "test@patrimonius.com",
            passwordHash: await bcrypt.hash("secret", 10),
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

        // ✅ Validamos que el correo tenga un código de 6 dígitos
        expect(sendEmail).toHaveBeenCalledWith(
            "test@patrimonius.com",
            "Código de verificación – Sistema Patrimonius MNCR",
            expect.stringMatching(/(\d{6})/)
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
        });
        userRepo.save2FACode.mockResolvedValue(true);
        sendEmail.mockRejectedValue(new Error("SMTP error"));

        const res = await request(app)
            .post("/auth/login")
            .send({ email: "test@patrimonius.com", password: "secret" });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "server_error" });
    });

    // ========== VERIFY 2FA TESTS ==========
    it("should return JWT if 2FA code is valid", async () => {
        const fakeUser = {
            id: 10,
            email: "user@patrimonius.com",
            rolId: 1,
            unidadId: 1,
            last2FACode: "123456",
            last2FAExpiry: new Date(Date.now() + 60000), // válido
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
        expect(decoded).toMatchObject({ id: 10, email: "user@patrimonius.com" });
    });

    it("should return 401 if code is invalid", async () => {
        userRepo.findById.mockResolvedValue({
            id: 11,
            email: "user@patrimonius.com",
            last2FACode: "999999",
            last2FAExpiry: new Date(Date.now() + 60000),
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
            last2FAExpiry: new Date(Date.now() - 60000), // expirado
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
});

// ========== RESEND 2FA TESTS ==========
it("should resend a new 2FA code if user exists", async () => {
    userRepo.findById.mockResolvedValue({
        id: 20,
        email: "resend@patrimonius.com",
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
        expect.stringMatching(/(\d{6})/)
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
    });
    userRepo.save2FACode.mockResolvedValue(true);
    sendEmail.mockRejectedValue(new Error("SMTP error"));

    const res = await request(app)
        .post("/auth/resend-2fa")
        .send({ userId: 30 });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "server_error" });
});

