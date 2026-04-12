import { historialBusquedaRepo } from "../repositories/historialBusqueda.repo.js";
import { bitacoraRepo } from "../repositories/bitacoraRepo.js";

export const historialBusquedaService = {
    async registrarBusqueda({ usuario_id, texto_busqueda, filtros }) {
        const texto = String(texto_busqueda || "").trim();
        const filtrosNormalizados = normalizarFiltros(filtros);

        if (!texto) {
            return null;
        }

        const historialActual = await historialBusquedaRepo.listByUsuario({
            usuario_id,
            limit: 1,
        });

        const ultima = historialActual?.[0];
        const ultimoTexto = String(ultima?.texto_busqueda || "").trim().toLowerCase();
        const textoActual = texto.toLowerCase();

        if (ultima && ultimoTexto === textoActual) {
            return null;
        }

        return historialBusquedaRepo.create({
            usuario_id,
            texto_busqueda: texto,
            filtros: Object.keys(filtrosNormalizados).length > 0 ? filtrosNormalizados : null,
        });
    },

    async listarMiHistorial({ usuario_id, limit }) {
        return historialBusquedaRepo.listByUsuario({
            usuario_id,
            limit,
        });
    },

    async limpiarMiHistorial({ usuario_id }) {
        const result = await historialBusquedaRepo.clearByUsuario({ usuario_id });

        const baseId = await bitacoraRepo.insertBase({
            fecha: new Date(),
            accion: "LIMPIAR_HISTORIAL_BUSQUEDA",
            resultado: "PERMITIDO",
            usuario_id,
            documento_id: null,
        });

        await bitacoraRepo.insertActividad({
            id: baseId,
            actividad: "OTRA",
            recurso: "HISTORIAL_BUSQUEDA",
            parametros: JSON.stringify({
                accion_solicitada: "LIMPIAR_HISTORIAL_BUSQUEDA",
                eliminadas: result.deletedCount,
            }),
            accion: "LIMPIAR_HISTORIAL_BUSQUEDA",
        });

        return result;
    },

    async eliminarUnaBusqueda({ usuario_id, historial_id }) {
        const result = await historialBusquedaRepo.deleteOne({
            id: historial_id,
            usuario_id,
        });

        return result;
    },
};

function normalizarFiltros(filtros) {
    if (!filtros || typeof filtros !== "object") return {};

    const out = {};

    for (const [key, value] of Object.entries(filtros)) {
        if (value === undefined || value === null) continue;
        if (typeof value === "string" && value.trim() === "") continue;
        out[key] = value;
    }

    return out;
}