// src/routes/firmaExternal.routes.js
import { Router } from "express";
import multer from "multer";
import { firmaExternalVerificationService } from "../services/firmaExternalVerification.service.js";

import { authGuard } from "../middleware/authGuard.js";
//import { adminGuard } from "../middleware/adminGuard.js";
import { archivoGuard } from "../middleware/archivoGuard.js";

const MAX_FILE_MB = 15;

//const upload = multer({ storage: multer.memoryStorage() });
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const isDocField = file.fieldname === "document";
        const isCertField = file.fieldname === "certificate";

        const docOk = [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
        ].includes(file.mimetype);

        const certOk = [
            "application/x-x509-ca-cert",
            "application/pkix-cert",
            "application/x-pem-file",
            "application/octet-stream", // a veces los .cer llegan así
            "text/plain",               // a veces .pem llega así
        ].includes(file.mimetype);

        if (isDocField && !docOk) {
            return cb(new Error("Tipo de archivo inválido para 'document'. Use PDF/DOCX."));
        }
        if (isCertField && !certOk) {
            return cb(new Error("Tipo de archivo inválido para 'certificate'. Use CER/CRT/PEM."));
        }
        if (!isDocField && !isCertField) {
            return cb(new Error("Campo inválido. Use 'document' y 'certificate'."));
        }

        cb(null, true);
    },
});

const router = Router();

/**
 * HU-020
 * Verificar firma digital de documento externo.
 *
 * Form-data:
 * - document: archivo (pdf/docx)
 * - certificate: archivo (cer/crt/pem)
 */
router.post(
    "/external-signatures/:documentoId/verify",
    authGuard,
    archivoGuard,
    upload.fields([
        { name: "document", maxCount: 1 },
        { name: "certificate", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const documentoId = Number(req.params.documentoId);

            const documentFile = req.files?.document?.[0];
            const certificateFile = req.files?.certificate?.[0];

            const out = await firmaExternalVerificationService.verify(
                documentoId,
                { documentFile, certificateFile },
                req.user
            );

            res.status(200).json(out);
        } catch (e) {
            const msg = e?.message ?? "Error verificando firma externa";

            const code =
                e?.code === "LIMIT_FILE_SIZE" ? 413 :
                    msg.includes("Tipo de archivo inválido") ? 400 :
                        msg.includes("Campo inválido") ? 400 :
                            (e?.code ?? 500);

            res.status(code).json({ message: msg });
        }

    }
);

router.get(
    "/external-signatures/:documentoId/latest",
    authGuard,
    archivoGuard,
    async (req, res) => {
        try {
            const documentoId = Number(req.params.documentoId);
            const item = await firmaExternalVerificationService.latest(documentoId);
            res.json({ item });
        } catch (e) {
            res.status(500).json({ message: e?.message ?? "Error" });
        }
    }
);

router.get(
    "/external-signatures/:documentoId/history",
    authGuard,
    archivoGuard,
    async (req, res) => {
        try {
            const documentoId = Number(req.params.documentoId);
            const limit = Number(req.query.limit ?? 50);
            const offset = Number(req.query.offset ?? 0);

            const items = await firmaExternalVerificationService.history(documentoId, {
                limit,
                offset,
            });
            res.json({ items });
        } catch (e) {
            res.status(500).json({ message: e?.message ?? "Error" });
        }
    }
);

export default router;
