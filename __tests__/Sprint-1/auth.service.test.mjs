import { jest } from "@jest/globals";

jest.unstable_mockModule("../../src/repositories/authRepo.js", () => ({
    authRepo: {
        findByEmail: jest.fn(),
        verifyPassword: jest.fn(),
    },
}));

jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
    logSecurityEvent: jest.fn(),
}));

const { authRepo } = await import("../../src/repositories/authRepo.js");
const { logSecurityEvent } = await import("../../src/repositories/bitacoraRepo.js");
const { authService } = await import("../../src/services/authService.js");

describe("authService.login", () => {
    beforeEach(() => jest.clearAllMocks());

    it("should return token and user if credentials are valid", async () => {
        authRepo.findByEmail.mockResolvedValue({
            id: 1,
            email: "ok@patrimonius.com",
            password: "hashedpass",
            rol_id: 2,
            unidad_id: 3,
        });
        authRepo.verifyPassword.mockResolvedValue(true);

        const res = await authService.login(
            "ok@patrimonius.com",
            "secret",
            "127.0.0.1",
            "jest-agent"
        );

        expect(res).toHaveProperty("token");
        expect(res.user).toMatchObject({
            id: 1,
            email: "ok@patrimonius.com",
            rolId: 2,
            unidadId: 3,
        });
        expect(logSecurityEvent).toHaveBeenCalledWith(
            expect.objectContaining({ actorId: 1, tipo: "LOGIN", result: "OK" })
        );
    });

    it("should throw if user not found", async () => {
        authRepo.findByEmail.mockResolvedValue(null);

        await expect(
            authService.login("none@x.com", "secret", "1.1.1.1", "ua")
        ).rejects.toThrow("Usuario o contraseña incorrectos");

        expect(logSecurityEvent).toHaveBeenCalledWith(
            expect.objectContaining({ result: "FAIL", tipo: "LOGIN" })
        );
    });

    it("should throw if password invalid", async () => {
        authRepo.findByEmail.mockResolvedValue({
            id: 2,
            email: "bad@x.com",
            password: "hashed",
            rol_id: 1,
            unidad_id: 1,
        });
        authRepo.verifyPassword.mockResolvedValue(false);

        await expect(
            authService.login("bad@x.com", "wrong", "ip", "ua")
        ).rejects.toThrow("Usuario o contraseña incorrectos");

        expect(logSecurityEvent).toHaveBeenCalledWith(
            expect.objectContaining({ actorId: 2, tipo: "FALLO_LOGIN", result: "FAIL" })
        );
    });
});
