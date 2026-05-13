import { jest } from "@jest/globals";

// ===== Mock fs para evitar leer archivos reales =====
await jest.unstable_mockModule("fs", () => ({
    default: {
        existsSync: jest.fn(),
        readFileSync: jest.fn(),
    },
}));

// ===== Mock nodemailer para evitar envío real de correos =====
const mockSendMail = jest.fn();

await jest.unstable_mockModule("nodemailer", () => ({
    default: {
        createTransport: jest.fn(() => ({
            sendMail: mockSendMail,
        })),
    },
}));

// ===== Mock del service de documentos para evitar generar PDF real =====
await jest.unstable_mockModule("../../src/services/documento.service.js", () => ({
    documentoService: {
        getPdfBufferForConsultaPreview: jest.fn(),
    },
}));

// ===== Mock repository principal del despacho =====
await jest.unstable_mockModule("../../src/repositories/conservationDispatch.repository.js", () => ({
    conservationDispatchRepo: {
        findConservationDocumentById: jest.fn(),
        findDocumentPdfPath: jest.fn(),
        insertDispatchHistory: jest.fn(),
        listDispatchHistory: jest.fn(),
        countDispatchesByDocumentId: jest.fn(),
        listDispatchAnexos: jest.fn(),
        findDispatchAnexoById: jest.fn(),
    },
}));

// ===== Mock usuario remitente =====
await jest.unstable_mockModule("../../src/repositories/userRepo.js", () => ({
    userRepo: {
        findById: jest.fn(),
    },
}));

// ===== Mock bitácora general =====
const mockBitacoraRepo = {
    insertBase: jest.fn(),
    insertCiclo: jest.fn(),
};

await jest.unstable_mockModule("../../src/repositories/bitacoraRepo.js", () => ({
    bitacoraRepo: mockBitacoraRepo,
}));

// ===== Mock bitácora expediente =====
await jest.unstable_mockModule("../../src/repositories/bitacoraExpedienteRepo.js", () => ({
    insertBitacoraExpedienteSafe: jest.fn(),
    resolveBitacoraUsuarioId: jest.fn((id) => id),
}));

const fs = (await import("fs")).default;
const nodemailer = (await import("nodemailer")).default;
const { documentoService } = await import("../../src/services/documento.service.js");
const { conservationDispatchRepo } = await import("../../src/repositories/conservationDispatch.repository.js");
const { userRepo } = await import("../../src/repositories/userRepo.js");
const { bitacoraRepo } = await import("../../src/repositories/bitacoraRepo.js");
const { insertBitacoraExpedienteSafe } = await import("../../src/repositories/bitacoraExpedienteRepo.js");
const { conservationDispatchService } = await import("../../src/services/conservationDispatch.service.js");

const OLD_ENV = process.env;

const actorAdmin = {
    id: 99,
    unidadId: 7,
    rolIds: [1],
};

const documentoArchivado = {
    id: 15,
    officialCode: "OFI_MNCR-DAF-AC-001-2025",
    title: "Documento de prueba",
    state: "ARCHIVADO",
    unitId: 7,
    createdBy: 50,
    sizeBytes: 1024,
    payloadSnapshot: {
        classification: {
            expedienteId: 42,
        },
    },
};

const payloadCorreo = {
    to: ["destino@museocostarica.go.cr"],
    cc: ["copia@museocostarica.go.cr"],
    subject: "Despacho de documento",
    message: "Se remite el documento solicitado.",
    attachmentIds: [-1],
};

