// src/middleware/cargaPlantillas.js
import multer from "multer";
import path from "path";
import fs from "fs";

// Directorio destino: src/assets/Plantillas
const PLANTILLAS_DIR = path.join(process.cwd(), "src", "assets", "Plantillas");

// Asegura que la carpeta exista
if (!fs.existsSync(PLANTILLAS_DIR)) {
    fs.mkdirSync(PLANTILLAS_DIR, { recursive: true });
}

// Storage para Multer
const storage = multer.diskStorage({
    destination: function (_req, _file, cb) {
        cb(null, PLANTILLAS_DIR);
    },
    filename: function (_req, file, cb) {
        const ext = path.extname(file.originalname);                  // .docx
        const base = path.basename(file.originalname, ext);           // nombre sin ext
        cb(null, `${base}_${Date.now()}${ext}`);                      // evita duplicados
    },
});

// Filtro: aceptar sólo .docx
const fileFilter = (req, file, cb) => {
    const ok =
        file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (ok) return cb(null, true);
    cb(new Error("Solo se permiten archivos .docx"));
};

// Export: middleware de subida
export const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});
