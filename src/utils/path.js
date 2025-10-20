// src/utils/paths.js
import path from "path";

export const PLANTILLAS_DIR = path.join(process.cwd(), "src", "assets", "Plantillas");

/** Convierte '/plantillas/<archivo>.docx' a '.../src/assets/Plantillas/<archivo>.docx' */
export function rutaWebToFs(ruta_web) {
    // Ej: '/plantillas/01_Oficio_plantillaV2.docx' -> '01_Oficio_plantillaV2.docx'
    const filename = decodeURI(String(ruta_web || "").replace(/^\/plantillas\//, ""));
    // Une con el directorio real (maneja separadores en Win/Linux)
    return path.join(PLANTILLAS_DIR, filename);
}
