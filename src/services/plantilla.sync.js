// src/services/plantilla.sync.js
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { plantillaService } from "./plantilla.service.js";

const DOCX_MIME =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function sha256File(filePath) {
    const hash = crypto.createHash("sha256");
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest("hex");
}

export async function syncPlantillasFromFolder(folderAbsPath) {
    if (!fs.existsSync(folderAbsPath)) return { scanned: 0, inserted: 0, skipped: 0 };

    const files = fs.readdirSync(folderAbsPath)
        .filter(f => f.toLowerCase().endsWith(".docx"));

    let inserted = 0, skipped = 0;

    for (const file of files) {
        const full = path.join(folderAbsPath, file);
        const hash = sha256File(full); // para evitar duplicados por contenido
        const ruta_archivo = `/plantillas/${file}`; // coincide con el static
        const nombre = file.replace(/\.docx$/i, "").replace(/_/g, " ");
        const dto = {
            nombre,
            descripcion: `Plantilla importada (${file})`,
            version: "1.0",
            ruta_archivo,
            checksum: hash   // si no tienes la columna checksum, puedes omitirla
        };

        // Evitar duplicados: intenta por ruta primero y, si existe columna, por checksum
        try {
            // intenta crear; si tu repo tiene unique por ruta_archivo esto lanzará error y lo tomamos como skip
            await plantillaService.create(dto);
            inserted++;
        } catch (e) {
            // ya existe (unique) o cualquier otra razón
            skipped++;
        }
    }
    return { scanned: files.length, inserted, skipped };
}
