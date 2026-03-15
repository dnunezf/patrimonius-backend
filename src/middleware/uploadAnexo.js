// src/middleware/uploadAnexo.js

import multer from "multer";
import path from "path";
import fs from "fs";

/**
 * Carpeta donde se guardarán los anexos
 */
const uploadDir = path.resolve("uploads/anexos");

/**
 * Crear carpeta si no existe
 */
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Configuración de almacenamiento
 */
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },

    filename: (_req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);

        const safeName = file.originalname
            .replace(/\s+/g, "_")
            .replace(/[^a-zA-Z0-9_.-]/g, "");

        cb(null, `${timestamp}_${safeName}${ext}`);
    },
});

/**
 * Filtro de archivos permitidos
 */
const fileFilter = (_req, file, cb) => {
    const allowedMimeTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.oasis.opendocument.text",
        "text/plain",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/png",
        "image/jpeg",
        "image/jpg",
    ];

    const allowedExtensions = [
        ".pdf",
        ".doc",
        ".docx",
        ".odt",
        ".txt",
        ".xls",
        ".xlsx",
        ".png",
        ".jpg",
        ".jpeg",
    ];

    const ext = path.extname(file.originalname || "").toLowerCase();
    const mime = String(file.mimetype || "").toLowerCase();

    if (allowedMimeTypes.includes(mime) || allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error("Tipo de archivo no permitido"));
    }
};

/**
 * Middleware multer
 */
export const uploadAnexo = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB
    },
});