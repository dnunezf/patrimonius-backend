// src/middleware/uploadSignedPdf.js
import multer from "multer";
import path from "path";
import fs from "fs";
import { uploadsPath } from "../utils/uploads.js";
//const UPLOAD_DIR = path.resolve("uploads", "signed");
const UPLOAD_DIR = uploadsPath("signed");
// Crear carpeta si no existe
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const safeName = String(file.originalname || "signed.pdf")
            .replace(/\s+/g, "_")
            .replace(/[^a-zA-Z0-9._-]/g, "");

        cb(null, `${Date.now()}-${safeName}`);
    },
});

function fileFilter(_req, file, cb) {
    // A veces el navegador manda mimetype raro aunque sea PDF.
    const mimetype = String(file.mimetype || "").toLowerCase();
    const original = String(file.originalname || "").toLowerCase();

    const isPdfMime =
        mimetype === "application/pdf" ||
        mimetype === "application/x-pdf" ||
        mimetype === "application/octet-stream"; // fallback común

    const isPdfExt = original.endsWith(".pdf");

    if (!isPdfMime && !isPdfExt) {
        return cb(new Error("Solo se permite subir archivos PDF"), false);
    }

    cb(null, true);
}

export const uploadSignedPdf = multer({
    storage,
    fileFilter,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});
