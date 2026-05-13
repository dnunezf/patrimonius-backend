// __tests__/accessService.unit.test.mjs
import { jest } from "@jest/globals";

/**
 * Mock repository used by HU-002 service.
 * We only mock the methods needed by the tests.
 */
await jest.unstable_mockModule("../../src/repositories/accessRepo.js", () => ({
  accessRepo: {
    getConfig: jest.fn(async (documentId) => ({
      documentId,
      level: "INTERNAL",
      users: [],
      roles: [],
    })),
    documentExists: jest.fn(async () => true),
    usersExist: jest.fn(async () => true),
    rolesExist: jest.fn(async () => true),
    setLevel: jest.fn(async () => {}),
    upsertUsers: jest.fn(async () => {}),
    upsertRoles: jest.fn(async () => {}),
    getLevel: jest.fn(async () => "INTERNAL"),
    isUserExplicitlyAllowed: jest.fn(async () => true),
  },
}));

/**
 * Mock audit/security log functions used by the service.
 */
await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
  logAdminAction: jest.fn(async () => {}),
  logSecurityEvent: jest.fn(async () => {}),
}));

const repoModule = await import("../../src/repositories/accessRepo.js");
const bitacoraModule = await import("../../src/repositories/bitacoraRepo.js");

let accessService;
await jest.isolateModulesAsync(async () => {
  ({ accessService } = await import("../../src/services/accessService.js"));
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("accessService (HU-002)", () => {
  test("setDocumentConfig saves confidentiality level and allow-lists", async () => {
    const actor = { id: 1 };

    const result = await accessService.setDocumentConfig(
      5,
      {
        level: "INTERNAL",
        users: [{ userId: 2, actions: ["VIEW", "EDIT"] }],
        roles: [{ roleId: 3, actions: ["VIEW"] }],
      },
      actor,
    );

    expect(repoModule.accessRepo.documentExists).toHaveBeenCalledWith(5);
    expect(repoModule.accessRepo.setLevel).toHaveBeenCalledWith(5, "INTERNAL");
    expect(repoModule.accessRepo.upsertUsers).toHaveBeenCalledWith(5, [
      { userId: 2, actions: ["VIEW", "EDIT"] },
    ]);
    expect(repoModule.accessRepo.upsertRoles).toHaveBeenCalledWith(5, [
      { roleId: 3, actions: ["VIEW"] },
    ]);
    expect(bitacoraModule.logAdminAction).toHaveBeenCalled();
    expect(result.documentId).toBe(5);
  });

  test("checkAccess denies access when user is not explicitly authorized", async () => {
    repoModule.accessRepo.isUserExplicitlyAllowed.mockResolvedValueOnce(false);

    const result = await accessService.checkAccess(
      {
        documentId: 5,
        action: "VIEW",
        user: { id: 10, rolId: 2, rolIds: [2] },
      },
      "127.0.0.1",
      "jest-test",
    );

    expect(result).toEqual({
      allowed: false,
      level: "INTERNAL",
      reason: "EXPLICIT_REQUIRED",
    });

    expect(bitacoraModule.logSecurityEvent).toHaveBeenCalled();
  });
});
