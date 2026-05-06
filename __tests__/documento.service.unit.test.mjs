// run test: node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./jest.config.mjs __tests__/documento.service.unit.test.mjs

import { jest } from "@jest/globals";

jest.useFakeTimers().setSystemTime(new Date("2026-04-11T12:00:00.000Z"));

const poolQueryMock = jest.fn(async () => [[], []]);

const findByIdMock = jest.fn(async (id) => ({
    id: Number(id),
    titulo: "Documento de prueba",
    estado: "EDICION",
    usuario_id: 7,
    numero_firmas: 0,
    firmas_obtenidas: 0,
    numero_serie: "TMP-20260411-0001",
}));

const insertVersionMock = jest.fn(async () => 1);
const linkPlantillaMock = jest.fn(async () => ({}));
const updateContenidoMock = jest.fn(async () => ({}));
const updateEstadoMock = jest.fn(async () => ({}));
const createMock = jest.fn(async () => ({ id: 1 }));

const upsertByTipoMock = jest.fn(async () => ({}));
const findByTipoMock = jest.fn(async ({ tipo }) => {
    if (tipo === "DESC_PRELIM_CLASS") {
        return { valor: "OFICIO" };
    }
    if (tipo === "EDIT_MANUAL_DOCUMENT_TYPE") {
        return { valor: "OFICIO" };
    }
    return null;
});

const ensureDescriptiveCompleteMock = jest.fn(async () => true);
const markApprovedMock = jest.fn(async () => ({
    approvalResponsible: "David Núñez",
    approvedAt: "2026-04-11T12:00:00.000Z",
}));
const captureTechnicalMock = jest.fn(async () => ({}));

const notifyFirmaMock = jest.fn(async () => ({ ok: true }));

await jest.unstable_mockModule("../src/repositories/permRepo.js", () => ({
    permRepo: {
        getForUser: jest.fn(async () => ["EDIT", "SIGN"]),
    },
}));

await jest.unstable_mockModule("../src/db/pool.js", () => ({
    pool: {
        query: poolQueryMock,
    },
}));

await jest.unstable_mockModule("../src/repositories/documentoRepo.js", () => ({
    documentoRepo: {
        findById: findByIdMock,
        insertDocumento: createMock,
        insertVersion: insertVersionMock,
        linkPlantilla: linkPlantillaMock,
        updateContenido: updateContenidoMock,
        updateEstado: updateEstadoMock,
        getLatestVersion: jest.fn(async () => ({ id: 1, fecha: new Date() })),
        countVersions: jest.fn(async () => 1),
        findVersionById: jest.fn(async () => null),
        getContenido: jest.fn(async () => null),
        update: jest.fn(async () => ({})),
        create: jest.fn(async () => ({ id: 1 })),
        sign: jest.fn(async () => ({})),
    },
}));

await jest.unstable_mockModule("../src/repositories/plantillaRepo.js", () => ({
    plantillaRepo: {
        findById: jest.fn(async () => null),
    },
}));

await jest.unstable_mockModule(
    "../src/repositories/comentariosRepo.js",
    () => ({
        comentarioRepo: {
            listByDocumento: jest.fn(async () => []),
            insert: jest.fn(async () => 1),
            findById: jest.fn(async () => null),
            resolve: jest.fn(async () => ({})),
        },
    }),
);

await jest.unstable_mockModule("../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: {
        insertBase: jest.fn(async () => 999),
        insertCiclo: jest.fn(async () => ({})),
    },
}));

await jest.unstable_mockModule(
    "../src/services/documentMetadata.service.js",
    () => ({
        documentMetadataService: {
            ensureDescriptiveComplete: ensureDescriptiveCompleteMock,
            markApproved: markApprovedMock,
            captureTechnical: captureTechnicalMock,
        },
    }),
);

await jest.unstable_mockModule("../src/repositories/userRepo.js", () => ({
    userRepo: {
        findById: jest.fn(async (id) => ({
            id,
            nombre: "David",
            apellido1: "Núñez",
            apellido2: "Franco",
            email: "david@test.cr",
        })),
    },
}));

await jest.unstable_mockModule("../src/repositories/metadatoRepo.js", () => ({
    metadatoRepo: {
        upsertByTipo: upsertByTipoMock,
        findByTipo: findByTipoMock,
        getMap: jest.fn(async () => ({})),
    },
}));

await jest.unstable_mockModule(
    "../src/repositories/documentoAnexoRepo.js",
    () => ({
        documentoAnexoRepo: {
            listByDocumento: jest.fn(async () => []),
            create: jest.fn(async () => ({ id: 1 })),
            findById: jest.fn(async () => null),
            deleteById: jest.fn(async () => ({})),
        },
    }),
);

