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

// Funciones para listar documentos con plazo asignado, próximos a vencer, y vencidos
export async function listarDocumentosConPlazo(filters = {}) {
    const conditions = [];
    const params = [];

    conditions.push(`d.estado = 'ARCHIVADO'`);
    conditions.push(`d.plazo_valor IS NOT NULL`);
    conditions.push(`d.plazo_valor > 0`);
    conditions.push(`d.fecha_inicio_conservacion IS NOT NULL`);
    conditions.push(`d.fecha_vencimiento IS NOT NULL`);
    conditions.push(`d.estado_conservacion IS NOT NULL`);

    if (filters.estado_conservacion) {
        conditions.push(`d.estado_conservacion = ?`);
        params.push(filters.estado_conservacion);
    }

    if (filters.texto) {
        conditions.push(`(
            d.titulo LIKE ?
            OR CAST(d.id AS CHAR) LIKE ?
        )`);
        params.push(`%${filters.texto}%`, `%${filters.texto}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
        `
            SELECT
                d.id,
                d.titulo,
                d.estado,
                d.fecha,
                d.plazo_valor,
                d.plazo_unidad,
                d.fecha_inicio_conservacion,
                d.fecha_vencimiento,
                d.estado_conservacion,
                d.plazo_asignado_por,
                d.plazo_asignado_en,
                u.email AS asignado_por_correo
            FROM Documento d
            LEFT JOIN Usuario u ON u.id = d.plazo_asignado_por
            ${whereClause}
            ORDER BY d.fecha_vencimiento ASC, d.id DESC
        `,
        params
    );

    return rows;
}

// Funciones para listar documentos próximos a vencer y vencidos
export async function listarProximosAVencer(days = 30) {
    const dias = Number(days);

    if (!Number.isInteger(dias) || dias <= 0) {
        throw buildError('El parámetro days debe ser un entero mayor que 0', 400);
    }

    return await gestionPlazosRepo.listProximosAVencer(dias);
}

export async function listarVencidos() {
    return await gestionPlazosRepo.listVencidos();
}