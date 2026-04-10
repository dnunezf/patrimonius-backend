// __tests__/conservationIntake.service.unit.test.mjs
import { jest } from "@jest/globals";

const mockGetMap = jest.fn(async () => ({}));

await jest.unstable_mockModule("../src/repositories/metadatoRepo.js", () => ({
  metadatoRepo: {
    getMap: (...a) => mockGetMap(...a),
  },
}));

await jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
  userRepo: {
    findById: jest.fn(async () => ({
      nombre: "Test",
      apellido1: "User",
      apellido2: "",
    })),
  },
}));

await jest.unstable_mockModule(
  "../src/repositories/conservationIntake.repository.js",
  () => ({
    conservationIntakeRepo: {
      searchCandidates: jest.fn(async () => []),
      findDocumentById: jest.fn(async (id) => ({
        id,
        numero_serie: "MNCR-DAF-2026-000123",
        titulo: "Acta de Consejo",
        unidad_id: 1,
      })),
      findClassificationByCode: jest.fn(async (code) => ({
        codigo: code,
        etiqueta: "Serie 1 — Actas",
        activa: 1,
      })),
      listRetentionRules: jest.fn(async () => [
        { id: 1, label: "Serie A — 10 años", years: 10 },
      ]),
      findRetentionRuleById: jest.fn(async (id) => ({
        id: Number(id),
        label: "Serie A — 10 años",
        years: 10,
        activa: 1,
      })),
      findSerieById: jest.fn(async (serieId) => ({
        id: Number(serieId),
        codigo: "1",
        nombre: "Serie test",
        activa: 1,
      })),
      findSubserieById: jest.fn(async () => null),
      findExpedienteById: jest.fn(async (expedienteId) => ({
        id: Number(expedienteId),
        codigo: "1.1.01",
        nombre: "Expediente test",
        serie_id: 10,
        subserie_id: null,
        activa: 1,
      })),
      listDocumentSignatures: jest.fn(async () => []),
      findExistingIntakeByOfficialCode: jest.fn(async () => null),
      findExistingIntakeByDocumentId: jest.fn(async () => null),
      withTransaction: jest.fn(async (work) => {
        const fakeConn = { query: jest.fn(async () => [{}]) };
        return await work(fakeConn);
      }),
      ensureClassificationExistsTx: jest.fn(async () => {}),
      updateDocumentForConservationTx: jest.fn(async () => {}),
      upsertMetadataMapTx: jest.fn(async () => {}),
      insertIntakeTx: jest.fn(async () => ({ id: 99 })),
    },
  }),
);

await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
  bitacoraRepo: {
    insertBase: jest.fn(async () => 500),
    insertCiclo: jest.fn(async () => {}),
    insertActividad: jest.fn(async () => {}),
  },
}));

const repoModule =
  await import("../src/repositories/conservationIntake.repository.js");

let conservationIntakeService;
await jest.isolateModulesAsync(async () => {
  ({ conservationIntakeService } =
    await import("../src/services/conservationIntake.service.js"));
});

afterEach(() => {
  jest.clearAllMocks();
  mockGetMap.mockImplementation(async () => ({}));
});

describe("conservationIntakeService (HU-019)", () => {
  const actor = { id: 1 };

  const validPayload = {
    candidateId: 8,
    officialCode: "MNCR-DAF-2026-000123",
    metadata: {
      documentFlow: "RECEIVED",
      documentType: "Acta",
      title: "Acta de Consejo - Enero",
      producingUnit: "Dirección Administrativa Financiera",
      keywords: ["acta", "consejo"],
      accessLevel: "INTERNAL",
      sizeBytes: 1024,
      format: "application/pdf",
    },
    classification: {
      serieId: 10,
      expedienteId: 20,
      code: "1.1.01",
      label: "Serie 1 — Actas",
    },
    retention: {
      ruleId: 1,
      startDateISO: "2026-03-16",
      trackingEnabled: true,
    },
  };

  test("registerIntake stores a document in conservation successfully", async () => {
    const result = await conservationIntakeService.registerIntake(
      validPayload,
      actor,
    );

    expect(result.id).toBe(99);
    expect(result.intakeId).toBe("INTAKE-99");

    expect(
      repoModule.conservationIntakeRepo.findDocumentById,
    ).toHaveBeenCalledWith(8);

    expect(
      repoModule.conservationIntakeRepo.updateDocumentForConservationTx,
    ).toHaveBeenCalled();

    expect(
      repoModule.conservationIntakeRepo.upsertMetadataMapTx,
    ).toHaveBeenCalled();

    expect(
      repoModule.conservationIntakeRepo.ensureClassificationExistsTx,
    ).toHaveBeenCalled();

    expect(repoModule.conservationIntakeRepo.insertIntakeTx).toHaveBeenCalled();
  });

  test("registerIntake rejects duplicated official code", async () => {
    repoModule.conservationIntakeRepo.findExistingIntakeByOfficialCode.mockResolvedValueOnce(
      {
        id: 55,
        documentId: 777,
        officialCode: "MNCR-DAF-2026-000123",
      },
    );

    await expect(
      conservationIntakeService.registerIntake(validPayload, actor),
    ).rejects.toMatchObject({
      code: "DUPLICATE_OFFICIAL_CODE",
      status: 409,
    });

    expect(
      repoModule.conservationIntakeRepo.insertIntakeTx,
    ).not.toHaveBeenCalled();
  });

  test("registerIntake rejects incomplete archival metadata", async () => {
    const invalidPayload = {
      ...validPayload,
      metadata: {
        ...validPayload.metadata,
        sizeBytes: null,
        format: null,
      },
    };

    await expect(
      conservationIntakeService.registerIntake(invalidPayload, actor),
    ).rejects.toMatchObject({
      code: "INCOMPLETE_ARCHIVAL_METADATA",
    });

    expect(
      repoModule.conservationIntakeRepo.insertIntakeTx,
    ).not.toHaveBeenCalled();
  });
});
