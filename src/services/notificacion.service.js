

import { notificacionRepo } from "../repositories/notificacionRepo.js";
import { notificacionEntregaRepo } from "../repositories/notificacionEntregaRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";
import { sendEmail } from "../utils/mailer.js";
import {firmaRepo} from "../repositories/firmaRepo.js";
import {userRepo} from "../repositories/userRepo.js";
import {documentoRepo} from "../repositories/documentoRepo.js";
import { metadatoRepo } from "../repositories/metadatoRepo.js";
import expedienteRepo from "../repositories/expedienteRepo.js";
import { gestionPlazosRepo } from "../repositories/gestionPlazosRepo.js";

function cleanEditorLabel(resultado) {
    // "Editado por: Nombre" -> "Nombre"
    if (!resultado) return "No disponible";
    return String(resultado).replace(/^Editado por:\s*/i, "").trim();
}
function collapseEdits(items) {
    // Agrupa por documento_id (y te deja el último evento como referencia)
    const map = new Map();

    for (const it of items) {
        const key = it.documento_id;
        const prev = map.get(key);

        const editor = cleanEditorLabel(it.resultado);

        if (!prev) {
            map.set(key, {
                ...it,
                _count: 1,
                _editors: new Set([editor]),
            });
            continue;
        }

        prev._count += 1;
        prev._editors.add(editor);

        // mantener el más reciente por fecha
        if (new Date(it.fecha) > new Date(prev.fecha)) {
            // actualizar datos “visibles” con el más reciente
            prev.fecha = it.fecha;
            prev.enlace_directo = it.enlace_directo;
            prev.resultado = it.resultado;
        }
    }

    // devolver como array ordenado por fecha desc
    return Array.from(map.values()).sort(
        (a, b) => new Date(b.fecha) - new Date(a.fecha)
    );
}
function buildDocLink(docId, rawLink) {
    const base = process.env.FRONTEND_URL;
    if (!base) return rawLink || null;

    try {
        const path = rawLink || `/editor/document/${docId}/edit`;
        return new URL(path, base.endsWith("/") ? base : base + "/").toString();
    } catch {
        return rawLink || `${base.replace(/\/$/, "")}/editor/document/${docId}/edit`;
    }
}

function buildLink(rawLink) {
    const base = process.env.FRONTEND_URL;
    if (!base) return rawLink || null;

    try {
        const path = rawLink || "/editor";
        return new URL(path, base.endsWith("/") ? base : base + "/").toString();
    } catch {
        return rawLink || `${base.replace(/\/$/, "")}/editor`;
    }
}

function buildEditEmailText({ nombre, items, dateLabel }) {
    const collapsed = collapseEdits(items);
    const plural = collapsed.length > 1;

    const header = `Estimado(a) ${nombre || "usuario"}:`.trim();
    const intro = plural
        ? `Le informamos que se han realizado modificaciones en ${collapsed.length} documentos de los cuales usted figura como autor(a).`
        : `Le informamos que se ha realizado una modificación en 1 documento del cual usted figura como autor(a).`;

    const lines = collapsed.map((it, idx) => {
        const when = new Date(it.fecha).toLocaleString("es-CR");

        const editors = Array.from(it._editors || []);
        const editorLine =
            editors.length <= 1
                ? editors[0] || "No disponible"
                : editors.join(", ");

        const veces = it._count > 1 ? ` (${it._count} modificaciones)` : "";

        const link = buildDocLink(it.documento_id, it.enlace_directo) || "(sin enlace)";

        return (
            `${idx + 1}) Documento: ${it.documento_titulo}\n` +
            `   - Editado por: ${editorLine}${veces}\n` +
            `   - Fecha de la última edición: ${when}\n` +
            `   - Enlace de acceso: ${link}\n`
        );
    });

    return [
        header,
        "",
        intro,
        dateLabel ? `Fecha del resumen: ${dateLabel}` : "",
        "",
        ...lines,
        "",
        "Atentamente,",
        "Sistema Patrimonius",
    ].filter(Boolean).join("\n");
}

function buildSignEmailText({ nombre, documentoNombre, link }) {
    return [
        `Estimado(a) ${nombre || "usuario"}:`.trim(),
        "",
        `Por este medio se le informa que se requiere su firma para el documento: "${documentoNombre}".`,
        `Puede acceder al documento mediante el siguiente enlace: ${link}`,
        "",
        "Atentamente,",
        "Sistema Patrimonius",
    ].join("\n");
}

