import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

// Mock del service para probar solo controller/rutas
await jest.unstable_mockModule("../src/services/conservationDispatch.service.js", () => ({
    conservationDispatchService: {
        getDispatchDetail: jest.fn(),
        sendDispatchEmail: jest.fn(),
        listDispatchHistory: jest.fn(),
    },
}));

const { buildConservationDispatchRoutes } = await import("../src/routes/conservationDispatch.routes.js");
const { conservationDispatchService } = await import("../src/services/conservationDispatch.service.js");

const app = express();
app.use(express.json());

// Simula usuario autenticado
app.use((req, _res, next) => {
    req.user = {
        id: 99,
        unidadId: 7,
        rolIds: [1],
    };
    next();
});

app.use("/", buildConservationDispatchRoutes());

describe("Conservation dispatch routes", () => {
    beforeEach(() => jest.clearAllMocks());

    it("should send dispatch email and return 200", async () => {
        conservationDispatchService.sendDispatchEmail.mockResolvedValue({
            ok: true,
            message: "Documento enviado por correo correctamente.",
            dispatchId: 300,
            documentId: 15,
        });

        const res = await request(app)
            .post("/conservation/documents/15/dispatch-email")
            .send({
                to: ["destino@museocostarica.go.cr"],
                cc: [],
                subject: "Despacho de documento",
                message: "Se remite documento.",
                attachmentIds: [-1],
            });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            ok: true,
            message: "Documento enviado por correo correctamente.",
            dispatchId: 300,
            documentId: 15,
        });

        expect(conservationDispatchService.sendDispatchEmail).toHaveBeenCalledWith(
            15,
            {
                to: ["destino@museocostarica.go.cr"],
                cc: [],
                subject: "Despacho de documento",
                message: "Se remite documento.",
                attachmentIds: [-1],
            },
            {
                id: 99,
                unidadId: 7,
                rolIds: [1],
            },
        );
    });

    it("should return 503 when service throws MAIL_NOT_CONFIGURED", async () => {
        const err = new Error(
            "Mail service is not configured. Check MAIL_HOST, MAIL_PORT, MAIL_USER and MAIL_PASS.",
        );
        err.code = "MAIL_NOT_CONFIGURED";
        err.status = 503;

        conservationDispatchService.sendDispatchEmail.mockRejectedValue(err);

        const res = await request(app)
            .post("/conservation/documents/15/dispatch-email")
            .send({
                to: ["destino@museocostarica.go.cr"],
                cc: [],
                subject: "Despacho de documento",
                message: "Se remite documento.",
                attachmentIds: [-1],
            });

        expect(res.status).toBe(503);
        expect(res.body).toEqual({
            error: "mail_not_configured",
            message: "Mail service is not configured. Check MAIL_HOST, MAIL_PORT, MAIL_USER and MAIL_PASS.",
        });
    });

    it("should return 502 when service throws MAIL_SEND_FAILED", async () => {
        const err = new Error("SMTP rejected message");
        err.code = "MAIL_SEND_FAILED";
        err.status = 502;

        conservationDispatchService.sendDispatchEmail.mockRejectedValue(err);

        const res = await request(app)
            .post("/conservation/documents/15/dispatch-email")
            .send({
                to: ["destino@museocostarica.go.cr"],
                cc: [],
                subject: "Despacho de documento",
                message: "Se remite documento.",
                attachmentIds: [-1],
            });

        expect(res.status).toBe(502);
        expect(res.body).toEqual({
            error: "mail_send_failed",
            message: "SMTP rejected message",
        });
    });

    it("should return 422 when service throws MISSING_MAIN_ATTACHMENT", async () => {
        const err = new Error("The main document must be included in the dispatch email");
        err.code = "MISSING_MAIN_ATTACHMENT";
        err.status = 422;

        conservationDispatchService.sendDispatchEmail.mockRejectedValue(err);

        const res = await request(app)
            .post("/conservation/documents/15/dispatch-email")
            .send({
                to: ["destino@museocostarica.go.cr"],
                cc: [],
                subject: "Despacho de documento",
                message: "Se remite documento.",
                attachmentIds: [10],
            });

        expect(res.status).toBe(422);
        expect(res.body).toEqual({
            error: "missing_main_attachment",
            message: "The main document must be included in the dispatch email",
        });
    });

    it("should return 409 when document is not archived", async () => {
        const err = new Error("Only archived conservation documents can be dispatched");
        err.code = "INVALID_DOCUMENT_STATE";
        err.status = 409;

        conservationDispatchService.sendDispatchEmail.mockRejectedValue(err);

        const res = await request(app)
            .post("/conservation/documents/15/dispatch-email")
            .send({
                to: ["destino@museocostarica.go.cr"],
                cc: [],
                subject: "Despacho de documento",
                message: "Se remite documento.",
                attachmentIds: [-1],
            });

        expect(res.status).toBe(409);
        expect(res.body).toEqual({
            error: "invalid_document_state",
            message: "Only archived conservation documents can be dispatched",
        });
    });
});