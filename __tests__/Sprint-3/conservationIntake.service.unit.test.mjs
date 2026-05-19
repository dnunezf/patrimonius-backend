// __tests__/conservationIntake.service.unit.test.mjs
import { jest } from "@jest/globals";

const currentYear = new Date().getFullYear();
const expectedOfficialCode = `ACT-MNCR-DAF-025-${currentYear}`;

// =========================
// Mocks reutilizables
// =========================
const mockGetMap = jest.fn();

const mockFindByUserId = jest.fn();

const mockSearchCandidates = jest.fn();
const mockFindDocumentById = jest.fn();
const mockListDocumentSignatures = jest.fn();
const mockFindSerieById = jest.fn();
const mockFindSubserieById = jest.fn();
const mockFindExpedienteById = jest.fn();
const mockListRetentionRules = jest.fn();
const mockFindRetentionRuleById = jest.fn();
const mockFindExistingIntakeByOfficialCode = jest.fn();
const mockFindExistingIntakeByDocumentId = jest.fn();
const mockFindHighestReferenceSequence = jest.fn();
const mockWithTransaction = jest.fn();
const mockUpsertClassificationCatalogTx = jest.fn();
const mockUpdateDocumentForConservationTx = jest.fn();
const mockUpsertMetadataMapTx = jest.fn();
const mockInsertIntakeTx = jest.fn();
const mockFindLatestDocumentDateByExpediente = jest.fn();
const mockUpdateDocumentConservationTermTx = jest.fn();

const mockInsertBase = jest.fn();
const mockInsertCiclo = jest.fn();
const mockInsertActividad = jest.fn();

// =========================
// Module mocks
// =========================
await jest.unstable_mockModule("../../src/repositories/metadatoRepo.js", () => ({
  metadatoRepo: {
    getMap: (...args) => mockGetMap(...args),
  },
}));

await jest.unstable_mockModule("../../src/repositories/userRepo.js", () => ({
  userRepo: {
    findById: (...args) => mockFindByUserId(...args),
  },
}));

await jest.unstable_mockModule(
  "../../src/repositories/conservationIntake.repository.js",
  () => ({
    conservationIntakeRepo: {
      searchCandidates: (...args) => mockSearchCandidates(...args),
      findDocumentById: (...args) => mockFindDocumentById(...args),
      listDocumentSignatures: (...args) => mockListDocumentSignatures(...args),
      findSerieById: (...args) => mockFindSerieById(...args),
      findSubserieById: (...args) => mockFindSubserieById(...args),
      findExpedienteById: (...args) => mockFindExpedienteById(...args),
      listRetentionRules: (...args) => mockListRetentionRules(...args),
      findRetentionRuleById: (...args) => mockFindRetentionRuleById(...args),
      findExistingIntakeByOfficialCode: (...args) =>
        mockFindExistingIntakeByOfficialCode(...args),
      findExistingIntakeByDocumentId: (...args) =>
        mockFindExistingIntakeByDocumentId(...args),
      findHighestReferenceSequence: (...args) =>
        mockFindHighestReferenceSequence(...args),
      withTransaction: (...args) => mockWithTransaction(...args),
      upsertClassificationCatalogTx: (...args) =>
        mockUpsertClassificationCatalogTx(...args),
      updateDocumentForConservationTx: (...args) =>
        mockUpdateDocumentForConservationTx(...args),
      upsertMetadataMapTx: (...args) => mockUpsertMetadataMapTx(...args),
      insertIntakeTx: (...args) => mockInsertIntakeTx(...args),
      findLatestDocumentDateByExpediente: (...args) =>
        mockFindLatestDocumentDateByExpediente(...args),
      updateDocumentConservationTermTx: (...args) =>
        mockUpdateDocumentConservationTermTx(...args),
    },
  }),
);

await jest.unstable_mockModule("../../src/repositories/notificacionRepo.js", () => ({
  notificacionRepo: {
    createNotificacion: jest.fn().mockResolvedValue(undefined),
  },
}));

await jest.unstable_mockModule("../../src/repositories/bitacoraExpedienteRepo.js", () => ({
  insertBitacoraExpedienteSafe: jest.fn().mockResolvedValue(undefined),
  resolveBitacoraUsuarioId: (id) => Number(id) || null,
}));

await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
  bitacoraRepo: {
    insertBase: (...args) => mockInsertBase(...args),
    insertCiclo: (...args) => mockInsertCiclo(...args),
    insertActividad: (...args) => mockInsertActividad(...args),
  },
}));

let conservationIntakeService;

await jest.isolateModulesAsync(async () => {
  ({ conservationIntakeService } =
    await import("../../src/services/conservationIntake.service.js"));
});

