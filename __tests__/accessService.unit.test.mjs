import { jest } from "@jest/globals";

// Mock low-level repo + audit logger
await jest.unstable_mockModule("../src/repositories/accessRepo.js", () => ({
  accessRepo: {
    getConfig: jest.fn(),
    setLevel: jest.fn(async () => {}),
    upsertUsers: jest.fn(async () => {}),
    upsertRoles: jest.fn(async () => {}),
    getLevel: jest.fn(),
    isUserExplicitlyAllowed: jest.fn(),
  },
}));

await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
  logAdminAction: jest.fn(async () => {}),
  logSecurityEvent: jest.fn(async () => {}),
}));

const { accessRepo } = await import("../src/repositories/accessRepo.js");
const bitacora = await import("../src/repositories/bitacoraRepo.js");

let accessService;
await jest.isolateModulesAsync(async () => {
  ({ accessService } = await import("../src/services/accessService.js"));
});

describe("HU-002 accessService", () => {
  const user = { id: 7, rolId: 2, email: "u@test" };

  test("PUBLIC document → allowed by default", async () => {
    accessRepo.getLevel.mockResolvedValueOnce("PUBLIC");
    const res = await accessService.checkAccess(
      { documentId: 5, action: "VIEW", user },
      "127.0.0.1",
      "ua"
    );
    expect(res.allowed).toBe(true);
    expect(res.level).toBe("PUBLIC");
    expect(bitacora.logSecurityEvent).not.toHaveBeenCalled();
  });

  test("HIGH document and user NOT explicitly allowed → denied and logged", async () => {
    accessRepo.getLevel.mockResolvedValueOnce("HIGH");
    accessRepo.isUserExplicitlyAllowed.mockResolvedValueOnce(false);

    const res = await accessService.checkAccess(
      { documentId: 9, action: "EDIT", user },
      "10.0.0.1",
      "ua"
    );
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("EXPLICIT_REQUIRED");
    expect(bitacora.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: user.id,
        tipo: "ACCESO_NO_AUTORIZADO",
        result: "DENIED",
      })
    );
  });

  test("RESTRICTED document and user explicitly allowed by role → allowed", async () => {
    accessRepo.getLevel.mockResolvedValueOnce("RESTRICTED");
    accessRepo.isUserExplicitlyAllowed.mockResolvedValueOnce(true);

    const res = await accessService.checkAccess(
      { documentId: 11, action: "SIGN", user },
      null,
      null
    );
    expect(res.allowed).toBe(true);
    expect(res.reason).toBe("EXPLICIT_ALLOW");
  });

  test("setDocumentConfig normalizes payload and audits", async () => {
    const actor = { id: 1 };
    await accessService.setDocumentConfig(
      15,
      {
        level: "INTERNAL",
        users: [{ userId: 7, actions: ["view", "VIEW"] }],
        roles: [{ roleId: 3, actions: [] }], // default to all actions
      },
      actor
    );
    expect(accessRepo.setLevel).toHaveBeenCalledWith(15, "INTERNAL");
    expect(accessRepo.upsertUsers).toHaveBeenCalledWith(15, [
      { userId: 7, actions: ["VIEW"] },
    ]);
    expect(accessRepo.upsertRoles).toHaveBeenCalledWith(15, [
      { roleId: 3, actions: ["VIEW", "EDIT", "SIGN"] },
    ]);
  });
});
