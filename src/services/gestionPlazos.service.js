// src/services/gestionPlazos.service.js
import fs from 'fs';
import path from 'path';
import { notificacionRepo } from '../repositories/notificacionRepo.js';
import { gestionPlazosRepo } from '../repositories/gestionPlazosRepo.js';
import { notificacionService } from './notificacion.service.js';
import {
    insertBitacoraExpedienteSafe,
    resolveBitacoraUsuarioId,
    bitacoraExpedienteRepo,
} from '../repositories/bitacoraExpedienteRepo.js';
import { indiceRepo } from '../repositories/indiceRepo.js';
import { saveActaEliminacionPdf } from '../utils/expedienteActaEliminacionPdf.js';
import { crearPaqueteTransferenciaZip } from '../utils/expedienteTransferenciaZip.js';

/** Estados del flujo HU-032 (subestado mientras `Expediente.estado` sigue en CERRADO). */
const DIS_EST = {
    REVISION_PENDIENTE: 'DISPOSICION_REVISION_PENDIENTE',
    REVISION_COMPLETADA: 'DISPOSICION_REVISION_COMPLETADA',
    RECHAZADA: 'DISPOSICION_RECHAZADA',
    EJEC_ELIM: 'DISPOSICION_EJECUTADA_ELIMINACION',
    EJEC_TRANS: 'DISPOSICION_EJECUTADA_TRANSFERENCIA',
    EJEC_CONS: 'DISPOSICION_EJECUTADA_CONSERVACION_PERMANENTE',
};

const DIS_TIPO = {
    ELIMINACION: 'ELIMINACION',
    TRANSFERENCIA: 'TRANSFERENCIA',
    CONSERVACION_PERMANENTE: 'CONSERVACION_PERMANENTE',
};

function mapTipoDisposicionFrontToApi(t) {
    const u = String(t || '').trim().toUpperCase();
    if (u === 'TRANSFERENCIA_ARCHIVO_NACIONAL' || u === 'TRANSFERENCIA') {
        return DIS_TIPO.TRANSFERENCIA;
    }
    if (u === 'ELIMINACION') return DIS_TIPO.ELIMINACION;
    if (u === 'CONSERVACION_PERMANENTE') return null;
    return null;
}

function tipoPermitidoPorPoliticaSerie(politicaSerie, tipo) {
    if (politicaSerie == null || String(politicaSerie).trim() === '') {
        return true;
    }
    const pol = String(politicaSerie).trim().toUpperCase();
    const t = String(tipo).trim().toUpperCase();
    if (pol === t) return true;
    if (pol === 'CONSERVACION_PERMANENTE' && (t === 'TRANSFERENCIA' || t === 'ELIMINACION')) {
        return true;
    }
    return false;
}

