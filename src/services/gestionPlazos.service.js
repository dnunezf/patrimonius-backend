import { notificacionRepo } from '../repositories/notificacionRepo.js';
import * as gestionPlazosRepo from '../repositories/gestionPlazosRepo.js';
// Si luego quieres registrar bitácora real, aquí puedes importar bitacoraRepo
import { pool } from '../db/pool.js';

function buildError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function calcularFechaVencimiento(fechaInicio, valor, unidad) {
    const fecha = new Date(fechaInicio);

    if (Number.isNaN(fecha.getTime())) {
        throw buildError('Fecha de inicio inválida', 400);
    }

    if (unidad === 'DIAS') {
        fecha.setDate(fecha.getDate() + valor);
    } else if (unidad === 'MESES') {
        fecha.setMonth(fecha.getMonth() + valor);
    } else if (unidad === 'ANIOS') {
        fecha.setFullYear(fecha.getFullYear() + valor);
    } else {
        throw buildError('Unidad de plazo inválida', 400);
    }

    return fecha;
}

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

function normalizarFechaMysql(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

export async function asignarPlazoConservacion(documentoId, data, usuarioId) {
    // Validar que los valores necesarios no sean undefined y asegurarse de que pasen valores válidos
    const validData = {
        ...data,
        fecha_vencimiento: data.fecha_vencimiento || null,  // Si fecha_vencimiento es undefined, lo cambiamos por null
        plazo_valor: data.plazo_valor || 0,  // Asigna un valor predeterminado si plazo_valor está vacío o undefined
        fecha_inicio_conservacion: data.fecha_inicio_conservacion || null,  // Asegúrate de que no sea undefined
        accion_requerida: data.accion_requerida || 'EDITAR',  // Si accion_requerida es undefined, asignamos un valor por defecto
    };

    console.log('Datos válidos antes de la asignación del plazo:', validData);

    // Llamada a la función para actualizar la base de datos con los datos validados
    const result = await gestionPlazosRepo.assignConservationTerm(documentoId, validData);

    // Verifica si la actualización fue exitosa
    if (result) {
        console.log('Creando notificación con los siguientes datos:', {
            fecha: new Date(),
            tipo: 'PLAZO_ASIGNADO',
            accion_requerida: validData.accion_requerida,  // Usamos el valor validado de accion_requerida
            fecha_limite: validData.fecha_vencimiento,
            enlace_directo: `http://localhost:4200/documentos/${documentoId}`,
            resultado: 'PLAZO_ASIGNADO',
            usuario_id: usuarioId,
            documento_id: documentoId,
        });

        // Crear la notificación
        await notificacionRepo.createNotificacion({
            fecha: new Date(),
            tipo: 'PLAZO_ASIGNADO',
            accion_requerida: validData.accion_requerida,
            fecha_limite: validData.fecha_vencimiento,
            enlace_directo: `http://localhost:4200/documentos/${documentoId}`,
            resultado: 'PLAZO_ASIGNADO',
            usuario_id: usuarioId,
            documento_id: documentoId,
        });
    }

    return result;
}

export async function listarDocumentosConPlazo(filters = {}) {
    const conditions = [];
    const params = [];

    conditions.push(`d.estado = 'ARCHIVADO'`);

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

async function crearNotificacionPlazoAsignado(documento, fechaVencimiento) {
    try {
        if (!documento?.usuario_id || !documento?.id) return;

        await notificacionRepo.createNotificacion({
            fecha: new Date(),
            tipo: 'PLAZO_CONSERVACION',
            accionRequerida: `Se asignó un plazo de conservación al documento "${documento.titulo}".`,
            fechaLimite: fechaVencimiento || null,
            enlaceDirecto: `/documents/${documento.id}`,
            resultado: 'PLAZO_ASIGNADO',
            usuarioId: documento.usuario_id,
            documentoId: documento.id,
        });
    } catch (error) {
        console.error('Error creando notificación de plazo asignado:', error);
    }
}

async function crearNotificacionProximoVencimiento(documento) {
    try {
        if (!documento?.usuario_id || !documento?.id) return;

        await notificacionRepo.createNotificacion({
            fecha: new Date(),
            tipo: 'PLAZO_CONSERVACION',
            accionRequerida: `El documento "${documento.titulo}" está próximo a vencer.`,
            fechaLimite: documento.fecha_vencimiento || null,
            enlaceDirecto: `/documents/${documento.id}`,
            resultado: 'PROXIMO_A_VENCER',
            usuarioId: documento.usuario_id,
            documentoId: documento.id,
        });
    } catch (error) {
        console.error('Error creando notificación de próximo vencimiento:', error);
    }
}

async function crearNotificacionVencido(documento) {
    try {
        if (!documento?.usuario_id || !documento?.id) return;

        await notificacionRepo.createNotificacion({
            fecha: new Date(),
            tipo: 'PLAZO_CONSERVACION',
            accionRequerida: `El documento "${documento.titulo}" ya venció.`,
            fechaLimite: documento.fecha_vencimiento || null,
            enlaceDirecto: `/documents/${documento.id}`,
            resultado: 'VENCIDO',
            usuarioId: documento.usuario_id,
            documentoId: documento.id,
        });
    } catch (error) {
        console.error('Error creando notificación de documento vencido:', error);
    }
}