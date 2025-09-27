import { jest } from "@jest/globals";
import request from "supertest";

// Mock mailer
jest.unstable_mockModule("../src/utils/mailer.js", () => ({
    sendEmail: jest.fn(),
}));

// Mock userRepo
jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
    userRepo: {
        findByEmail: jest.fn(),
        save2FACode: jest.fn(),
        findById: jest.fn(),
        clear2FACode: jest.fn(),
    },
}));

const { app } = await import("../src/app.js");
const { sendEmail } = await import("../src/utils/mailer.js");
const { userRepo } = await import("../src/repositories/userRepo.js");
const bcrypt = await import("bcryptjs");
const { jwtUtil } = await import("../src/utils/jwt.util.js");

describe("Auth routes (2FA)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ========== LOGIN TESTS ==========
    it("should send email with 2FA code if credentials are valid", async () => {
        userRepo.findByEmail.mockResolvedValue({
            id: 1,
            email: "test@patrimonius.com",
            password: await bcrypt.hash("secret", 10),
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

        // ✅ Cambiado: ahora validamos que el texto contenga un código de 6 dígitos
        expect(sendEmail).toHaveBeenCalledWith(
            "test@patrimonius.com",
            "Código de verificación Patrimonius",
            expect.stringMatching(/(\d{6})/)
        );
    });

    it("should return 401 if user not found", async () => {
        userRepo.findByEmail.mockResolvedValue(null);

        const res = await request(app)
            .post("/auth/login")
            .send({ email: "notfound@patrimonius.com", password: "secret" });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "Usuario no encontrado" });
    });

    it("should return 401 if password is invalid", async () => {
        userRepo.findByEmail.mockResolvedValue({
            id: 2,
            email: "test@patrimonius.com",
            password: await bcrypt.hash("otherpass", 10), // distinto
        });

        const res = await request(app)
            .post("/auth/login")
            .send({ email: "test@patrimonius.com", password: "secret" });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "Credenciales inválidas" });
    });

    it("should return 500 if sendEmail throws", async () => {
        userRepo.findByEmail.mockResolvedValue({
            id: 3,
            email: "test@patrimonius.com",
            password: await bcrypt.hash("secret", 10),
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
            last2FAExpiry: new Date(Date.now() + 60000), // aún válido
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
            last2FAExpiry: new Date(Date.now() - 60000), // ya expirado
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
