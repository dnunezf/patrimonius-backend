// src/services/gestionPlazos.service.js
import { notificacionRepo } from '../repositories/notificacionRepo.js';
import { gestionPlazosRepo } from '../repositories/gestionPlazosRepo.js';
import { pool } from '../db/pool.js';

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

// Listado por expediente (documento de referencia: el de vencimiento más próximo)
export async function listarDocumentosConPlazo(filters = {}) {
    return gestionPlazosRepo.listExpedientesConPlazoConservacion(filters);
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