describe("Conservation dispatch service - sendDispatchEmail", () => {
    beforeEach(() => {
        jest.clearAllMocks();

        process.env = {
            ...OLD_ENV,
            MAIL_HOST: "smtp.office365.com",
            MAIL_PORT: "587",
            MAIL_USER: "patrimonius@museocostarica.go.cr",
            MAIL_PASS: "password-test",
            MAIL_FROM: "patrimonius@museocostarica.go.cr",
        };

        conservationDispatchRepo.findConservationDocumentById.mockResolvedValue(documentoArchivado);
        conservationDispatchRepo.findDocumentPdfPath.mockResolvedValue("/tmp/documento-principal.pdf");
        conservationDispatchRepo.insertDispatchHistory.mockResolvedValue({ id: 300 });
        conservationDispatchRepo.listDispatchAnexos.mockResolvedValue([]);

        userRepo.findById.mockResolvedValue({
            id: 99,
            nombre: "María",
            apellido1: "Araya",
            apellido2: "Campos",
            email: "maria@museocostarica.go.cr",
        });

        bitacoraRepo.insertBase.mockResolvedValue(500);
        bitacoraRepo.insertCiclo.mockResolvedValue(true);
        insertBitacoraExpedienteSafe.mockResolvedValue(true);

        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(Buffer.from("contenido pdf prueba"));

        mockSendMail.mockResolvedValue({
            messageId: "message-id-test",
        });
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it("should send dispatch email successfully", async () => {
        const result = await conservationDispatchService.sendDispatchEmail(
            15,
            payloadCorreo,
            actorAdmin,
        );

        expect(result).toEqual({
            ok: true,
            message: "Documento enviado por correo correctamente.",
            dispatchId: 300,
            documentId: 15,
        });

        expect(nodemailer.createTransport).toHaveBeenCalledWith(
            expect.objectContaining({
                host: "smtp.office365.com",
                port: 587,
                secure: false,
                auth: {
                    user: "patrimonius@museocostarica.go.cr",
                    pass: "password-test",
                },
            }),
        );

        expect(mockSendMail).toHaveBeenCalledTimes(1);
        expect(mockSendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                from: `"Patrimonius - María Araya Campos" <patrimonius@museocostarica.go.cr>`,
                replyTo: "maria@museocostarica.go.cr",
                to: ["destino@museocostarica.go.cr"],
                cc: ["copia@museocostarica.go.cr"],
                subject: "Despacho de documento",
                text: expect.stringContaining("Se remite el documento solicitado."),
                html: expect.stringContaining("Se remite el documento solicitado."),
                attachments: [
                    expect.objectContaining({
                        filename: "OFI_MNCR-DAF-AC-001-2025.pdf",
                        content: Buffer.from("contenido pdf prueba"),
                        contentType: "application/pdf",
                    }),
                ],
            }),
        );

        expect(conservationDispatchRepo.insertDispatchHistory).toHaveBeenCalledWith(
            expect.objectContaining({
                documentId: 15,
                sentBy: 99,
                to: ["destino@museocostarica.go.cr"],
                cc: ["copia@museocostarica.go.cr"],
                subject: "Despacho de documento",
                message: "Se remite el documento solicitado.",
                messageId: "message-id-test",
                estado: "ENVIADO",
            }),
        );

        expect(bitacoraRepo.insertBase).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "CONSERVACION_DESPACHO_CORREO",
                resultado: "PERMITIDO",
                usuario_id: 99,
                documento_id: 15,
            }),
        );

        expect(insertBitacoraExpedienteSafe).toHaveBeenCalledWith(
            expect.objectContaining({
                expediente_id: 42,
                usuario_id: 99,
                evento: "DESCARGA",
                resultado: "PERMITIDO",
            }),
        );
    });

    it("should throw UNAUTHORIZED if actor is missing", async () => {
        await expect(
            conservationDispatchService.sendDispatchEmail(15, payloadCorreo, null),
        ).rejects.toMatchObject({
            code: "UNAUTHORIZED",
            status: 401,
            message: "Unauthorized",
        });

        expect(mockSendMail).not.toHaveBeenCalled();
        expect(conservationDispatchRepo.insertDispatchHistory).not.toHaveBeenCalled();
    });

    it("should throw NOT_FOUND if document does not exist", async () => {
        conservationDispatchRepo.findConservationDocumentById.mockResolvedValue(null);

        await expect(
            conservationDispatchService.sendDispatchEmail(15, payloadCorreo, actorAdmin),
        ).rejects.toMatchObject({
            code: "NOT_FOUND",
            status: 404,
            message: "Document not found in conservation",
        });

        expect(mockSendMail).not.toHaveBeenCalled();
    });

    it("should throw FORBIDDEN if actor has no permission to dispatch document", async () => {
        const actorSinPermiso = {
            id: 80,
            unidadId: 99,
            rolIds: [],
        };

        await expect(
            conservationDispatchService.sendDispatchEmail(15, payloadCorreo, actorSinPermiso),
        ).rejects.toMatchObject({
            code: "FORBIDDEN",
            status: 403,
            message: "You do not have permission to dispatch this document",
        });

        expect(mockSendMail).not.toHaveBeenCalled();
    });

    it("should throw INVALID_DOCUMENT_STATE if document is not archived", async () => {
        conservationDispatchRepo.findConservationDocumentById.mockResolvedValue({
            ...documentoArchivado,
            state: "BORRADOR",
        });

        await expect(
            conservationDispatchService.sendDispatchEmail(15, payloadCorreo, actorAdmin),
        ).rejects.toMatchObject({
            code: "INVALID_DOCUMENT_STATE",
            status: 409,
            message: "Only archived conservation documents can be dispatched",
        });

        expect(mockSendMail).not.toHaveBeenCalled();
    });

    it("should throw MISSING_MAIN_ATTACHMENT if main document is not included", async () => {
        await expect(
            conservationDispatchService.sendDispatchEmail(
                15,
                {
                    ...payloadCorreo,
                    attachmentIds: [10],
                },
                actorAdmin,
            ),
        ).rejects.toMatchObject({
            code: "MISSING_MAIN_ATTACHMENT",
            status: 422,
            message: "The main document must be included in the dispatch email",
        });

        expect(mockSendMail).not.toHaveBeenCalled();
    });

    it("should throw MAIL_NOT_CONFIGURED if mail environment variables are missing", async () => {
        delete process.env.MAIL_HOST;

        await expect(
            conservationDispatchService.sendDispatchEmail(15, payloadCorreo, actorAdmin),
        ).rejects.toMatchObject({
            code: "MAIL_NOT_CONFIGURED",
            status: 503,
            message: "Mail service is not configured. Check MAIL_HOST, MAIL_PORT, MAIL_USER and MAIL_PASS.",
        });

        expect(nodemailer.createTransport).not.toHaveBeenCalled();
        expect(mockSendMail).not.toHaveBeenCalled();
        expect(conservationDispatchRepo.insertDispatchHistory).not.toHaveBeenCalled();
    });

    it("should register failed history and throw MAIL_SEND_FAILED when sendMail fails", async () => {
        mockSendMail.mockRejectedValue(new Error("SMTP rejected message"));

        await expect(
            conservationDispatchService.sendDispatchEmail(15, payloadCorreo, actorAdmin),
        ).rejects.toMatchObject({
            code: "MAIL_SEND_FAILED",
            status: 502,
            message: "SMTP rejected message",
        });

        expect(mockSendMail).toHaveBeenCalledTimes(1);

        expect(conservationDispatchRepo.insertDispatchHistory).toHaveBeenCalledWith(
            expect.objectContaining({
                documentId: 15,
                sentBy: 99,
                to: ["destino@museocostarica.go.cr"],
                cc: ["copia@museocostarica.go.cr"],
                subject: "Despacho de documento",
                message: "Se remite el documento solicitado.",
                messageId: null,
                estado: "FALLIDO",
                error: "SMTP rejected message",
            }),
        );

        expect(bitacoraRepo.insertBase).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "CONSERVACION_DESPACHO_CORREO",
                resultado: "DENEGADO",
                usuario_id: 99,
                documento_id: 15,
            }),
        );
    });

    it("should include optional attachment if selected and file exists", async () => {
        conservationDispatchRepo.findDispatchAnexoById.mockResolvedValue({
            id: 10,
            documentId: 15,
            fileName: "anexo-prueba.pdf",
            filePath: "/tmp/anexo-prueba.pdf",
            mimeType: "application/pdf",
            sizeBytes: 500,
        });

        const result = await conservationDispatchService.sendDispatchEmail(
            15,
            {
                ...payloadCorreo,
                attachmentIds: [-1, 10],
            },
            actorAdmin,
        );

        expect(result.ok).toBe(true);

        expect(conservationDispatchRepo.findDispatchAnexoById).toHaveBeenCalledWith({
            documentId: 15,
            anexoId: 10,
        });

        expect(mockSendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                attachments: expect.arrayContaining([
                    expect.objectContaining({
                        filename: "OFI_MNCR-DAF-AC-001-2025.pdf",
                        contentType: "application/pdf",
                    }),
                    expect.objectContaining({
                        filename: "anexo-prueba.pdf",
                        contentType: "application/pdf",
                    }),
                ]),
            }),
        );

        expect(conservationDispatchRepo.insertDispatchHistory).toHaveBeenCalledWith(
            expect.objectContaining({
                attachments: expect.arrayContaining([
                    expect.objectContaining({
                        id: -1,
                        fileName: "OFI_MNCR-DAF-AC-001-2025.pdf",
                        isMainDocument: true,
                    }),
                    expect.objectContaining({
                        id: 10,
                        fileName: "anexo-prueba.pdf",
                        isMainDocument: false,
                    }),
                ]),
            }),
        );
    });
});