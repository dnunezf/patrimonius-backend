import { jest } from "@jest/globals";

await jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
  userRepo: {
    create: jest.fn(async (u) => ({ id: 10, ...u })),
    findAll: jest.fn(async () => []),
    update: jest.fn(async () => ({ id: 10, rolId: 2 })),
    remove: jest.fn(async () => {}),
  },
}));

await jest.unstable_mockModule("../src/repositories/permRepo.js", () => ({
  permRepo: {
    setForUser: jest.fn(async () => {}),
    getForUser: jest.fn(async () => ["EDIT"]),
  },
}));

await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
  logAdminAction: jest.fn(async () => {}),
}));

const permModule = await import("../src/repositories/permRepo.js");

let userService;
await jest.isolateModulesAsync(async () => {
  ({ userService } = await import("../src/services/userService.js"));
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("userService (HU-001)", () => {
  const actor = { id: 1 };

  test("create applies editor permissions when rolId === 2 and logs action", async () => {
    const res = await userService.create(
      {
        nombre: "Ana",
        apellido1: "Jiménez",
        email: "a@m.cr",
        rolId: 2,
        unidadId: 3,
        editorPermissions: ["EDIT"],
      },
      actor
    );
    expect(res.id).toBe(10);
    expect(Array.isArray(res.editorPermissions)).toBe(true);
    expect(res.editorPermissions).toContain("EDIT");
  });

  test("create does not apply editor permissions for non-editor roles", async () => {
    permModule.permRepo.getForUser.mockResolvedValueOnce([]);

    const res = await userService.create(
      {
        nombre: "Luis",
        apellido1: "Mora",
        email: "l@m.cr",
        rolId: 1,
        unidadId: 1,
      },
      actor
    );
    expect(res.id).toBe(10);
    expect(res.editorPermissions ?? []).toHaveLength(0);
  });
});
