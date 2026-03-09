// src/middleware/uploadFirma.js
import multer from "multer";

// Memory storage to keep the uploaded PDF in RAM
const storage = multer.memoryStorage();

// 10 MB limit
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        // accept only PDFs
        if (file.mimetype !== "application/pdf") {
            return cb(new Error("invalid_file_type"));
        }
        cb(null, true);
    },
});

function uploadSingle(fieldName) {
    return (req, res, next) => {
        upload.single(fieldName)(req, res, (err) => {
            if (err) {
                // Multer File too large
                if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(413).json({ error: "file_too_large", message: "El archivo supera el límite de 10MB" });
                }

                // Custom invalid file type error
                if (err.message === "invalid_file_type") {
                    return res.status(400).json({ error: "invalid_file_type", message: "Solo se aceptan archivos PDF" });
                }

                // Other upload errors
                return res.status(400).json({ error: "upload_error", message: err.message });
            }
            next();
        });
    };
}

export { upload, uploadSingle };
