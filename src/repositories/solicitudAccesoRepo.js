import { pool } from "../db/pool.js";

export const solicitudAccesoRepo = {
    async create({
                     justificacion,
                     usuario_solicitante_id,
                     documento_id,
                     estado_solicitud = "PENDIENTE",
                 }) {
        const query = `
      INSERT INTO Solicitud_Acceso (
        justificacion,
        estado_solicitud,
        usuario_solicitante_id,
        documento_id
      )
      VALUES (?, ?, ?, ?)
    `;

        const [result] = await pool.query(query, [
            justificacion,
            estado_solicitud,
            usuario_solicitante_id,
            documento_id,
        ]);

        return this.findById(result.insertId);
    },

    async findById(id) {
        const query = `
      SELECT
        sa.id,
        sa.justificacion,
        sa.estado_solicitud,
        sa.motivo_resolucion,
        sa.usuario_solicitante_id,
        sa.admin_responsable_id,
        sa.documento_id,
        sa.created_at,
        sa.updated_at
      FROM Solicitud_Acceso sa
      WHERE sa.id = ?
      LIMIT 1
    `;
        const [rows] = await pool.query(query, [id]);
        return rows[0] ?? null;
    },

    async findByIdDetailed(id) {
        const query = `
      SELECT
        sa.id,
        sa.justificacion,
        sa.estado_solicitud,
        sa.motivo_resolucion,
        sa.usuario_solicitante_id,
        sa.admin_responsable_id,
        sa.documento_id,
        sa.created_at,
        sa.updated_at,

        us.nombre AS solicitante_nombre,
        us.apellido1 AS solicitante_apellido1,
        us.apellido2 AS solicitante_apellido2,
        rs.nombre AS solicitante_rol,

        ua.nombre AS admin_nombre,
        ua.apellido1 AS admin_apellido1,
        ua.apellido2 AS admin_apellido2,

        d.titulo AS documento_titulo,
        d.estado AS documento_estado,
        d.numero_serie
      FROM Solicitud_Acceso sa
      INNER JOIN Usuario us
        ON us.id = sa.usuario_solicitante_id
      LEFT JOIN Rol rs
        ON rs.id = us.rol_id
      LEFT JOIN Usuario ua
        ON ua.id = sa.admin_responsable_id
      INNER JOIN Documento d
        ON d.id = sa.documento_id
      WHERE sa.id = ?
      LIMIT 1
    `;
        const [rows] = await pool.query(query, [id]);
        return rows[0] ?? null;
    },

    async listAll() {
        const query = `
      SELECT
        sa.id,
        sa.justificacion,
        sa.estado_solicitud,
        sa.motivo_resolucion,
        sa.usuario_solicitante_id,
        sa.admin_responsable_id,
        sa.documento_id,
        sa.created_at,
        sa.updated_at,

        us.nombre AS solicitante_nombre,
        us.apellido1 AS solicitante_apellido1,
        us.apellido2 AS solicitante_apellido2,
        rs.nombre AS solicitante_rol,

        ua.nombre AS admin_nombre,
        ua.apellido1 AS admin_apellido1,
        ua.apellido2 AS admin_apellido2,

        d.titulo AS documento_titulo,
        d.estado AS documento_estado,
        d.numero_serie
      FROM Solicitud_Acceso sa
      INNER JOIN Usuario us
        ON us.id = sa.usuario_solicitante_id
      LEFT JOIN Rol rs
        ON rs.id = us.rol_id
      LEFT JOIN Usuario ua
        ON ua.id = sa.admin_responsable_id
      INNER JOIN Documento d
        ON d.id = sa.documento_id
      ORDER BY sa.created_at DESC, sa.id DESC
    `;
        const [rows] = await pool.query(query);
        return rows;
    },

    async listByUsuarioSolicitante(usuarioId) {
        const query = `
      SELECT
        sa.id,
        sa.justificacion,
        sa.estado_solicitud,
        sa.motivo_resolucion,
        sa.usuario_solicitante_id,
        sa.admin_responsable_id,
        sa.documento_id,
        sa.created_at,
        sa.updated_at,

        d.titulo AS documento_titulo,
        d.estado AS documento_estado,
        d.numero_serie,

        ua.nombre AS admin_nombre,
        ua.apellido1 AS admin_apellido1,
        ua.apellido2 AS admin_apellido2
      FROM Solicitud_Acceso sa
      INNER JOIN Documento d
        ON d.id = sa.documento_id
      LEFT JOIN Usuario ua
        ON ua.id = sa.admin_responsable_id
      WHERE sa.usuario_solicitante_id = ?
      ORDER BY sa.created_at DESC, sa.id DESC
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
      UPDATE Solicitud_Acceso
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