function buildArchiveEmailText({ nombre, documentoNombre }) {
    return [
        `Estimado(a) ${nombre || "usuario"}:`.trim(),
        "",
        `Se le informa que el documento "${documentoNombre}" ha sido archivado correctamente.`,
        "",
        "Atentamente,",
        "Sistema Patrimonius",
    ].join("\n");
}

function buildDeleteEmailText({ nombre, documentoNombre, creadoEn }) {
    return [
        `Estimado(a) ${nombre || "usuario"}:`.trim(),
        "",
        `Se le informa que el documento "${documentoNombre}" ha sido marcado para eliminación.`,
        `Fecha de creación del documento: ${creadoEn}`,
        "",
        "Atentamente,",
        "Sistema Patrimonius",
    ].join("\n");
}

function buildInvalidSignatureEmailText({ nombre, documentoNombre, estado, mensajeBccr, link }) {
    const linkEditor = link || buildLink("/editor");
    const mensajeUnico =
        mensajeBccr ||
        "Se recomienda verificar el documento en la página oficial del BCCR (https://www.centraldirecto.fi.cr) y adjuntar nuevamente el archivo corregido una vez que la firma sea válida.";
    return [
        `Estimado(a) ${nombre || "usuario"}:`.trim(),
        "",
        "NOTIFICACIÓN AUTOMÁTICA – FIRMA DIGITAL",
        "",
        `El sistema detectó que la validación de la firma digital del documento "${documentoNombre || "subido"}" dio como resultado: ${estado}.`,
        "",
        "Este documento NO debe archivarse y debe solicitarse su reenvío hasta que la firma sea totalmente válida.",
        "",
        mensajeUnico,
        "",
        linkEditor ? `Puede revisar el documento en el sistema: ${linkEditor}` : "",
        "",
        "Atentamente,",
        "Sistema Patrimonius",
    ].filter(Boolean).join("\n");
}

const TIPO_ARCHIVISTA_EXP_ACTIVOS_JUN = "ARCHIVISTA_EXP_ACTIVOS_JUN";
const TIPO_ARCHIVISTA_EXP_ACTIVOS_NOV = "ARCHIVISTA_EXP_ACTIVOS_NOV";
const TIPO_EXPEDIENTE_CONSERVACION_VENCIDO = "EXPEDIENTE_CONSERVACION_VENCIDO";
const TIPO_EXPEDIENTE_CONSERVACION_PROXIMO = "EXPEDIENTE_CONSERVACION_PROXIMO";

/** Texto visible en la app (Notificacion.resultado, máx. 150 en esquema típico). */
function buildArchivistaExpedientesActivosResultado({ expedientesActivos, campaign }) {
    const periodo = campaign === "NOV" ? "noviembre" : "junio";
    const raw = `Revisión de expedientes activos (${periodo}): ${expedientesActivos} expediente(s) ACTIVO. Revise clasificación archivística.`;
    return raw.length > 150 ? raw.slice(0, 147) + "..." : raw;
}

function buildArchivistaExpedientesActivosEmailText({ nombre, expedientesActivos, linkClasificacion }) {
    return [
        `Estimado(a) ${nombre || "usuario"}:`.trim(),
        "",
        "Revisión de expedientes activos (recordatorio semestral del sistema Patrimonius).",
        "",
        `Hay ${expedientesActivos} expediente(s) en estado ACTIVO que requieren su seguimiento archivístico.`,
        "",
        linkClasificacion
            ? `Puede revisar la clasificación en: ${linkClasificacion}`
            : "Ingrese al sistema para revisar la clasificación y los expedientes activos.",
        "",
        "Atentamente,",
        "Sistema Patrimonius",
    ].filter(Boolean).join("\n");
}

function truncarResultadoNotificacion(texto, maxLen = 150) {
    const s = String(texto ?? "").trim();
    if (s.length <= maxLen) {
        return s;
    }
    return s.slice(0, maxLen - 3) + "...";
}

function buildExpedienteConservacionVencidoResultado({ codigo, nombre }) {
    const base = `Plazo vencido: ${codigo || "—"} — ${nombre || "Expediente"}`;
    return truncarResultadoNotificacion(base);
}

function buildExpedienteConservacionVencidoEmailText({
    nombre,
    codigo,
    nombreExp,
    fechaVencimientoLabel,
    linkGestionPlazos,
}) {
    return [
        `Estimado(a) ${nombre || "usuario"}:`.trim(),
        "",
        "El sistema detectó que la fecha de vencimiento del plazo de conservación de un expediente archivado ya fue superada.",
        "",
        `Expediente: ${codigo || "—"} — ${nombreExp || ""}`.trim(),
        fechaVencimientoLabel ? `Fecha de vencimiento: ${fechaVencimientoLabel}` : "",
        "",
        linkGestionPlazos
            ? `Puede revisar la gestión de plazos y alertas en: ${linkGestionPlazos}`
            : "Ingrese al sistema en Gestión de plazos para revisar las alertas de vencimiento.",
        "",
        "Atentamente,",
        "Sistema Patrimonius",
    ]
        .filter(Boolean)
        .join("\n");
}

