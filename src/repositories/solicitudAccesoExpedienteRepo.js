import { pool } from "../db/pool.js";

export const solicitudAccesoExpedienteRepo = {
    async create({
                     justificacion,
                     usuario_solicitante_id,
                     expediente_id,
                     estado_solicitud = "PENDIENTE",
                 }) {
        const query = `
      INSERT INTO Solicitud_Acceso_Expediente (
        justificacion,
        estado_solicitud,
        usuario_solicitante_id,
        expediente_id
      )
      VALUES (?, ?, ?, ?)
    `;

        const [result] = await pool.query(query, [
            justificacion,
            estado_solicitud,
            usuario_solicitante_id,
            expediente_id,
        ]);

        return this.findById(result.insertId);
    },

    async findById(id) {
        const query = `
      SELECT
        sae.id,
        sae.justificacion,
        sae.estado_solicitud,
        sae.motivo_resolucion,
        sae.usuario_solicitante_id,
        sae.admin_responsable_id,
        sae.expediente_id,
        sae.created_at,
        sae.updated_at
      FROM Solicitud_Acceso_Expediente sae
      WHERE sae.id = ?
      LIMIT 1
    `;
        const [rows] = await pool.query(query, [id]);
        return rows[0] ?? null;
    },

    async findPendingByUsuarioAndExpediente(usuarioId, expedienteId) {
        const query = `
      SELECT id
      FROM Solicitud_Acceso_Expediente
      WHERE usuario_solicitante_id = ?
        AND expediente_id = ?
        AND estado_solicitud = 'PENDIENTE'
      LIMIT 1
    `;
        const [rows] = await pool.query(query, [usuarioId, expedienteId]);
        return rows[0] ?? null;
    },

    async findByIdDetailed(id) {
        const query = `
      SELECT
        sae.id,
        sae.justificacion,
        sae.estado_solicitud,
        sae.motivo_resolucion,
        sae.usuario_solicitante_id,
        sae.admin_responsable_id,
        sae.expediente_id,
        sae.created_at,
        sae.updated_at,

        us.nombre AS solicitante_nombre,
        us.apellido1 AS solicitante_apellido1,
        us.apellido2 AS solicitante_apellido2,
        rs.nombre AS solicitante_rol,

        ua.nombre AS admin_nombre,
        ua.apellido1 AS admin_apellido1,
        ua.apellido2 AS admin_apellido2,

        e.codigo AS expediente_codigo,
        e.nombre AS expediente_nombre,
        e.estado AS expediente_estado
      FROM Solicitud_Acceso_Expediente sae
      INNER JOIN Usuario us
        ON us.id = sae.usuario_solicitante_id
      LEFT JOIN Rol rs
        ON rs.id = us.rol_id
      LEFT JOIN Usuario ua
        ON ua.id = sae.admin_responsable_id
      INNER JOIN Expediente e
        ON e.id = sae.expediente_id
      WHERE sae.id = ?
      LIMIT 1
    `;
        const [rows] = await pool.query(query, [id]);
        return rows[0] ?? null;
    },

    async listAll() {
        const query = `
      SELECT
        sae.id,
        sae.justificacion,
        sae.estado_solicitud,
        sae.motivo_resolucion,
        sae.usuario_solicitante_id,
        sae.admin_responsable_id,
        sae.expediente_id,
        sae.created_at,
        sae.updated_at,

        us.nombre AS solicitante_nombre,
        us.apellido1 AS solicitante_apellido1,
        us.apellido2 AS solicitante_apellido2,
        rs.nombre AS solicitante_rol,

        ua.nombre AS admin_nombre,
        ua.apellido1 AS admin_apellido1,
        ua.apellido2 AS admin_apellido2,

        e.codigo AS expediente_codigo,
        e.nombre AS expediente_nombre,
        e.estado AS expediente_estado
      FROM Solicitud_Acceso_Expediente sae
      INNER JOIN Usuario us
        ON us.id = sae.usuario_solicitante_id
      LEFT JOIN Rol rs
        ON rs.id = us.rol_id
      LEFT JOIN Usuario ua
        ON ua.id = sae.admin_responsable_id
      INNER JOIN Expediente e
        ON e.id = sae.expediente_id
      ORDER BY sae.created_at DESC, sae.id DESC
    `;
        const [rows] = await pool.query(query);
        return rows;
    },

    async listByUsuarioSolicitante(usuarioId) {
        const query = `
      SELECT
        sae.id,
        sae.justificacion,
        sae.estado_solicitud,
        sae.motivo_resolucion,
        sae.usuario_solicitante_id,
        sae.admin_responsable_id,
        sae.expediente_id,
        sae.created_at,
        sae.updated_at,

        e.codigo AS expediente_codigo,
        e.nombre AS expediente_nombre,
        e.estado AS expediente_estado,

        ua.nombre AS admin_nombre,
        ua.apellido1 AS admin_apellido1,
        ua.apellido2 AS admin_apellido2
      FROM Solicitud_Acceso_Expediente sae
      INNER JOIN Expediente e
        ON e.id = sae.expediente_id
      LEFT JOIN Usuario ua
        ON ua.id = sae.admin_responsable_id
      WHERE sae.usuario_solicitante_id = ?
      ORDER BY sae.created_at DESC, sae.id DESC
    `;
        const [rows] = await pool.query(query, [usuarioId]);
        return rows;
    },

    async updateResolution({
                               id,
                               estado_solicitud,
                               motivo_resolucion,
                               admin_responsable_id,
                           }) {
        const query = `
      UPDATE Solicitud_Acceso_Expediente
      SET
        estado_solicitud = ?,
        motivo_resolucion = ?,
        admin_responsable_id = ?
      WHERE id = ?
    `;

        await pool.query(query, [
            estado_solicitud,
            motivo_resolucion,
            admin_responsable_id,
            id,
        ]);

        return this.findById(id);
    },
};