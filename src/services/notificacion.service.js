

import { notificacionRepo } from "../repositories/notificacionRepo.js";
import { notificacionEntregaRepo } from "../repositories/notificacionEntregaRepo.js";
import { logAdminAction } from "../repositories/bitacoraRepo.js";
import { sendEmail } from "../utils/mailer.js";
import {firmaRepo} from "../repositories/firmaRepo.js";
import {userRepo} from "../repositories/userRepo.js";
import {documentoRepo} from "../repositories/documentoRepo.js";
import { metadatoRepo } from "../repositories/metadatoRepo.js";

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

    const header = `Hola ${nombre || ""}`.trim();
    const intro = plural
        ? `Resumen: Se editaron ${collapsed.length} documentos en los que sos autor(a).`
        : `Resumen: Se editó 1 documento en el que sos autor(a).`;

    const lines = collapsed.map((it, idx) => {
        const when = new Date(it.fecha).toLocaleString("es-CR");

        const editors = Array.from(it._editors || []);
        const editorLine =
            editors.length <= 1
                ? editors[0] || "No disponible"
                : editors.join(", ");

        const veces = it._count > 1 ? ` (${it._count} veces)` : "";

        // ✅ si no hay enlace, igual mostrás uno útil (fallback)
        const link = buildDocLink(it.documento_id, it.enlace_directo) || "(sin enlace)";


        return (
            `${idx + 1}) ${it.documento_titulo}\n` +
            `   - Editado por: ${editorLine}${veces}\n` +
            `   - Última edición: ${when}\n` +
            `   - Enlace: ${link}\n`
        );
    });

    return [
        header,
        "",
        `📌 ${intro}`,
        dateLabel ? `🗓️ Fecha del resumen: ${dateLabel}` : "",
        "",
        ...lines,
        "",
        "— Patrimonius",
    ].filter(Boolean).join("\n");
}
function buildSignEmailText({ nombre, documentoNombre, link }) {
    return [
        `Hola ${nombre || ""}`.trim(),
        "",
        `Se solicita tu firma para el documento: ${documentoNombre}`,
        `Enlace: ${link}`,
        "",
        "— Patrimonius",
    ].join("\n");
}
function buildArchiveEmailText({ nombre, documentoNombre }) {
    return [
        `Hola ${nombre || ""}`.trim(),
        "",
        `El documento "${documentoNombre}" fue archivado.`,
        "",
        "— Patrimonius",
    ].join("\n");
}
function buildDeleteEmailText({ nombre, documentoNombre, creadoEn }) {
    return [
        `Hola ${nombre || ""}`.trim(),
        "",
        `El documento "${documentoNombre}" fue marcado para eliminación.`,
        `Fecha de creación: ${creadoEn}`,
        "",
        "— Patrimonius",
    ].join("\n");
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
        // 1) filtro actor
        const selected = Array.from(new Set(selectedUserIds.map(Number))).filter(id => id && id !== Number(actorId));

        // 2) filtro "ya firmaron"
        const signedIds = await firmaRepo.listSignerUserIds(documentoId);
        const recipients = selected.filter(id => !signedIds.includes(id));

        if (!recipients.length) return { notified: 0 };

        // 3) datos de destinatarios
        const users = await userRepo.findEmailsByIds(recipients);
        const doc = await documentoRepo.findById(documentoId); // para titulo
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

};




