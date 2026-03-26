

import { pool } from "../db/pool.js";

export const notificacionEntregaRepo = {
    async createForNotificacion(notificacionId, canales = ["IN_APP", "EMAIL"]) {
        const values = canales.map(() => "(?, ?)").join(", ");
        const params = canales.flatMap(c => [notificacionId, c]);

        await pool.execute(
            `INSERT INTO Notificacion_Entrega (notificacion_id, canal) VALUES ${values}`,
            params
        );
    },

    async markEnviada({ notificacionId, canal, proveedorMsgId = null }) {
        await pool.execute(
            `UPDATE Notificacion_Entrega
       SET estado='ENVIADA',
           enviado_en=NOW(),
           intentos=intentos+1,
           ultimo_intento=NOW(),
           proveedor_msg_id = COALESCE(:proveedorMsgId, proveedor_msg_id),
           error_msg=NULL
       WHERE notificacion_id=:notificacionId AND canal=:canal`,
            { notificacionId, canal, proveedorMsgId }
        );
    },

    async markFallida({ notificacionId, canal, errorMsg }) {
        await pool.execute(
            `UPDATE Notificacion_Entrega
       SET estado='FALLIDA',
           intentos=intentos+1,
           ultimo_intento=NOW(),
           error_msg=:errorMsg
       WHERE notificacion_id=:notificacionId AND canal=:canal`,
            { notificacionId, canal, errorMsg }
        );
    },


    async listPendingEmailEdits() {
        const [rows] = await pool.query(
            `SELECT ne.notificacion_id,
              n.usuario_id AS destinatario_id,
              du.email AS destinatario_email,
              du.nombre AS destinatario_nombre,

              n.documento_id,
              d.titulo AS documento_titulo,
              d.numero_serie AS documento_numero_serie,

              n.fecha,
              n.enlace_directo,
              n.resultado

       FROM Notificacion_Entrega ne
       JOIN Notificacion n ON n.id = ne.notificacion_id
       JOIN Usuario du ON du.id = n.usuario_id
       JOIN Documento d ON d.id = n.documento_id

       WHERE ne.canal='EMAIL'
         AND ne.estado='PENDIENTE'
         AND n.accion_requerida='EDITAR'
       ORDER BY n.usuario_id, n.fecha DESC`
        );
        return rows;
    },

    async markEmailBatchSent(notificacionIds) {
        if (!notificacionIds.length) return;
        // IN (...) seguro por placeholders
        const placeholders = notificacionIds.map(() => "?").join(",");
        await pool.execute(
            `UPDATE Notificacion_Entrega
       SET estado='ENVIADA', enviado_en=NOW(), intentos=intentos+1, ultimo_intento=NOW(), error_msg=NULL
       WHERE canal='EMAIL' AND notificacion_id IN (${placeholders})`,
            notificacionIds
        );
    },
};
