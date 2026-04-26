import { ZodError } from "zod";
import { conservationDispatchService } from "../services/conservationDispatch.service.js";

function sendKnownError(res, error) {
    const code = error?.code || "INTERNAL_ERROR";

    if (error instanceof ZodError) {
        return res.status(422).json({
            error: "validation_error",
            message: "Validation failed",
            issues: error.issues,
        });
    }

    switch (code) {
        case "UNAUTHORIZED":
            return res.status(401).json({
                error: "unauthorized",
                message: error.message,
            });

        case "FORBIDDEN":
            return res.status(403).json({
                error: "forbidden",
                message: error.message,
            });

        case "NOT_FOUND":
            return res.status(404).json({
                error: "not_found",
                message: error.message,
            });

        case "INVALID_DOCUMENT_STATE":
            return res.status(409).json({
                error: "invalid_document_state",
                message: error.message,
            });

        case "DOCUMENT_FILE_NOT_AVAILABLE":
            return res.status(409).json({
                error: "document_file_not_available",
                message: error.message,
            });

        case "MISSING_MAIN_ATTACHMENT":
            return res.status(422).json({
                error: "missing_main_attachment",
                message: error.message,
            });

        case "MAIL_NOT_CONFIGURED":
            return res.status(503).json({
                error: "mail_not_configured",
                message: error.message,
            });

        case "MAIL_SEND_FAILED":
            return res.status(502).json({
                error: "mail_send_failed",
                message: error.message,
            });

        default:
            return res.status(error?.status || 500).json({
                error: "internal_error",
                message: error?.message || "Unexpected server error",
            });
    }
}

export const conservationDispatchController = {
    async getDispatchDetail(req, res) {
        try {
            const documentId = Number(req.params.id);

            const out = await conservationDispatchService.getDispatchDetail(
                documentId,
                req.actor || req.user,
            );

            return res.json(out);
        } catch (error) {
            return sendKnownError(res, error);
        }
    },

    async sendDispatchEmail(req, res) {
        try {
            const documentId = Number(req.params.id);

            const out = await conservationDispatchService.sendDispatchEmail(
                documentId,
                req.body,
                req.actor || req.user,
            );

            return res.status(200).json(out);
        } catch (error) {
            return sendKnownError(res, error);
        }
    },

    async listDispatchHistory(req, res) {
        try {
            const documentId = Number(req.params.id);

            const out = await conservationDispatchService.listDispatchHistory(
                documentId,
                req.actor || req.user,
            );

            return res.json(out);
        } catch (error) {
            return sendKnownError(res, error);
        }
    },
};