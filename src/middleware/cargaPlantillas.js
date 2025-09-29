// src/middleware/cargaPlantillas.js
import multer from 'multer';
import path from 'path';

// Configuración de almacenamiento para Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads/'); // La carpeta donde se guardarán los archivos cargados
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + ext); // Renombramos el archivo con la fecha para evitar duplicados
    }
});

// Configuración de Multer
export const upload = multer({ storage: storage });
