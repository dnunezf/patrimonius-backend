// src/controllers/firma.controller.js
import { firmaService } from "../services/firma.service.js";

export async function validarDocumento(req, res) {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ error: "no_file", message: "No se recibió ningún archivo en el campo 'file'" });
        }

        const pdfBuffer = req.file.buffer;
        try {
            const result = await firmaService.validarFirmaPDF(pdfBuffer);
            return res.status(200).json(result);
        } catch (err) {
            if (err?.message === "sin firma") {
                return res.status(422).json({ error: "sin_firma", message: "El PDF no contiene una firma digital válida" });
            }
            const status = err?.code === 400 ? 400 : 500;
            return res.status(status).json({ error: err?.message || "error_validacion", message: err?.message || "Error validando la firma" });
        }
    } catch (e) {
        return res.status(500).json({ error: "internal_error", message: e?.message });
    }
}

