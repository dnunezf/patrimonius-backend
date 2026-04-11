// run test: node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./jest.config.mjs __tests__/metadata.e2e.test.mjs

import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const readCombinedMock = jest.fn(async (documento_id) => ({
  automatic: {
    identifier: "TMP-20260411-0001",
    sizeBytes: 2048,
    producerUnitId: 11,
    producerUnitName: "Asesoría Jurídica",
    creationResponsible: "David Núñez",
    createdAt: "2026-04-11T10:00:00.000Z",
    modificationResponsible: "David Núñez",
    modifiedAt: "2026-04-11T10:10:00.000Z",
    approvalResponsible: "David Núñez",
    approvedAt: "2026-04-11T10:20:00.000Z",
    softwareApplication: "Patrimonius v1.0",
  },
  manual: {
    documentType: "Oficio",
    title: `Documento ${documento_id}`,
    keywords: ["archivo", "museo"],
    accessLevel: "INTERNAL",
  },
}));

const setDescriptiveMock = jest.fn(async () => ({ ok: true }));

await jest.unstable_mockModule("../src/middleware/authGuard.js", () => ({
  authGuard: (req, _res, next) => {
    req.user = {
      id: 8,
      email: "david@test.cr",
      unidad_id: 11,
      rol: "ADMINISTRADOR",
    };
    next();
  },
}));

await jest.unstable_mockModule(
  "../src/services/documentMetadata.service.js",
  () => ({
    documentMetadataService: {
      readCombined: readCombinedMock,
      setDescriptive: setDescriptiveMock,
    },
  }),
);

let app;
let documentMetadataService;
let documentMetadataRoutes;

await jest.isolateModulesAsync(async () => {
  ({ documentMetadataRoutes } =
    await import("../src/routes/documentMetadata.routes.js"));
  ({ documentMetadataService } =
    await import("../src/services/documentMetadata.service.js"));

  app = express();
  app.use(express.json());
  app.use(documentMetadataRoutes);
});

describe("Metadata API e2e", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /documentos/:id/metadata returns combined metadata (200)", async () => {
    const res = await request(app).get("/documentos/15/metadata");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(documentMetadataService.readCombined).toHaveBeenCalledTimes(1);
    expect(documentMetadataService.readCombined).toHaveBeenCalledWith(15);

    expect(res.body.automatic).toBeDefined();
    expect(res.body.manual).toBeDefined();
    expect(res.body.manual.documentType).toBe("Oficio");
    expect(res.body.manual.title).toBe("Documento 15");
  });

  test("PUT /documentos/:id/metadata/descriptive saves edition metadata (200)", async () => {
    const payload = {
      documentType: "Informe",
      title: "Informe final",
      keywords: ["archivo", "historia"],
      accessLevel: "PUBLIC",
    };

    const res = await request(app)
      .put("/documentos/15/metadata/descriptive")
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(documentMetadataService.setDescriptive).toHaveBeenCalledTimes(1);
    expect(documentMetadataService.setDescriptive).toHaveBeenCalledWith({
      documento_id: 15,
      input: expect.objectContaining(payload),
      actorId: 8,
    });
    expect(res.body).toEqual({ ok: true });
  });
});
