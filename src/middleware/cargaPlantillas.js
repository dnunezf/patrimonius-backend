// src/middleware/cargaPlantillas.js
import multer from "multer";
import path from "path";

// Configuración de multer para guardar archivos en un directorio específico
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Asegúrate de tener la carpeta "uploads" creada
        cb(null, "uploads/"); // Ruta donde se guardarán los archivos
    },
    filename: function (req, file, cb) {
        // Guardar archivo con un nombre único
        cb(null, Date.now() + "-" + file.originalname);
    },
});

// Asegúrate de permitir solo archivos .docx
const fileFilter = (req, file, cb) => {
    if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        cb(null, true); // Aceptar el archivo
    } else {
        cb(new Error("Solo se permiten archivos .docx"), false); // Rechazar el archivo
    }
};

// Configuración de Multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
});

export { upload };
