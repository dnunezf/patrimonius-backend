import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { uploadsPath } from "../utils/uploads.js";
//const uploadDir = path.resolve("uploads", "massive-pdf");
const uploadDir = uploadsPath("massive-pdf");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },

    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        const safeExt = ext || ".bin";

        const base = path
            .basename(file.originalname || "archivo", safeExt)
            .replace(/[^a-zA-Z0-9-_]/g, "_")
            .slice(0, 120);

        const unique = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
        cb(null, `${unique}-${base}${safeExt}`);
    },
});

const allowedAnexoExts = new Set([
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".jpg",
    ".jpeg",
    ".png",
    ".txt",
    ".csv",
    ".zip",
]);

const allowedAnexoMimes = new Set([
    "application/pdf",
    "application/x-pdf",

    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",

    "application/zip",
    "application/x-zip-compressed",

    "text/plain",
    "text/csv",
]);

const fileFilter = (_req, file, cb) => {
    const originalname = String(file.originalname || "").toLowerCase();
    const mimetype = String(file.mimetype || "").toLowerCase();
    const ext = path.extname(originalname).toLowerCase();

    const isDocumentoPrincipal = file.fieldname === "files";
    const isAnexo = /^anexos_\d+$/.test(file.fieldname || "");

    const isPdf =
        mimetype === "application/pdf" ||
        mimetype === "application/x-pdf" ||
        originalname.endsWith(".pdf");

    if (isDocumentoPrincipal) {
        if (!isPdf) {
            const err = new Error("Solo se permiten archivos PDF como documento principal.");
            err.code = "BAD_FILE_TYPE";
            return cb(err, false);
        }

        return cb(null, true);
    }

    if (isAnexo) {
        const isAllowedByExt = allowedAnexoExts.has(ext);
        const isAllowedByMime =
            allowedAnexoMimes.has(mimetype) || mimetype.startsWith("image/");

        if (!isAllowedByExt && !isAllowedByMime) {
            const err = new Error(
                "Formato de anexo no permitido. Se permiten PDF, Word, Excel, PowerPoint, imágenes, TXT, CSV o ZIP.",
            );
            err.code = "BAD_ANEXO_TYPE";
            return cb(err, false);
        }

        return cb(null, true);
    }

    const err = new Error("Se recibió un archivo en un campo no esperado.");
    err.code = "LIMIT_UNEXPECTED_FILE";
    return cb(err, false);
};

const maxMassivePdfMb = Number(process.env.MAX_MASSIVE_PDF_MB || 150);

const multerMassivePdfFilesLimit = Number(
    process.env.MULTER_MASSIVE_PDF_FILES_LIMIT || 300,
);

export const uploadMassivePdf = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: maxMassivePdfMb * 1024 * 1024,
        files: multerMassivePdfFilesLimit,
    },
});