await jest.unstable_mockModule("../src/utils/path.js", () => ({
    rutaWebToFs: jest.fn((v) => v),
}));

await jest.unstable_mockModule(
    "../src/services/notificacion.service.js",
    () => ({
        notificacionService: {
            notifyFirma: notifyFirmaMock,
            notifyAuthorDocumentEdited: jest.fn(async () => ({})),
            notifyArchivado: jest.fn(async () => ({})),
        },
    }),
);

await jest.unstable_mockModule("../src/services/pdf.service.js", () => ({
    pdfService: {
        htmlToPdfBuffer: jest.fn(async () => Buffer.from("pdf")),
    },
}));

await jest.unstable_mockModule("../src/services/word.service.js", () => ({
    wordService: {
        htmlToDocxBuffer: jest.fn(async () => Buffer.from("docx")),
    },
}));

await jest.unstable_mockModule("../src/services/indice.service.js", () => ({
    indiceService: {},
}));

await jest.unstable_mockModule("../src/utils/pdfMetadataEmbed.js", () => ({
    resolvePdfMetadataFields: jest.fn(async () => ({})),
    embedStandardMetadataInPdfBuffer: jest.fn(async (buffer) => buffer),
}));

await jest.unstable_mockModule("mammoth", () => ({
    default: {
        convertToHtml: jest.fn(async () => ({ value: "<p>mock</p>" })),
    },
}));

let documentoService;
let documentMetadataService;
let metadatoRepo;
let notificacionService;

await jest.isolateModulesAsync(async () => {
    ({ documentoService } = await import("../src/services/documento.service.js"));
    ({ documentMetadataService } =
        await import("../src/services/documentMetadata.service.js"));
    ({ metadatoRepo } = await import("../src/repositories/metadatoRepo.js"));
    ({ notificacionService } =
        await import("../src/services/notificacion.service.js"));
});

describe("documentoService.prepareForSignature", () => {
    beforeEach(() => {
        jest.clearAllMocks();

        documentoService._assertHasAccess = jest.fn(async () => true);

        findByIdMock.mockResolvedValue({
            id: 10,
            titulo: "Documento de prueba",
            estado: "EDICION",
            usuario_id: 7,
            numero_firmas: 0,
            firmas_obtenidas: 0,
            numero_serie: "TMP-20260411-0001",
        });
    });

    test("prepara firma con firmantes válidos normalizados", async () => {
        const out = await documentoService.prepareForSignature({
            documento_id: 10,
            usuario_id: 8,
            firmantesIds: [11, { id: 12 }, 12, null, "", -1],
            fecha_limite: "2026-04-30",
        });

        expect(documentoService._assertHasAccess).toHaveBeenCalledWith({
            documento_id: 10,
            usuario_id: 8,
        });

        expect(
            documentMetadataService.ensureDescriptiveComplete,
        ).toHaveBeenCalledWith(10);

        expect(documentMetadataService.markApproved).toHaveBeenCalledWith({
            documento_id: 10,
            actorId: 8,
        });

        expect(documentMetadataService.captureTechnical).toHaveBeenCalledWith({
            documento_id: 10,
            actorId: 8,
        });

        expect(metadatoRepo.upsertByTipo).toHaveBeenCalledWith(
            expect.objectContaining({
                documento_id: 10,
                tipo: "CODIGO_OFICIAL",
                valor: "OFI_MNCR-DAF-AC-10-2026",
            }),
        );

        expect(notificacionService.notifyFirma).toHaveBeenCalledTimes(1);

        expect(out.ok).toBe(true);
        expect(out.documento_id).toBe(10);
        expect(out.numero_serie_oficial).toBe("OFI_MNCR-DAF-AC-10-2026");
        expect(out.firmantes).toEqual([11, 12]);
        expect(out.estado).toBe("FIRMA");
    });

    test("rechaza cuando no hay firmantes válidos", async () => {
        await expect(
            documentoService.prepareForSignature({
                documento_id: 10,
                usuario_id: 8,
                firmantesIds: [null, "", {}, -2],
            }),
        ).rejects.toMatchObject({
            code: "BAD_REQUEST",
        });

        expect(
            documentMetadataService.ensureDescriptiveComplete,
        ).not.toHaveBeenCalled();
        expect(metadatoRepo.upsertByTipo).not.toHaveBeenCalled();
        expect(notificacionService.notifyFirma).not.toHaveBeenCalled();
    });
});
