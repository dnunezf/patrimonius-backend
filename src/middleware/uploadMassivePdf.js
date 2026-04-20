import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const uploadDir = path.resolve("uploads", "massive-pdf");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase() || ".pdf";
        const base = path
            .basename(file.originalname || "documento", ext)
            .replace(/[^a-zA-Z0-9-_]/g, "_")
            .slice(0, 120);

        const unique = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
        cb(null, `${unique}-${base}${ext}`);
    },
});

const fileFilter = (_req, file, cb) => {
    const originalname = String(file.originalname || "").toLowerCase();
    const mimetype = String(file.mimetype || "").toLowerCase();

    const isPdf =
        mimetype === "application/pdf" ||
        mimetype === "application/x-pdf" ||
        originalname.endsWith(".pdf");

    if (!isPdf) {
        const err = new Error("Solo se permiten archivos PDF.");
        err.code = "BAD_FILE_TYPE";
        return cb(err, false);
    }

    cb(null, true);
};

const maxMassivePdfMb = Number(process.env.MAX_MASSIVE_PDF_MB || 150);
const maxMassivePdfFiles = Number(process.env.MAX_MASSIVE_PDF_FILES || 100);

export const uploadMassivePdf = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: maxMassivePdfMb * 1024 * 1024,
        files: maxMassivePdfFiles,
    },
});