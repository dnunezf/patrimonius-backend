// src/services/gestionPlazos.service.js
import { notificacionRepo } from '../repositories/notificacionRepo.js';
import { gestionPlazosRepo } from '../repositories/gestionPlazosRepo.js';
import { notificacionService } from './notificacion.service.js';
import {
    insertBitacoraExpedienteSafe,
    resolveBitacoraUsuarioId,
} from '../repositories/bitacoraExpedienteRepo.js';

// Función para calcular el estado del documento según la fecha de vencimiento
function calcularEstadoConservacion(fechaVencimiento) {
    const hoy = new Date();
    const venc = new Date(fechaVencimiento);

    hoy.setHours(0, 0, 0, 0);
    venc.setHours(0, 0, 0, 0);

    const diferenciaMs = venc.getTime() - hoy.getTime();
    const diasRestantes = Math.ceil(diferenciaMs / (1000 * 60 * 60 * 24));

    if (diasRestantes < 0) return 'VENCIDO';
    if (diasRestantes <= 30) return 'PROXIMO_A_VENCER';
    return 'VIGENTE';
}

// Función para asignar un plazo de conservación a un documento
export async function asignarPlazoConservacion(documentoId, data, usuarioId) {
    const validData = {
        ...data,
        fecha_vencimiento: data.fecha_vencimiento || null,
        plazo_valor: data.plazo_valor || 0,
        fecha_inicio_conservacion: data.fecha_inicio_conservacion || null,
        accion_requerida: data.accion_requerida || 'EDITAR',
    };

    // Calcular la fecha de vencimiento según la unidad
    const fechaInicio = new Date(validData.fecha_inicio_conservacion);
    if (validData.plazo_unidad === 'ANIOS') {
        fechaInicio.setFullYear(fechaInicio.getFullYear() + validData.plazo_valor);
    } else if (validData.plazo_unidad === 'MESES') {
        fechaInicio.setMonth(fechaInicio.getMonth() + validData.plazo_valor);
    } else if (validData.plazo_unidad === 'DIAS') {
        fechaInicio.setDate(fechaInicio.getDate() + validData.plazo_valor);
    }

    validData.fecha_vencimiento = fechaInicio.toISOString().slice(0, 10);

    // Calcular el estado de conservación basado en la fecha de vencimiento
    const estadoConservacion = calcularEstadoConservacion(validData.fecha_vencimiento);

    // Actualizar el documento con la nueva fecha de vencimiento y estado
    const result = await gestionPlazosRepo.assignConservationTerm(documentoId, {
        ...validData,
        estado_conservacion: estadoConservacion,
    });

    // Crear la notificación de la asignación de plazo si la actualización fue exitosa
    if (result) {
        const documento = await gestionPlazosRepo.findDocumentoById(documentoId);
        await notificacionRepo.createNotificacion({
            fecha: new Date(),
            tipo: 'PLAZO_ASIGNADO',
            accion_requerida: validData.accion_requerida,
            fecha_limite: validData.fecha_vencimiento,
            enlace_directo: `http://localhost:4200/documentos/${documentoId}`,
            resultado: `Plazo asignado para el documento: ${documento?.titulo}`,
            usuario_id: usuarioId,
            documento_id: documentoId,
        });
    }

    return result;
}

/** Convierte fila mysql2 a JSON seguro (fechas siempre como ISO o null). */
function toJsonExpedientePlazoRow(row) {
    if (!row || typeof row !== 'object') {
        return row;
    }
    const toIsoOrNull = (v) => {
        if (v == null || v === '') {
            return null;
        }
        const d = v instanceof Date ? v : new Date(v);
        if (Number.isNaN(d.getTime())) {
            return null;
        }
        return d.toISOString();
    };
    return {
        id: Number(row.id),
        codigo: String(row.codigo ?? ''),
        nombre: String(row.nombre ?? ''),
        unidad_nombre: row.unidad_nombre ?? '—',
        serie_nombre: row.serie_nombre ?? '—',
        subserie_nombre: row.subserie_nombre ?? null,
        estado: String(row.estado ?? '')
            .trim()
            .toUpperCase(),
        fecha_creacion: toIsoOrNull(row.fecha_creacion),
        fecha_cierre: toIsoOrNull(row.fecha_cierre),
        fecha_inicio_vigencia: toIsoOrNull(row.fecha_inicio_vigencia),
        fecha_vencimiento: toIsoOrNull(row.fecha_vencimiento),
        creado_por:
            row.creado_por != null && String(row.creado_por).trim() !== ''
                ? String(row.creado_por).trim()
                : '—',
    };
}