function fechaSoloLocalYmd(d) {
    const x = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function expedienteVencidoParaDisposicion(fechaVencimiento) {
    if (fechaVencimiento == null || fechaVencimiento === '') {
        return false;
    }
    const v = fechaSoloLocalYmd(fechaVencimiento);
    const h = fechaSoloLocalYmd(new Date());
    if (!v || !h) return false;
    return v <= h;
}

function puedeIniciarDisposicionDesdeEstado(disposicionEstado) {
    const s = disposicionEstado == null ? '' : String(disposicionEstado).trim();
    if (!s) return true;
    return s === DIS_EST.RECHAZADA;
}

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
        politica_disposicion: row.politica_disposicion
            ? String(row.politica_disposicion).trim().toUpperCase()
            : null,
        disposicion_estado: row.disposicion_estado
            ? String(row.disposicion_estado).trim()
            : null,
        disposicion_tipo: row.disposicion_tipo
            ? String(row.disposicion_tipo).trim().toUpperCase()
            : null,
        acta_eliminacion_codigo: row.acta_eliminacion_codigo
            ? String(row.acta_eliminacion_codigo)
            : null,
        paquete_transferencia_zip_path: row.paquete_transferencia_zip_path
            ? String(row.paquete_transferencia_zip_path)
            : null,
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

function parseDetalleJson(detalle) {
    if (detalle == null) return null;
    if (typeof detalle === 'object') return detalle;
    try {
        return JSON.parse(String(detalle));
    } catch {
        return { raw: String(detalle) };
    }
}

/**
 * Detalle de conservación + bitácora del expediente (HU-031 / HU-032).
 */
export async function obtenerDetalleConservacionExpediente(expedienteId) {
    const id = Number(expedienteId);
    if (!Number.isInteger(id) || id <= 0) {
        const e = new Error('ID de expediente inválido');
        e.status = 400;
        throw e;
    }

    const row = await gestionPlazosRepo.getExpedienteParaDisposicionHu032(id);
    if (!row) {
        const e = new Error('Expediente no encontrado');
        e.status = 404;
        throw e;
    }

    const estadoUp = String(row.estado ?? '').trim().toUpperCase();
    if (!['CERRADO', 'TRANSFERIDO', 'ELIMINADO'].includes(estadoUp)) {
        const e = new Error('El expediente no aplica para gestión de plazos de conservación');
        e.status = 422;
        throw e;
    }

    const bitacoraRows = await bitacoraExpedienteRepo.listByExpedienteId(id, 100);
    const bitacora = bitacoraRows.map((b) => ({
        id: b.id,
        fecha: b.fecha instanceof Date ? b.fecha.toISOString() : new Date(b.fecha).toISOString(),
        evento: b.evento,
        resultado: b.resultado,
        estado_anterior: b.estado_anterior,
        estado_nuevo: b.estado_nuevo,
        detalle: parseDetalleJson(b.detalle),
        usuario_email: b.usuario_email ?? null,
        usuario_nombre: b.usuario_nombre ?? null,
    }));

    return {
        expediente: toJsonExpedientePlazoRow(row),
        disposicion: {
            estado: row.disposicion_estado ?? null,
            tipo: row.disposicion_tipo ?? null,
            justificacion_inicio: row.disposicion_justificacion_inicio ?? null,
            revision: parseDetalleJson(row.disposicion_revision_json),
            justificacion_aprobacion: row.disposicion_justificacion_aprobacion ?? null,
            motivo_rechazo: row.disposicion_motivo_rechazo ?? null,
            acta_eliminacion_codigo: row.acta_eliminacion_codigo ?? null,
            acta_eliminacion_pdf_path: row.acta_eliminacion_pdf_path ?? null,
            paquete_transferencia_zip_path: row.paquete_transferencia_zip_path ?? null,
            metadatos_resumen: parseDetalleJson(row.disposicion_metadatos_resumen),
        },
        bitacora,
    };
}

/**
 * Inicia el proceso de disposición documental (revisión pendiente).
 */
export async function iniciarDisposicionExpediente(expedienteId, body, actorUser) {
    const id = Number(expedienteId);
    if (!Number.isInteger(id) || id <= 0) {
        const e = new Error('ID de expediente inválido');
        e.status = 400;
        throw e;
    }

    const tipo = mapTipoDisposicionFrontToApi(body?.tipo_disposicion ?? body?.tipo);
    if (!tipo) {
        const e = new Error('Tipo de disposición inválido');
        e.status = 400;
        throw e;
    }

    const justificacion = String(body?.justificacion ?? '').trim();
    if (justificacion.length < 8) {
        const e = new Error('La justificación es obligatoria (mínimo 8 caracteres)');
        e.status = 400;
        throw e;
    }

    const ex = await gestionPlazosRepo.getExpedienteParaDisposicionHu032(id);
    if (!ex) {
        const e = new Error('Expediente no encontrado');
        e.status = 404;
        throw e;
    }

    const estadoUp = String(ex.estado ?? '').trim().toUpperCase();
    if (estadoUp !== 'CERRADO') {
        const e = new Error(
            'Solo expedientes cerrados pueden iniciar disposición desde este módulo'
        );
        e.status = 422;
        throw e;
    }

    if (!expedienteVencidoParaDisposicion(ex.fecha_vencimiento)) {
        const e = new Error(
            'El expediente no tiene plazo de conservación vencido; no aplica iniciar disposición'
        );
        e.status = 422;
        throw e;
    }

    if (!puedeIniciarDisposicionDesdeEstado(ex.disposicion_estado)) {
        const e = new Error('Ya existe un proceso de disposición en curso para este expediente');
        e.status = 409;
        throw e;
    }

    if (!tipoPermitidoPorPoliticaSerie(ex.politica_disposicion, tipo)) {
        const e = new Error(
            `El tipo de disposición no coincide con la política de la serie (${ex.politica_disposicion})`
        );
        e.status = 422;
        throw e;
    }

    const ok = await gestionPlazosRepo.updateExpedienteDisposicionHu032(id, {
        disposicion_estado: DIS_EST.REVISION_PENDIENTE,
        disposicion_tipo: tipo,
        disposicion_justificacion_inicio: justificacion,
        disposicion_revision_json: null,
        disposicion_justificacion_aprobacion: null,
        disposicion_motivo_rechazo: null,
        acta_eliminacion_codigo: null,
        acta_eliminacion_pdf_path: null,
        paquete_transferencia_zip_path: null,
        disposicion_metadatos_resumen: null,
    });

    if (!ok) {
        const e = new Error('No se pudo registrar el inicio del proceso');
        e.status = 500;
        throw e;
    }

    const actorId = actorUser?.id ?? actorUser?.usuario_id ?? null;
    const bitacoraUsuarioId = resolveBitacoraUsuarioId(actorId);

    await insertBitacoraExpedienteSafe({
        expediente_id: id,
        usuario_id: bitacoraUsuarioId,
        evento: 'ACTUALIZACION',
        resultado: 'PERMITIDO',
        estado_anterior: estadoUp,
        estado_nuevo: estadoUp,
        detalle: {
            accion: 'disposicion_inicio',
            tipo_disposicion: tipo,
            justificacion,
            disposicion_estado: DIS_EST.REVISION_PENDIENTE,
        },
    });

    return { expediente_id: id, disposicion_estado: DIS_EST.REVISION_PENDIENTE, disposicion_tipo: tipo };
}

/**
 * Registra la revisión obligatoria (checklist) del expediente.
 */
export async function registrarRevisionDisposicionExpediente(expedienteId, body, actorUser) {
    const id = Number(expedienteId);
    if (!Number.isInteger(id) || id <= 0) {
        const e = new Error('ID de expediente inválido');
        e.status = 400;
        throw e;
    }

    const ex = await gestionPlazosRepo.getExpedienteParaDisposicionHu032(id);
    if (!ex) {
        const e = new Error('Expediente no encontrado');
        e.status = 404;
        throw e;
    }

    if (String(ex.disposicion_estado) !== DIS_EST.REVISION_PENDIENTE) {
        const e = new Error('El expediente no está en revisión pendiente de disposición');
        e.status = 422;
        throw e;
    }

    const m = body?.checklist ?? body;
    const metadatos_ok = Boolean(m?.metadatos_ok);
    const firma_ok = Boolean(m?.firma_ok);
    const plazo_ok = Boolean(m?.plazo_ok);
    const politica_ok = Boolean(m?.politica_ok);
    if (!metadatos_ok || !firma_ok || !plazo_ok || !politica_ok) {
        const e = new Error('Debe marcar todos los requisitos obligatorios del checklist');
        e.status = 400;
        throw e;
    }

    const notas = String(body?.notas ?? '').trim();
    const actorId = actorUser?.id ?? actorUser?.usuario_id ?? null;
    const revision = {
        metadatos_ok,
        firma_ok,
        plazo_ok,
        politica_ok,
        notas: notas || null,
        completado_en: new Date().toISOString(),
        usuario_id: actorId,
    };

    const ok = await gestionPlazosRepo.updateExpedienteDisposicionHu032(id, {
        disposicion_estado: DIS_EST.REVISION_COMPLETADA,
        disposicion_revision_json: revision,
    });

    if (!ok) {
        const e = new Error('No se pudo guardar la revisión');
        e.status = 500;
        throw e;
    }

    const bitacoraUsuarioId = resolveBitacoraUsuarioId(actorId);
    await insertBitacoraExpedienteSafe({
        expediente_id: id,
        usuario_id: bitacoraUsuarioId,
        evento: 'ACTUALIZACION',
        resultado: 'PERMITIDO',
        estado_anterior: String(ex.estado),
        estado_nuevo: String(ex.estado),
        detalle: {
            accion: 'disposicion_revision_completada',
            checklist: revision,
        },
    });

    return { expediente_id: id, disposicion_estado: DIS_EST.REVISION_COMPLETADA };
}

/**
 * Rechaza la disposición y devuelve el expediente a seguimiento sin flujo activo.
 */
export async function rechazarDisposicionExpediente(expedienteId, body, actorUser) {
    const id = Number(expedienteId);
    if (!Number.isInteger(id) || id <= 0) {
        const e = new Error('ID de expediente inválido');
        e.status = 400;
        throw e;
    }

    const motivo = String(body?.motivo ?? body?.motivo_rechazo ?? '').trim();
    if (motivo.length < 8) {
        const e = new Error('El motivo del rechazo es obligatorio (mínimo 8 caracteres)');
        e.status = 400;
        throw e;
    }

    const ex = await gestionPlazosRepo.getExpedienteParaDisposicionHu032(id);
    if (!ex) {
        const e = new Error('Expediente no encontrado');
        e.status = 404;
        throw e;
    }

    const est = String(ex.disposicion_estado ?? '');
    if (est !== DIS_EST.REVISION_PENDIENTE && est !== DIS_EST.REVISION_COMPLETADA) {
        const e = new Error('No hay un proceso de disposición que se pueda rechazar en este estado');
        e.status = 422;
        throw e;
    }

    const estadoExp = String(ex.estado ?? 'CERRADO').trim().toUpperCase();

    const ok = await gestionPlazosRepo.updateExpedienteDisposicionHu032(id, {
        disposicion_estado: DIS_EST.RECHAZADA,
        disposicion_motivo_rechazo: motivo,
        disposicion_revision_json: null,
        disposicion_justificacion_aprobacion: null,
    });

    if (!ok) {
        const e = new Error('No se pudo registrar el rechazo');
        e.status = 500;
        throw e;
    }

    const actorId = actorUser?.id ?? actorUser?.usuario_id ?? null;
    const bitacoraUsuarioId = resolveBitacoraUsuarioId(actorId);

    await insertBitacoraExpedienteSafe({
        expediente_id: id,
        usuario_id: bitacoraUsuarioId,
        evento: 'ACTUALIZACION',
        resultado: 'PERMITIDO',
        estado_anterior: estadoExp,
        estado_nuevo: estadoExp,
        detalle: {
            accion: 'disposicion_rechazada',
            motivo,
            disposicion_estado: DIS_EST.RECHAZADA,
        },
    });

    return { expediente_id: id, disposicion_estado: DIS_EST.RECHAZADA };
}

/**
 * Aprueba y ejecuta la disposición (acta PDF / paquete ZIP / conservación permanente).
 */
export async function aprobarYEjecutarDisposicionExpediente(expedienteId, body, actorUser) {
    const id = Number(expedienteId);
    if (!Number.isInteger(id) || id <= 0) {
        const e = new Error('ID de expediente inválido');
        e.status = 400;
        throw e;
    }

    const justificacion = String(body?.justificacion ?? '').trim();
    if (justificacion.length < 8) {
        const e = new Error('La justificación de aprobación es obligatoria (mínimo 8 caracteres)');
        e.status = 400;
        throw e;
    }

    const ex = await gestionPlazosRepo.getExpedienteParaDisposicionHu032(id);
    if (!ex) {
        const e = new Error('Expediente no encontrado');
        e.status = 404;
        throw e;
    }

    if (String(ex.disposicion_estado) !== DIS_EST.REVISION_COMPLETADA) {
        const e = new Error(
            'Debe completar la revisión obligatoria antes de aprobar la disposición'
        );
        e.status = 422;
        throw e;
    }

    const tipo = String(ex.disposicion_tipo ?? '').trim().toUpperCase();
    if (![DIS_TIPO.ELIMINACION, DIS_TIPO.TRANSFERENCIA, DIS_TIPO.CONSERVACION_PERMANENTE].includes(tipo)) {
        const e = new Error('Tipo de disposición del expediente inconsistente');
        e.status = 422;
        throw e;
    }

    const revision = parseDetalleJson(ex.disposicion_revision_json);
    if (
        !revision ||
        !revision.metadatos_ok ||
        !revision.firma_ok ||
        !revision.plazo_ok ||
        !revision.politica_ok
    ) {
        const e = new Error('La revisión obligatoria no está completa en el sistema');
        e.status = 422;
        throw e;
    }

    const estadoAnt = String(ex.estado ?? 'CERRADO').trim().toUpperCase();
    if (estadoAnt !== 'CERRADO') {
        const e = new Error('Solo se aprueba disposición sobre expedientes cerrados');
        e.status = 422;
        throw e;
    }

    const docs = await indiceRepo.getDocumentosByExpedienteId(id);
    const actorId = actorUser?.id ?? actorUser?.usuario_id ?? null;
    const bitacoraUsuarioId = resolveBitacoraUsuarioId(actorId);

    const anio = new Date().getFullYear();

    if (tipo === DIS_TIPO.CONSERVACION_PERMANENTE) {
        const ok = await gestionPlazosRepo.updateExpedienteDisposicionHu032(id, {
            disposicion_estado: DIS_EST.EJEC_CONS,
            disposicion_justificacion_aprobacion: justificacion,
            disposicion_metadatos_resumen: {
                expediente_codigo: ex.codigo,
                expediente_nombre: ex.nombre,
                tipo: DIS_TIPO.CONSERVACION_PERMANENTE,
                ejecutado_en: new Date().toISOString(),
            },
        });
        if (!ok) {
            const e = new Error('No se pudo registrar la conservación permanente');
            e.status = 500;
            throw e;
        }

        await insertBitacoraExpedienteSafe({
            expediente_id: id,
            usuario_id: bitacoraUsuarioId,
            evento: 'ACTUALIZACION',
            resultado: 'PERMITIDO',
            estado_anterior: estadoAnt,
            estado_nuevo: estadoAnt,
            detalle: {
                accion: 'disposicion_conservacion_permanente_ejecutada',
                justificacion,
            },
        });

        return {
            expediente_id: id,
            disposicion_estado: DIS_EST.EJEC_CONS,
            expediente_estado: estadoAnt,
        };
    }

    if (tipo === DIS_TIPO.ELIMINACION) {
        const codigoActa = `AE-${ex.codigo || id}-${anio}-${id}`;
        const pdf = await saveActaEliminacionPdf({
            expedienteId: id,
            codigoActa,
            payload: {
                expedienteCodigo: ex.codigo,
                expedienteNombre: ex.nombre,
                unidadNombre: ex.unidad_nombre ?? '—',
                serieNombre: ex.serie_nombre ?? '—',
                subserieNombre: ex.subserie_nombre,
                fechaCierre: ex.fecha_cierre,
                fechaVencimiento: ex.fecha_vencimiento,
                fechaActa: new Date(),
                justificacionAprobacion: justificacion,
                documentos: docs.map((d) => ({
                    titulo: d.titulo,
                    estado: d.estado,
                })),
            },
        });

        const resumen = {
            expediente_codigo: ex.codigo,
            expediente_nombre: ex.nombre,
            total_documentos: docs.length,
            documentos: docs.map((d) => ({
                id: d.id,
                titulo: d.titulo,
                estado: d.estado,
            })),
            ejecutado_en: new Date().toISOString(),
            acta_eliminacion_codigo: codigoActa,
        };

        const ok = await gestionPlazosRepo.updateExpedienteDisposicionHu032(id, {
            estado: 'ELIMINADO',
            disposicion_estado: DIS_EST.EJEC_ELIM,
            disposicion_justificacion_aprobacion: justificacion,
            acta_eliminacion_codigo: codigoActa,
            acta_eliminacion_pdf_path: pdf.relativePath,
            disposicion_metadatos_resumen: resumen,
        });

        if (!ok) {
            const e = new Error('No se pudo actualizar el expediente tras generar el acta');
            e.status = 500;
            throw e;
        }

        await insertBitacoraExpedienteSafe({
            expediente_id: id,
            usuario_id: bitacoraUsuarioId,
            evento: 'ELIMINACION',
            resultado: 'PERMITIDO',
            estado_anterior: estadoAnt,
            estado_nuevo: 'ELIMINADO',
            detalle: {
                accion: 'disposicion_eliminacion_ejecutada',
                acta_eliminacion_codigo: codigoActa,
                acta_eliminacion_pdf_path: pdf.relativePath,
                justificacion,
            },
        });

        return {
            expediente_id: id,
            disposicion_estado: DIS_EST.EJEC_ELIM,
            expediente_estado: 'ELIMINADO',
            acta_eliminacion_codigo: codigoActa,
            acta_eliminacion_pdf_path: pdf.relativePath,
        };
    }

    /* TRANSFERENCIA — paquete ZIP preparatorio (sin SIP) */
    const zip = await crearPaqueteTransferenciaZip({
        expedienteId: id,
        expedienteCodigo: ex.codigo,
        expedienteNombre: ex.nombre,
        justificacionAprobacion: justificacion,
        documentosResumen: docs.map((d) => ({
            id: d.id,
            titulo: d.titulo,
            estado: d.estado,
        })),
    });

    const resumenT = {
        expediente_codigo: ex.codigo,
        expediente_nombre: ex.nombre,
        total_documentos: docs.length,
        ejecutado_en: new Date().toISOString(),
        paquete_transferencia_zip_path: zip.relativePath,
    };

    const okT = await gestionPlazosRepo.updateExpedienteDisposicionHu032(id, {
        estado: 'TRANSFERIDO',
        disposicion_estado: DIS_EST.EJEC_TRANS,
        disposicion_justificacion_aprobacion: justificacion,
        paquete_transferencia_zip_path: zip.relativePath,
        disposicion_metadatos_resumen: resumenT,
    });

    if (!okT) {
        const e = new Error('No se pudo actualizar el expediente tras generar el paquete ZIP');
        e.status = 500;
        throw e;
    }

    await insertBitacoraExpedienteSafe({
        expediente_id: id,
        usuario_id: bitacoraUsuarioId,
        evento: 'TRANSFERENCIA',
        resultado: 'PERMITIDO',
        estado_anterior: estadoAnt,
        estado_nuevo: 'TRANSFERIDO',
        detalle: {
            accion: 'disposicion_transferencia_zip_preparada',
            paquete_transferencia_zip_path: zip.relativePath,
            justificacion,
        },
    });

    return {
        expediente_id: id,
        disposicion_estado: DIS_EST.EJEC_TRANS,
        expediente_estado: 'TRANSFERIDO',
        paquete_transferencia_zip_path: zip.relativePath,
    };
}

/**
 * Flujo unificado HU-032: inicio + revisión (checklist) + aprobación/ejecución de transferencia en una sola operación.
 */
export async function ejecutarDisposicionTransferenciaCompleta(expedienteId, body, actorUser) {
    const jInicio = String(body?.justificacion_inicio ?? '').trim();
    const jAprob = String(body?.justificacion_aprobacion ?? '').trim();
    if (jInicio.length < 8) {
        const e = new Error('La justificación inicial es obligatoria (mínimo 8 caracteres)');
        e.status = 400;
        throw e;
    }
    if (jAprob.length < 8) {
        const e = new Error('La justificación de aprobación es obligatoria (mínimo 8 caracteres)');
        e.status = 400;
        throw e;
    }

    await iniciarDisposicionExpediente(
        expedienteId,
        { tipo_disposicion: 'TRANSFERENCIA_ARCHIVO_NACIONAL', justificacion: jInicio },
        actorUser
    );

    await registrarRevisionDisposicionExpediente(
        expedienteId,
        {
            checklist: {
                metadatos_ok: true,
                firma_ok: true,
                plazo_ok: true,
                politica_ok: true,
            },
        },
        actorUser
    );

    return aprobarYEjecutarDisposicionExpediente(
        expedienteId,
        { justificacion: jAprob },
        actorUser
    );
}

/**
 * Descarga autenticada del ZIP de transferencia generado en la disposición (ruta bajo uploads/).
 */
export async function streamPaqueteTransferenciaZip(expedienteId, res) {
    const id = Number(expedienteId);
    if (!Number.isInteger(id) || id <= 0) {
        const e = new Error('ID de expediente inválido');
        e.status = 400;
        throw e;
    }

    const ex = await gestionPlazosRepo.getExpedienteParaDisposicionHu032(id);
    if (!ex) {
        const e = new Error('Expediente no encontrado');
        e.status = 404;
        throw e;
    }

    const rel = ex.paquete_transferencia_zip_path;
    if (rel == null || String(rel).trim() === '') {
        const e = new Error('No hay paquete ZIP de transferencia registrado para este expediente');
        e.status = 404;
        throw e;
    }

    const abs = path.resolve(process.cwd(), String(rel).trim());
    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    const normAbs = path.normalize(abs);
    const normRoot = path.normalize(uploadsRoot);
    if (!normAbs.startsWith(normRoot + path.sep) && normAbs !== normRoot) {
        const e = new Error('Ruta de archivo inválida');
        e.status = 400;
        throw e;
    }

    if (!fs.existsSync(normAbs)) {
        const e = new Error('El archivo ZIP ya no está disponible en el servidor');
        e.status = 404;
        throw e;
    }

    const safeCode = String(ex.codigo || id).replace(/[^a-zA-Z0-9._-]/g, '_');
    const downloadName = `transferencia-${safeCode}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    );

    const stream = fs.createReadStream(normAbs);
    stream.on('error', () => {
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error al leer el paquete ZIP' });
        }
    });
    stream.pipe(res);
}