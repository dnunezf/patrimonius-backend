// __tests__/userService.unit.test.mjs
// Purpose: unit-test userService.create with multi-role support.
// Mocks now include userRepo.setRoles and userRepo.findById because
// the service syncs the pivot table and returns a hydrated user.

import { jest } from "@jest/globals";

await jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
  userRepo: {
    create: jest.fn(async (u) => ({ id: 10, ...u })),
    setRoles: jest.fn(async () => {}),
    setUpload: jest.fn(async () => {}),
    findById: jest.fn(async (id) => ({
      id,
      nombre: "Mock",
      apellido1: "User",
      apellido2: "",
      email: "mock@local",
      rolId: 2,
      rolIds: [2],
      unidadId: 3,
    })),
    findAll: jest.fn(async () => []),
    update: jest.fn(async () => ({ id: 10, rolId: 2, rolIds: [2] })),
    remove: jest.fn(async () => {}),
  },
}));

// Mock permRepo
await jest.unstable_mockModule("../src/repositories/permRepo.js", () => ({
  permRepo: {
    setForUser: jest.fn(async () => {}),
    getForUser: jest.fn(async () => ["EDIT"]), // default: editor gets EDIT
  },
}));

// Mock bitacora (no-op)
await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
  logAdminAction: jest.fn(async () => {}),
}));

const permModule = await import("../src/repositories/permRepo.js");
const repoModule = await import("../src/repositories/userRepo.js");

let userService;
await jest.isolateModulesAsync(async () => {
  ({ userService } = await import("../src/services/userService.js"));
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("userService (HU-001)", () => {
  const actor = { id: 1 };

  test("create applies editor permissions when rolId === 2", async () => {
    const res = await userService.create(
      {
        nombre: "Ana",
        apellido1: "Jiménez",
        email: "a@m.cr",
        rolId: 2, // primary = EDITOR
        unidadId: 3,
        editorPermissions: ["EDIT"],
      },
      actor
    );

    expect(res.id).toBe(10);
    expect(repoModule.userRepo.setRoles).toHaveBeenCalledWith(10, [2]); // pivot sync
    expect(Array.isArray(res.editorPermissions)).toBe(true);
    expect(res.editorPermissions).toContain("EDIT");
  });

  test("create does not apply editor permissions for non-editor roles", async () => {
    // Hydrate as non-editor (rolId 1) for this test
    repoModule.userRepo.findById.mockResolvedValueOnce({
      id: 10,
      nombre: "Luis",
      apellido1: "Mora",
      apellido2: "",
      email: "l@m.cr",
      rolId: 1,
      rolIds: [1],
      unidadId: 1,
    });
    // And permissions repo returns empty
    permModule.permRepo.getForUser.mockResolvedValueOnce([]);

    const res = await userService.create(
      {
        nombre: "Luis",
        apellido1: "Mora",
        email: "l@m.cr",
        rolId: 1, // NON editor
        unidadId: 1,
      },
      actor
    );

    expect(res.id).toBe(10);
    expect(repoModule.userRepo.setRoles).toHaveBeenCalledWith(10, [1]);
    expect(res.editorPermissions ?? []).toHaveLength(0);
  });
});