// Listado por expediente (documento de referencia: el de vencimiento más próximo)
export async function listarDocumentosConPlazo(filters = {}) {
    const rows = await gestionPlazosRepo.listExpedientesConPlazoConservacion(filters);
    return rows.map(toJsonExpedientePlazoRow);
}

// Funciones para listar documentos próximos a vencer y vencidos
export async function listarProximosAVencer(days = 30) {
    const dias = Number(days);

    if (!Number.isInteger(dias) || dias <= 0) {
        const err = new Error('El parámetro dias debe ser un entero mayor que 0');
        err.status = 400;
        throw err;
    }

    return await gestionPlazosRepo.listProximosAVencer(dias);
}

export async function listarVencidos() {
    return await gestionPlazosRepo.listVencidos();
}

/**
 * Suma años a `fecha_vencimiento` del expediente (DATETIME) y registra bitácora ACTUALIZACION.
 */
export async function extenderVigenciaExpediente(expedienteId, body, actorUser) {
    const id = Number(expedienteId);
    if (!Number.isInteger(id) || id <= 0) {
        const e = new Error('ID de expediente inválido');
        e.status = 400;
        throw e;
    }

    const anios = Number(body?.anios);
    if (!Number.isInteger(anios) || anios < 1 || anios > 10) {
        const e = new Error('Los años de extensión deben ser un entero entre 1 y 10');
        e.status = 400;
        throw e;
    }

    const justificacion = String(body?.justificacion ?? '').trim();
    if (!justificacion) {
        const e = new Error('La justificación es obligatoria');
        e.status = 400;
        throw e;
    }

    const row = await gestionPlazosRepo.getExpedienteParaExtenderVigencia(id);
    if (!row) {
        const e = new Error('Expediente no encontrado o no aplica para gestión de plazos');
        e.status = 404;
        throw e;
    }

    if (row.fecha_vencimiento == null) {
        const e = new Error('El expediente no tiene fecha de vencimiento; no se puede extender');
        e.status = 422;
        throw e;
    }

    const prev = new Date(row.fecha_vencimiento);
    if (Number.isNaN(prev.getTime())) {
        const e = new Error('Fecha de vencimiento inválida');
        e.status = 422;
        throw e;
    }

    const nueva = new Date(prev.getTime());
    nueva.setFullYear(nueva.getFullYear() + anios);

    const ok = await gestionPlazosRepo.updateExpedienteFechaVencimiento(id, nueva);
    if (!ok) {
        const e = new Error('No se pudo actualizar la fecha de vencimiento');
        e.status = 500;
        throw e;
    }

    const actorId = actorUser?.id ?? actorUser?.usuario_id ?? null;
    const bitacoraUsuarioId = resolveBitacoraUsuarioId(actorId);
    const estadoExp = String(row.estado ?? 'CERRADO').trim().toUpperCase();

    await insertBitacoraExpedienteSafe({
        expediente_id: id,
        usuario_id: bitacoraUsuarioId,
        evento: 'ACTUALIZACION',
        resultado: 'PERMITIDO',
        estado_anterior: estadoExp,
        estado_nuevo: estadoExp,
        detalle: {
            accion: 'extension_vigencia_expediente',
            anios,
            justificacion,
            fecha_vencimiento_anterior: prev.toISOString(),
            fecha_vencimiento_nueva: nueva.toISOString(),
        },
    });

    return {
        expediente_id: id,
        fecha_vencimiento_anterior: prev.toISOString(),
        fecha_vencimiento_nueva: nueva.toISOString(),
        anios,
    };
}

/**
 * Revisa expedientes archivados con plazo de conservación vencido y notifica
 * a archivistas (in-app + correo). El parámetro `days` se conserva por compatibilidad con la ruta.
 */
export async function revisarYNotificarVencimientos(days = 30) {
    const d = Number(days);
    const out = await notificacionService.notifyExpedientesConservacionVencidosPasados();
    return {
        ...out,
        daysParam: Number.isInteger(d) && d > 0 ? d : 30,
    };
}