// =========================
// Defaults por prueba
// =========================
beforeEach(() => {
  jest.clearAllMocks();

  mockGetMap.mockResolvedValue({});

  mockFindByUserId.mockResolvedValue({
    id: 1,
    nombre: "Test",
    apellido1: "User",
    apellido2: "",
  });

  mockSearchCandidates.mockResolvedValue([]);

  mockFindDocumentById.mockResolvedValue({
    id: 8,
    numero_serie: "TMP-20260408-120000-1111",
    titulo: "Acta de Consejo",
    fecha: "2026-01-15",
    unidad_id: 1,
    producingUnitName: "Dirección Administrativa Financiera",
    authorName: "Test User",
  });

  mockListDocumentSignatures.mockResolvedValue([]);

  mockFindSerieById.mockResolvedValue({
    id: 10,
    codigo: "SER-01",
    nombre: "Serie test",
    activa: 1,
    plazo_conservacion_anios: 10,
  });

  mockFindSubserieById.mockResolvedValue(null);

  mockFindExpedienteById.mockResolvedValue({
    id: 20,
    codigo: "EXP-01",
    nombre: "Expediente test",
    serie_id: 10,
    subserie_id: null,
    estado: "ACTIVO",
  });

  mockListRetentionRules.mockResolvedValue([
    { id: 1, label: "Serie A — 10 años", years: 10, activa: 1 },
  ]);

  mockFindRetentionRuleById.mockResolvedValue({
    id: 1,
    label: "Serie A — 10 años",
    years: 10,
    activa: 1,
  });

  mockFindExistingIntakeByOfficialCode.mockResolvedValue(null);
  mockFindExistingIntakeByDocumentId.mockResolvedValue(null);

  mockFindHighestReferenceSequence.mockResolvedValue(24);

  mockUpsertClassificationCatalogTx.mockResolvedValue(undefined);
  mockUpdateDocumentForConservationTx.mockResolvedValue(undefined);
  mockUpdateDocumentConservationTermTx.mockResolvedValue(undefined);
  mockUpsertMetadataMapTx.mockResolvedValue(undefined);
  mockInsertIntakeTx.mockResolvedValue({ id: 99 });

  mockFindLatestDocumentDateByExpediente.mockResolvedValue(null);

  mockWithTransaction.mockImplementation(async (work) => {
    const fakeConn = {
      query: jest.fn(async () => [{}]),
    };
    return await work(fakeConn);
  });

  mockInsertBase.mockResolvedValue(500);
  mockInsertCiclo.mockResolvedValue(undefined);
  mockInsertActividad.mockResolvedValue(undefined);
});

describe("conservationIntakeService (HU-019)", () => {
    const actor = { id: 1, rolId: 3, unidadId: 1 };

  const validPayload = {
    candidateId: 8,
    officialCode: "TMP-20260408-120000-1111",
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
      code: "EXP-01",
      label: "Serie test / Expediente test",
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
    expect(result.officialCode).toBe(expectedOfficialCode);

    expect(mockFindDocumentById).toHaveBeenCalledWith(8);

    expect(mockFindHighestReferenceSequence).toHaveBeenCalledWith({
      typeCode: "ACT",
      unitCode: "MNCR-DAF",
      year: currentYear,
    });

    expect(mockUpsertClassificationCatalogTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        classificationCode: "EXP-01",
        classificationLabel: "Serie test / Expediente test",
      }),
    );

    expect(mockUpdateDocumentForConservationTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId: 8,
        expedienteId: 20,
        referenceCode: expectedOfficialCode,
        title: "Acta de Consejo - Enero",
        accessLevel: "INTERNAL",
      }),
    );

    expect(mockUpsertMetadataMapTx).toHaveBeenCalled();

    expect(mockInsertIntakeTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId: 8,
        officialCode: expectedOfficialCode,
        classificationCode: "EXP-01",
        accessLevel: "INTERNAL",
      }),
    );
  });

  test("registerIntake rejects duplicated official code", async () => {
    mockFindExistingIntakeByOfficialCode.mockResolvedValueOnce({
      id: 55,
      documentId: 777,
      officialCode: expectedOfficialCode,
    });

    await expect(
      conservationIntakeService.registerIntake(validPayload, actor),
    ).rejects.toMatchObject({
      code: "DUPLICATE_OFFICIAL_CODE",
      status: 409,
    });

    expect(mockInsertIntakeTx).not.toHaveBeenCalled();
    expect(mockUpdateDocumentForConservationTx).not.toHaveBeenCalled();
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

    expect(mockInsertIntakeTx).not.toHaveBeenCalled();
    expect(mockUpdateDocumentForConservationTx).not.toHaveBeenCalled();
  });
});
