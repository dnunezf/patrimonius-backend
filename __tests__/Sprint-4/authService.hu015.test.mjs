import { jest } from "@jest/globals";

// Mocks de authRepo y bitácora
const mockAuthRepo = {
    findByEmail: jest.fn(),
    verifyPassword: jest.fn(),
};
const mockLogSecurityEvent = jest.fn(async () => {});

// Mockeamos antes de importar el servicio
await jest.unstable_mockModule("../../src/repositories/authRepo.js", () => ({
    authRepo: mockAuthRepo,
}));
await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
    logSecurityEvent: mockLogSecurityEvent,
}));

// Mock de jsonwebtoken para no depender de JWT_SECRET real
await jest.unstable_mockModule("jsonwebtoken", () => ({
    default: {
        sign: jest.fn(() => "mock-jwt-token"),
    },
}));

const { authService } = await import("../../src/services/authService.js");

describe("HU-015 Bitácora de acciones autorizadas y denegadas (authService.login)", () => {
    const ip = "127.0.0.1";
    const userAgent = "jest-test";

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("HU-015 debe registrar intento denegado cuando el usuario no existe", async () => {
        // SYSTEM user existe con id 999
        mockAuthRepo.findByEmail
            .mockResolvedValueOnce({ id: 999, email: "system@internal" }) // getSystemUserIdCached
            .mockResolvedValueOnce(null); // intento de login con usuario inexistente

        await expect(
            authService.login("notfound@museo.cr", "secret", ip, userAgent)
        ).rejects.toThrow("Usuario o contraseña incorrectos");

        expect(mockLogSecurityEvent).toHaveBeenCalledWith({
            actorId: 999,
            tipo: "FALLO_LOGIN",
            result: "FAIL",
            ip,
            userAgent,
            detail: {},
        });
    });

    test("HU-015 debe registrar intento denegado cuando la contraseña es incorrecta", async () => {
        const user = {
            id: 5,
            email: "editor@museo.cr",
            password: "hash",
            rol_id: 2,
            unidad_id: 1,
        };
        mockAuthRepo.findByEmail.mockResolvedValueOnce(user);
        mockAuthRepo.verifyPassword.mockResolvedValueOnce(false);

        await expect(
            authService.login("editor@museo.cr", "wrong-pass", ip, userAgent)
        ).rejects.toThrow("Usuario o contraseña incorrectos");

        expect(mockLogSecurityEvent).toHaveBeenCalledWith({
            actorId: 5,
            tipo: "FALLO_LOGIN",
            result: "FAIL",
            ip,
            userAgent,
            detail: {},
        });
    });

    test("HU-015 debe registrar login exitoso cuando la autenticación es correcta", async () => {
        const user = {
            id: 7,
            email: "admin@museo.cr",
            password: "hash",
            rol_id: 1,
            unidad_id: 1,
        };
        mockAuthRepo.findByEmail.mockResolvedValueOnce(user);
        mockAuthRepo.verifyPassword.mockResolvedValueOnce(true);

        const out = await authService.login("admin@museo.cr", "secret", ip, userAgent);

        // Retorna token y datos de usuario
        expect(out.token).toBe("mock-jwt-token");
        expect(out.user).toMatchObject({
            id: 7,
            email: "admin@museo.cr",
            rolId: 1,
            unidadId: 1,
        });

        // Debe registrar en bitácora el LOGIN OK
        expect(mockLogSecurityEvent).toHaveBeenCalledWith({
            actorId: 7,
            tipo: "LOGIN",
            result: "OK",
            ip,
            userAgent,
            detail: {},
        });
    });
});