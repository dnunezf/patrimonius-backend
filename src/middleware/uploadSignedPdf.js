import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.resolve("uploads", "signed");

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const safeName = file.originalname
            .replace(/\s+/g, "_")
            .replace(/[^a-zA-Z0-9._-]/g, "");

        cb(null, `${Date.now()}-${safeName}`);
    },
});

function fileFilter(_req, file, cb) {
    // Aceptar solo PDF
    if (file.mimetype !== "application/pdf") {
        return cb(new Error("Solo se permite subir archivos PDF"), false);
    }
    cb(null, true);
}

export const uploadSignedPdf = multer({
    storage,
    fileFilter,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});
