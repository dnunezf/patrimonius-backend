import { notificacionRepo } from '../repositories/notificacionRepo.js';
import * as gestionPlazosRepo from '../repositories/gestionPlazosRepo.js';
// Si luego quieres registrar bitácora real, aquí puedes importar bitacoraRepo

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

export async function asignarPlazoConservacion(documentoId, payload, usuarioId) {
    const documento = await gestionPlazosRepo.findDocumentoById(documentoId);

    if (!documento) {
        throw buildError('Documento no encontrado', 404);
    }

    if (documento.estado !== 'ARCHIVADO') {
        throw buildError('Solo se puede asignar plazo a documentos archivados', 400);
    }

    const plazoValor = Number(payload.plazo_valor);
    const plazoUnidad = payload.plazo_unidad;
    const plazoTipo = payload.plazo_tipo;
    const fechaInicio = payload.fecha_inicio_conservacion;

    if (!Number.isInteger(plazoValor) || plazoValor <= 0) {
        throw buildError('plazo_valor debe ser un entero mayor que 0', 400);
    }

    const unidadesValidas = ['DIAS', 'MESES', 'ANIOS'];
    if (!unidadesValidas.includes(plazoUnidad)) {
        throw buildError('plazo_unidad inválida', 400);
    }

    const tiposValidos = ['ADMINISTRATIVO', 'LEGAL', 'HISTORICO'];
    if (!tiposValidos.includes(plazoTipo)) {
        throw buildError('plazo_tipo inválido', 400);
    }

    if (!fechaInicio) {
        throw buildError('fecha_inicio_conservacion es requerida', 400);
    }

    const fechaVencimientoDate = calcularFechaVencimiento(
        fechaInicio,
        plazoValor,
        plazoUnidad
    );

    const estadoConservacion = calcularEstadoConservacion(fechaVencimientoDate);

    await gestionPlazosRepo.assignConservationTerm(documentoId, {
        plazo_valor: plazoValor,
        plazo_unidad: plazoUnidad,
        plazo_tipo: plazoTipo,
        fecha_inicio_conservacion: fechaInicio,
        fecha_vencimiento: normalizarFechaMysql(fechaVencimientoDate),
        estado_conservacion: estadoConservacion,
        plazo_asignado_por: usuarioId,
    });

    const actualizado = await gestionPlazosRepo.findDocumentoById(documentoId);

    await crearNotificacionPlazoAsignado(
        actualizado,
        actualizado.fecha_vencimiento
    );

    return {
        message: 'Plazo de conservación asignado correctamente',
        documento: actualizado,
    };
}

export async function listarDocumentosConPlazo(query = {}) {
    const filters = {
        estado_conservacion: query.estado_conservacion || null,
        plazo_tipo: query.plazo_tipo || null,
        texto: query.texto || null,
    };

    return await gestionPlazosRepo.listDocumentosConPlazo(filters);
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