function buildExpedienteConservacionProximoResultado({ codigo, nombre, dias }) {
    const base = `Próximo a vencer (${dias}d): ${codigo || "—"} — ${nombre || "Expediente"}`;
    return truncarResultadoNotificacion(base);
}

function buildExpedienteConservacionProximoEmailText({
    nombre,
    codigo,
    nombreExp,
    fechaVencimientoLabel,
    linkGestionPlazos,
    dias,
}) {
    return [
        `Estimado(a) ${nombre || "usuario"}:`.trim(),
        "",
        `Hay un expediente archivado cuyo plazo de conservación vence en los próximos ${dias} día(s).`,
        "",
        `Expediente: ${codigo || "—"} — ${nombreExp || ""}`.trim(),
        fechaVencimientoLabel ? `Fecha de vencimiento: ${fechaVencimientoLabel}` : "",
        "",
        linkGestionPlazos
            ? `Revise gestión de plazos: ${linkGestionPlazos}`
            : "Ingrese al sistema en Gestión de plazos.",
        "",
        "Atentamente,",
        "Sistema Patrimonius",
    ]
        .filter(Boolean)
        .join("\n");
}

export const notificacionService = {
    async create(notificacionData, actor) {
        const created = await notificacionRepo.createNotificacion(notificacionData);

        // crea los 2 canales (IN_APP y EMAIL) como PENDIENTE
        await notificacionEntregaRepo.createForNotificacion(created.id);

        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "NOTIFICACION_CREATE",
            result: "OK",
            detail: { notificacionId: created.id, tipo: notificacionData.tipo },
        });

        return created;
    },

    async list() {
        return notificacionRepo.getAllNotificaciones();
    },

    async getNotificacionById(id) {
        return notificacionRepo.getNotificacionById(id);
    },

    async listMine(userId, opts) {
        return notificacionRepo.listByUser(userId, opts);
    },

    async markRead(id, userId) {
        const updated = await notificacionRepo.markRead(id, userId);
        return { ok: true, updated };
    },

    async markReadBulk(ids, userId) {
        const updated = await notificacionRepo.markReadBulk(userId, ids);
        return { ok: true, updated };
    },

    async unreadCount(userId) {
        const unread = await notificacionRepo.countUnreadByUser(userId);
        return { unread };
    },


    async remove(id, actor) {
        await notificacionRepo.removeNotificacion(id);

        await logAdminAction({
            actorId: actor?.id ?? null,
            action: "NOTIFICACION_DELETE",
            result: "OK",
            detail: { notificacionId: id },
        });
    },

    /**
     * ✅ Caso requerido:
     * Si editan un documento donde el usuario es autor, notificar al autor:
     * - App: inmediato (registro ya queda)
     * - Email: queda PENDIENTE para el resumen a las 8am
     */
    async notifyAuthorDocumentEdited(
        { documentoId, documentoTitulo, autorId, editorNombre, link },
        actor
    ) {
        const fecha = new Date();

        const notif = await this.create(
            {
                fecha,
                tipo: "DOC_EDITADO",
                accionRequerida: "EDITAR",
                fechaLimite: null,
                enlaceDirecto: buildDocLink(documentoId, link),
                resultado: `Editado por: ${editorNombre || "No disponible"}`,

                usuarioId: autorId,
                documentoId,
            },
            actor
        );

        return notif;
    },

    /**
     * Job diario 8am:
     * Agrupa por destinatario y manda 1 solo correo con todos los docs.
     */
    async sendDailyEditDigestEmails() {
        const rows = await notificacionEntregaRepo.listPendingEmailEdits();
        if (!rows.length) return { sent: 0 };

        // agrupar por destinatario
        const byUser = new Map();
        for (const r of rows) {
            const key = r.destinatario_id;
            if (!byUser.has(key)) {
                byUser.set(key, {
                    email: r.destinatario_email,
                    nombre: r.destinatario_nombre,
                    items: [],
                    notifIds: [],
                });
            }
            byUser.get(key).items.push(r);
            byUser.get(key).notifIds.push(r.notificacion_id);
        }

        let sentCount = 0;

        for (const [, group] of byUser.entries()) {
            const subject = `Patrimonius: resumen de documentos editados`;
            const text = buildEditEmailText({
                nombre: group.nombre,
                items: group.items,
                dateLabel: new Date().toLocaleDateString("es-CR"),
            });

            try {
                await sendEmail(group.email, subject, text);
                await notificacionEntregaRepo.markEmailBatchSent(group.notifIds);
                sentCount += 1;
            } catch (err) {
                // si falla, dejamos PENDIENTE o lo marcamos FALLIDA (tu decides)
                // aquí lo marco FALLIDA por cada notificación:
                for (const nid of group.notifIds) {
                    await notificacionEntregaRepo.markFallida({
                        notificacionId: nid,
                        canal: "EMAIL",
                        errorMsg: String(err?.message || err),
                    });
                }
            }
        }

        return { sent: sentCount };
    },

    async notifyFirma({ documentoId, actorId, selectedUserIds = [], fechaLimite = null, link }) {
        // 1) destinatarios base: usuarios seleccionados
        //    (no filtramos al actor acá porque también debe ser informado)
        const selected = Array.from(new Set(selectedUserIds.map(Number))).filter((id) => id && id > 0);

        // 2) para excluir dueños/actores que ya firmaron, y para incluir el dueño/creador del doc
        const signedIds = await firmaRepo.listSignerUserIds(documentoId);
        const doc = await documentoRepo.findById(documentoId); // para titulo + dueño
        const ownerId = Number(doc?.usuario_id);
        const actorIdNum = Number(actorId);

        // 3) destinatarios finales: seleccionados + dueño + actor
        //    evitando duplicados y omitiendo quienes ya firmaron
        const recipients = Array.from(new Set([...selected, ownerId, actorIdNum]))
            .filter((id) => id && id > 0 && !signedIds.includes(id));

        if (!recipients.length) return { notified: 0 };

        // 3) datos de destinatarios
        const users = await userRepo.findEmailsByIds(recipients);
        const docTitle = doc?.titulo || `Documento ${documentoId}`;
        const fullLink = buildDocLink(documentoId, link);

        let notified = 0;

        for (const u of users) {
            // a) creo notificación + entregas
            const notif = await this.create(
                {
                    fecha: new Date(),
                    tipo: "DOC_FIRMA_SOLICITADA",
                    accionRequerida: "FIRMAR",
                    fechaLimite: fechaLimite,
                    enlaceDirecto: fullLink,
                    resultado: "Solicitud de firma",
                    usuarioId: u.id,
                    documentoId,
                },
                { id: actorId }
            );

            // b) IN_APP “inmediata”: como mínimo existe el registro; si querés marcarla como enviada:
            await notificacionEntregaRepo.markEnviada({ notificacionId: notif.id, canal: "IN_APP" });

            // c) EMAIL inmediato
            try {
                const subject = `Patrimonius: Firma requerida`;
                const text = buildSignEmailText({
                    nombre: `${u.nombre} ${u.apellido1 || ""}`.trim(),
                    documentoNombre: docTitle,
                    link: buildLink("/editor"),
                });

                await sendEmail(u.email, subject, text);
                await notificacionEntregaRepo.markEnviada({ notificacionId: notif.id, canal: "EMAIL" });
                notified += 1;
            } catch (err) {
                await notificacionEntregaRepo.markFallida({
                    notificacionId: notif.id,
                    canal: "EMAIL",
                    errorMsg: String(err?.message || err),
                });
            }
        }

        return { notified };
    },

    async notifyArchivado({ documentoId, actorId }) {
        const doc = await documentoRepo.findById(documentoId);
        const docTitle = doc?.titulo || `Documento ${documentoId}`;

        // leer lista guardada
        const map = await metadatoRepo.getMap(documentoId);
        let selected = [];
        try {
            selected = JSON.parse(map["FIRMANTES_ASIGNADOS"] || "[]");
        } catch { selected = []; }

        // filtro actor
        const recipients = Array.from(new Set(selected.map(Number))).filter(id => id && id !== Number(actorId));
        if (!recipients.length) return { notified: 0 };

        const users = await userRepo.findEmailsByIds(recipients);

        let notified = 0;

        for (const u of users) {
            const notif = await this.create(
                {
                    fecha: new Date(),
                    tipo: "DOC_ARCHIVADO",
                    accionRequerida: "ARCHIVAR",
                    fechaLimite: null,
                    enlaceDirecto: buildDocLink(documentoId, `/editor/document/${documentoId}/view`),
                    resultado: "Documento archivado",
                    usuarioId: u.id,
                    documentoId,
                },
                { id: actorId }
            );

            await notificacionEntregaRepo.markEnviada({ notificacionId: notif.id, canal: "IN_APP" });

            try {
                const subject = `Patrimonius: Documento archivado`;
                const text = buildArchiveEmailText({
                    nombre: `${u.nombre} ${u.apellido1 || ""}`.trim(),
                    documentoNombre: docTitle,
                });

                await sendEmail(u.email, subject, text);
                await notificacionEntregaRepo.markEnviada({ notificacionId: notif.id, canal: "EMAIL" });
                notified += 1;
            } catch (err) {
                await notificacionEntregaRepo.markFallida({
                    notificacionId: notif.id,
                    canal: "EMAIL",
                    errorMsg: String(err?.message || err),
                });
            }
        }

        return { notified };
    },

    async notifyEliminacion({ documentoId, actorId }) {
        // 1) traer doc para titulo + fecha creación
        const doc = await documentoRepo.findById(documentoId);
        const docTitle = doc?.titulo || `Documento ${documentoId}`;
        const creadoEn = doc?.fecha
            ? new Date(doc.fecha).toLocaleString("es-CR")
            : "No disponible";

        // 2) destinatarios = todos los que firmaron
        const signedIds = await firmaRepo.listSignerUserIds(documentoId);
        const recipients = Array.from(new Set(signedIds.map(Number))).filter(Boolean);

        if (!recipients.length) return { notified: 0 };

        const users = await userRepo.findEmailsByIds(recipients);

        let notified = 0;

        for (const u of users) {
            // a) crear notificación (app + email)
            const notif = await this.create(
                {
                    fecha: new Date(),
                    tipo: "DOC_ELIMINACION",
                    accionRequerida: "ELIMINAR",
                    fechaLimite: null,
                    enlaceDirecto: null,
                    resultado: `Creado en: ${creadoEn}`,
                    usuarioId: u.id,
                    documentoId,
                },
                { id: actorId }
            );

            // b) marcar IN_APP como enviada (opcional, pero consistente)
            await notificacionEntregaRepo.markEnviada({
                notificacionId: notif.id,
                canal: "IN_APP",
            });

            // c) EMAIL inmediato
            try {
                const subject = `Patrimonius: Documento en eliminación`;
                const text = buildDeleteEmailText({
                    nombre: `${u.nombre} ${u.apellido1 || ""}`.trim(),
                    documentoNombre: docTitle,
                    creadoEn,
                });

                await sendEmail(u.email, subject, text);
                await notificacionEntregaRepo.markEnviada({
                    notificacionId: notif.id,
                    canal: "EMAIL",
                });
                notified += 1;
            } catch (err) {
                await notificacionEntregaRepo.markFallida({
                    notificacionId: notif.id,
                    canal: "EMAIL",
                    errorMsg: String(err?.message || err),
                });
            }
        }

        return { notified };
    },

    /**
     * Notifica por in-app y correo al dueño del documento y al usuario logueado (actor)
     * cuando la firma es INVALIDA, CADUCADA o REVOCADA. Incluye mensaje tipo BCCR.
     */
    async notifyFirmaInvalidaArchivo({ documentoId, estado, ownerUserId, reason, link, actorId, mensajeBccr }) {
        const linkEditor = link || buildLink("/editor");
        const subject = `Patrimonius: firma digital con resultado ${estado} – no archivar`;
        const tieneDocumento = documentoId != null && documentoId !== "";

        if (!tieneDocumento) {
            const emailSent = [];
            if (actorId) {
                const actorUser = await userRepo.findById(actorId);
                if (actorUser?.email) {
                    try {
                        const text = buildInvalidSignatureEmailText({
                            nombre: `${actorUser.nombre || ""} ${actorUser.apellido1 || ""}`.trim() || "usuario",
                            documentoNombre: "documento subido",
                            estado,
                            mensajeBccr: mensajeBccr || reason,
                            link: linkEditor,
                        });
                        await sendEmail(actorUser.email, subject, text);
                        emailSent.push(actorUser.email);
                    } catch (err) {
                        console.warn("No se pudo enviar correo de firma inválida al actor:", err?.message);
                    }
                }
            }
            return { notified: 0, emailSent };
        }

        const doc = await documentoRepo.findById(documentoId);
        const ownerUser = ownerUserId ? await userRepo.findById(ownerUserId) : null;
        const actorUser = actorId ? await userRepo.findById(actorId) : null;

        const documentoNombre = doc?.titulo || `Documento ${documentoId}`;
        const recipientsToNotify = [];

        if (ownerUser?.id) recipientsToNotify.push({ user: ownerUser, role: "owner" });
        if (actorUser?.id && actorUser.id !== ownerUser?.id) recipientsToNotify.push({ user: actorUser, role: "actor" });
        if (recipientsToNotify.length === 0 && actorUser?.id) recipientsToNotify.push({ user: actorUser, role: "actor" });

        let notified = 0;
        const emailSent = [];

        const RESULTADO_MAX_LENGTH = 150;
        const resultadoCorto =
            `Validación: ${estado}. No archivar; solicitar reenvío.` +
            (reason ? ` ${reason}` : "");
        const resultadoTruncado =
            resultadoCorto.length > RESULTADO_MAX_LENGTH
                ? resultadoCorto.slice(0, RESULTADO_MAX_LENGTH - 3) + "..."
                : resultadoCorto;

        for (const { user } of recipientsToNotify) {
            const notif = await this.create(
                {
                    fecha: new Date(),
                    tipo: "DOC_FIRMA_INVALIDA",
                    accionRequerida: "ARCHIVAR",
                    fechaLimite: null,
                    enlaceDirecto: buildDocLink(documentoId, linkEditor),
                    resultado: resultadoTruncado,
                    usuarioId: user.id,
                    documentoId,
                },
                { id: actorId }
            );

            await notificacionEntregaRepo.markEnviada({
                notificacionId: notif.id,
                canal: "IN_APP",
            });
            notified += 1;

            if (user.email) {
                try {
                    const text = buildInvalidSignatureEmailText({
                        nombre: `${user.nombre || ""} ${user.apellido1 || ""}`.trim() || "usuario",
                        documentoNombre,
                        estado,
                        mensajeBccr: mensajeBccr || reason,
                        link: buildDocLink(documentoId, linkEditor),
                    });
                    await sendEmail(user.email, subject, text);
                    await notificacionEntregaRepo.markEnviada({
                        notificacionId: notif.id,
                        canal: "EMAIL",
                    });
                    emailSent.push(user.email);
                } catch (err) {
                    await notificacionEntregaRepo.markFallida({
                        notificacionId: notif.id,
                        canal: "EMAIL",
                        errorMsg: String(err?.message || err),
                    });
                }
            }
        }

        return { notified, emailSent };
    },

    /**
     * Recordatorio semestral para archivistas: in-app + correo inmediato.
     * Solo si hay expedientes ACTIVO y existe al menos un documento asociado (FK Notificacion).
     * @param {{ campaign: 'JUN' | 'NOV' }} opts
     */
    async notifyArchivistasExpedientesActivosSemestral({ campaign }) {
        const tipo =
            campaign === "NOV" ? TIPO_ARCHIVISTA_EXP_ACTIVOS_NOV : TIPO_ARCHIVISTA_EXP_ACTIVOS_JUN;
        const year = new Date().getFullYear();

        const expedientesActivos = await expedienteRepo.countByEstado("ACTIVO");
        if (expedientesActivos <= 0) {
            return { notified: 0, skipped: true, reason: "no_expedientes_activos" };
        }

        const documentoId = await expedienteRepo.findAnyDocumentoIdForActivoExpedientes();
        if (!documentoId) {
            return {
                notified: 0,
                skipped: true,
                reason: "sin_documento_en_expediente_activo",
            };
        }

        const users = await userRepo.findArchivistasPendingSemestralNotificacion(tipo, year);
        if (!users.length) {
            return { notified: 0, skipped: true, reason: "sin_destinatarios_o_ya_notificados" };
        }

        const systemActorId = Number(process.env.SYSTEM_USER_ID);
        const actor = Number.isFinite(systemActorId) ? { id: systemActorId } : { id: null };
        const linkClasificacion = buildLink("/archivista/clasificacion");
        const enlaceDirecto = linkClasificacion;

        let notified = 0;

        for (const u of users) {
            const notif = await this.create(
                {
                    fecha: new Date(),
                    tipo,
                    accionRequerida: "ARCHIVAR",
                    fechaLimite: null,
                    enlaceDirecto,
                    resultado: buildArchivistaExpedientesActivosResultado({
                        expedientesActivos,
                        campaign,
                    }),
                    usuarioId: u.id,
                    documentoId,
                },
                actor
            );

            await notificacionEntregaRepo.markEnviada({ notificacionId: notif.id, canal: "IN_APP" });

            try {
                const subject = `Patrimonius: revisión de expedientes activos`;
                const text = buildArchivistaExpedientesActivosEmailText({
                    nombre: `${u.nombre} ${u.apellido1 || ""}`.trim(),
                    expedientesActivos,
                    linkClasificacion,
                });
                await sendEmail(u.email, subject, text);
                await notificacionEntregaRepo.markEnviada({ notificacionId: notif.id, canal: "EMAIL" });
                notified += 1;
            } catch (err) {
                await notificacionEntregaRepo.markFallida({
                    notificacionId: notif.id,
                    canal: "EMAIL",
                    errorMsg: String(err?.message || err),
                });
            }
        }

        return { notified, expedientesActivos, campaign, destinatarios: users.length };
    },

    /**
     * In-app + correo a archivistas: expedientes en estado final con `fecha_vencimiento`
     * anterior al día actual (solo fecha). Una notificación por (usuario, expediente).
     */
    async notifyExpedientesConservacionVencidosPasados() {
        const expedientes = await gestionPlazosRepo.listExpedientesCerradosVencimientoPasado();
        if (!expedientes.length) {
            return {
                ok: true,
                expedientesEvaluados: 0,
                notificacionesCreadas: 0,
                skipped: true,
                reason: "sin_expedientes_vencidos",
            };
        }

        const archivistas = await userRepo.findArchivistaUsers();
        if (!archivistas.length) {
            return {
                ok: true,
                expedientesEvaluados: expedientes.length,
                notificacionesCreadas: 0,
                skipped: true,
                reason: "sin_archivistas",
            };
        }

        const systemActorId = Number(process.env.SYSTEM_USER_ID);
        const actor = Number.isFinite(systemActorId) ? { id: systemActorId } : { id: null };

        let notificacionesCreadas = 0;

        for (const ex of expedientes) {
            const expedienteId = Number(ex.id);
            if (!Number.isInteger(expedienteId) || expedienteId <= 0) {
                continue;
            }

            const documentoId = await expedienteRepo.findMinDocumentoIdByExpedienteId(expedienteId);
            if (!documentoId) {
                continue;
            }

            const fv = ex.fecha_vencimiento
                ? new Date(ex.fecha_vencimiento)
                : null;
            const fechaVencimientoLabel =
                fv && !Number.isNaN(fv.getTime())
                    ? fv.toLocaleDateString("es-CR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                      })
                    : "";

            const pathPlazos = `/archivista/gestion-plazos?v=alertas&expVencId=${expedienteId}`;
            const linkGestionPlazos = buildLink(pathPlazos);
            const resultado = buildExpedienteConservacionVencidoResultado({
                codigo: ex.codigo,
                nombre: ex.nombre,
            });

            for (const u of archivistas) {
                const uid = Number(u.id);
                if (!Number.isInteger(uid) || uid <= 0) {
                    continue;
                }

                const yaExiste = await notificacionRepo.existsNotificacionExpedienteConservacionVencido(
                    uid,
                    expedienteId
                );
                if (yaExiste) {
                    continue;
                }

                const notif = await this.create(
                    {
                        fecha: new Date(),
                        tipo: TIPO_EXPEDIENTE_CONSERVACION_VENCIDO,
                        accionRequerida: "ARCHIVAR",
                        fechaLimite: ex.fecha_vencimiento ?? null,
                        enlaceDirecto: linkGestionPlazos,
                        resultado,
                        usuarioId: uid,
                        documentoId,
                    },
                    actor
                );

                await notificacionEntregaRepo.markEnviada({
                    notificacionId: notif.id,
                    canal: "IN_APP",
                });
                notificacionesCreadas += 1;

                if (u.email && String(u.email).trim()) {
                    try {
                        const subject = `Patrimonius: plazo de conservación vencido — expediente ${ex.codigo || expedienteId}`;
                        const text = buildExpedienteConservacionVencidoEmailText({
                            nombre: `${u.nombre || ""} ${u.apellido1 || ""}`.trim(),
                            codigo: ex.codigo,
                            nombreExp: ex.nombre,
                            fechaVencimientoLabel,
                            linkGestionPlazos,
                        });
                        await sendEmail(u.email, subject, text);
                        await notificacionEntregaRepo.markEnviada({
                            notificacionId: notif.id,
                            canal: "EMAIL",
                        });
                    } catch (err) {
                        await notificacionEntregaRepo.markFallida({
                            notificacionId: notif.id,
                            canal: "EMAIL",
                            errorMsg: String(err?.message || err),
                        });
                    }
                } else {
                    await notificacionEntregaRepo.markFallida({
                        notificacionId: notif.id,
                        canal: "EMAIL",
                        errorMsg: "Usuario sin correo electrónico",
                    });
                }
            }
        }

        return {
            ok: true,
            expedientesEvaluados: expedientes.length,
            notificacionesCreadas,
            archivistas: archivistas.length,
        };
    },

    /**
     * In-app + correo: expedientes CERRADOS con vencimiento en los próximos `dias` días (fecha > hoy).
     */
    async notifyExpedientesConservacionProximos(opts = {}) {
        const dias = Number(opts.dias ?? opts.days ?? 2);
        const diasVentana = Number.isInteger(dias) && dias > 0 && dias <= 30 ? dias : 2;

        const expedientes = await gestionPlazosRepo.listExpedientesCerradosVencimientoProximos(diasVentana);
        if (!expedientes.length) {
            return {
                ok: true,
                expedientesEvaluados: 0,
                notificacionesCreadas: 0,
                skipped: true,
                reason: "sin_expedientes_proximos",
                diasVentana,
            };
        }

        const archivistas = await userRepo.findArchivistaUsers();
        if (!archivistas.length) {
            return {
                ok: true,
                expedientesEvaluados: expedientes.length,
                notificacionesCreadas: 0,
                skipped: true,
                reason: "sin_archivistas",
                diasVentana,
            };
        }

        const systemActorId = Number(process.env.SYSTEM_USER_ID);
        const actor = Number.isFinite(systemActorId) ? { id: systemActorId } : { id: null };

        let notificacionesCreadas = 0;

        for (const ex of expedientes) {
            const expedienteId = Number(ex.id);
            if (!Number.isInteger(expedienteId) || expedienteId <= 0) {
                continue;
            }

            const documentoId = await expedienteRepo.findMinDocumentoIdByExpedienteId(expedienteId);
            if (!documentoId) {
                continue;
            }

            const fv = ex.fecha_vencimiento ? new Date(ex.fecha_vencimiento) : null;
            const fechaVencimientoLabel =
                fv && !Number.isNaN(fv.getTime())
                    ? fv.toLocaleDateString("es-CR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                      })
                    : "";

            const pathPlazos = `/archivista/gestion-plazos?v=alertas&expProxId=${expedienteId}`;
            const linkGestionPlazos = buildLink(pathPlazos);
            const resultado = buildExpedienteConservacionProximoResultado({
                codigo: ex.codigo,
                nombre: ex.nombre,
                dias: diasVentana,
            });

            for (const u of archivistas) {
                const uid = Number(u.id);
                if (!Number.isInteger(uid) || uid <= 0) {
                    continue;
                }

                const yaExiste = await notificacionRepo.existsNotificacionExpedienteConservacionProximo(
                    uid,
                    expedienteId
                );
                if (yaExiste) {
                    continue;
                }

                const notif = await this.create(
                    {
                        fecha: new Date(),
                        tipo: TIPO_EXPEDIENTE_CONSERVACION_PROXIMO,
                        accionRequerida: "ARCHIVAR",
                        fechaLimite: ex.fecha_vencimiento ?? null,
                        enlaceDirecto: linkGestionPlazos,
                        resultado,
                        usuarioId: uid,
                        documentoId,
                    },
                    actor
                );

                await notificacionEntregaRepo.markEnviada({
                    notificacionId: notif.id,
                    canal: "IN_APP",
                });
                notificacionesCreadas += 1;

                if (u.email && String(u.email).trim()) {
                    try {
                        const subject = `Patrimonius: plazo próximo a vencer — expediente ${ex.codigo || expedienteId}`;
                        const text = buildExpedienteConservacionProximoEmailText({
                            nombre: `${u.nombre || ""} ${u.apellido1 || ""}`.trim(),
                            codigo: ex.codigo,
                            nombreExp: ex.nombre,
                            fechaVencimientoLabel,
                            linkGestionPlazos,
                            dias: diasVentana,
                        });
                        await sendEmail(u.email, subject, text);
                        await notificacionEntregaRepo.markEnviada({
                            notificacionId: notif.id,
                            canal: "EMAIL",
                        });
                    } catch (err) {
                        await notificacionEntregaRepo.markFallida({
                            notificacionId: notif.id,
                            canal: "EMAIL",
                            errorMsg: String(err?.message || err),
                        });
                    }
                } else {
                    await notificacionEntregaRepo.markFallida({
                        notificacionId: notif.id,
                        canal: "EMAIL",
                        errorMsg: "Usuario sin correo electrónico",
                    });
                }
            }
        }

        return {
            ok: true,
            expedientesEvaluados: expedientes.length,
            notificacionesCreadas,
            archivistas: archivistas.length,
            diasVentana,
        };
    },
};




