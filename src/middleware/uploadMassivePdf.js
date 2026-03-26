// src/middleware/uploadMassivePdf.js
import multer from "multer";
import fs from "fs";
import path from "path";

const uploadDir = path.resolve("uploads", "massive-pdf");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase() || ".pdf";
        const base = path
            .basename(file.originalname || "archivo.pdf", ext)
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 60);

        cb(null, `${Date.now()}-${base}${ext}`);
    },
});

function fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const isPdf =
        ext === ".pdf" ||
        file.mimetype === "application/pdf" ||
        file.mimetype === "application/octet-stream";

    if (!isPdf) {
        return cb(new Error("Solo se permiten archivos PDF"));
    }

    cb(null, true);
}

export const uploadMassivePdf = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        files: 50,
    },
});