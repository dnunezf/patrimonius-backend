import { pool } from '../db/pool.js';

// src/repositories/gestionPlazosRepo.js

export const gestionPlazosRepo = {
    // Buscar documento por ID
    async findDocumentoById(documentoId) {
        const [rows] = await pool.query(
            `
        SELECT
          d.id,
          d.titulo,
          d.estado,
          d.usuario_id,
          d.unidad_id,
          d.categoria_id,
          d.plazo_valor,
          d.plazo_unidad,
          d.fecha_inicio_conservacion,
          d.fecha_vencimiento,
          d.estado_conservacion,
          d.plazo_asignado_por,
          d.plazo_asignado_en
        FROM Documento d
        WHERE d.id = ?
          LIMIT 1
      `,
            [documentoId]
        );

        return rows[0] || null;
    },

    // Asignar plazo de conservación a un documento
    async assignConservationTerm(documentoId, data) {
        const [result] = await pool.query(
            `
        UPDATE Documento
        SET
          plazo_valor = ?,
          plazo_unidad = ?,
          fecha_inicio_conservacion = ?,
          fecha_vencimiento = ?,
          estado_conservacion = ?,
          plazo_asignado_por = ?,
          plazo_asignado_en = NOW()
        WHERE id = ?
      `,
            [
                data.plazo_valor,
                data.plazo_unidad,
                data.fecha_inicio_conservacion,
                data.fecha_vencimiento,
                data.estado_conservacion,
                data.plazo_asignado_por,
                documentoId,
            ]
        );

        return result;
    },

    // Listar documentos con un plazo asignado
    async listDocumentosConPlazo(filters = {}) {
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
    },

    // Listar documentos próximos a vencer
    async listProximosAVencer(days = 30) {
        const [rows] = await pool.query(
            `
        SELECT
          d.id,
          d.titulo,
          d.estado,
          d.usuario_id,
          d.plazo_valor,
          d.plazo_unidad,
          d.fecha_inicio_conservacion,
          d.fecha_vencimiento,
          d.estado_conservacion,
          DATEDIFF(d.fecha_vencimiento, CURDATE()) AS dias_restantes
        FROM Documento d
        WHERE d.estado = 'ARCHIVADO'
          AND d.fecha_vencimiento IS NOT NULL
          AND d.fecha_vencimiento >= CURDATE()
          AND d.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ORDER BY d.fecha_vencimiento ASC
      `,
            [Number(days)]
        );

        return rows;
    },

    /**
     * Expedientes en estado final (cerrado, transferido, eliminado) para gestión de plazos.
     */
    async listExpedientesConPlazoConservacion(filters = {}) {
        const conditions = [];
        const params = [];

        // Comparación robusta (ENUM / espacios / mayúsculas); estados finales de expediente
        conditions.push(
            `UPPER(TRIM(CAST(e.estado AS CHAR))) IN ('CERRADO', 'TRANSFERIDO', 'ELIMINADO')`
        );

        if (filters.estado) {
            const allowed = ['CERRADO', 'TRANSFERIDO', 'ELIMINADO'];
            const eSt = String(filters.estado).trim().toUpperCase();
            if (allowed.includes(eSt)) {
                conditions.push(`UPPER(TRIM(CAST(e.estado AS CHAR))) = ?`);
                params.push(eSt);
            }
        }

        if (filters.unidad_id) {
            const uid = Number(filters.unidad_id);
            if (Number.isInteger(uid) && uid > 0) {
                conditions.push(`e.unidad_id = ?`);
                params.push(uid);
            }
        }

        if (filters.serie_id) {
            const sid = Number(filters.serie_id);
            if (Number.isInteger(sid) && sid > 0) {
                conditions.push(`e.serie_id = ?`);
                params.push(sid);
            }
        }

        if (filters.subserie_id) {
            const ssid = Number(filters.subserie_id);
            if (Number.isInteger(ssid) && ssid > 0) {
                conditions.push(`e.subserie_id = ?`);
                params.push(ssid);
            }
        }

        if (filters.texto && String(filters.texto).trim()) {
            const t = `%${String(filters.texto).trim()}%`;
            conditions.push(`(
        e.codigo LIKE ?
        OR e.nombre LIKE ?
        OR COALESCE(u.nombre, '') LIKE ?
        OR COALESCE(s.nombre, '') LIKE ?
        OR (ss.nombre IS NOT NULL AND ss.nombre LIKE ?)
        OR CAST(e.id AS CHAR) LIKE ?
      )`);
            params.push(t, t, t, t, t, t);
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const [rows] = await pool.query(
            `
        SELECT
          e.id AS id,
          e.codigo AS codigo,
          e.nombre AS nombre,
          COALESCE(u.nombre, '—') AS unidad_nombre,
          COALESCE(s.nombre, '—') AS serie_nombre,
          ss.nombre AS subserie_nombre,
          UPPER(TRIM(CAST(e.estado AS CHAR))) AS estado,
          e.fecha_creacion AS fecha_creacion,
          e.fecha_cierre AS fecha_cierre,
          e.fecha_inicio_vigencia AS fecha_inicio_vigencia,
          e.fecha_vencimiento AS fecha_vencimiento,
          COALESCE(
            NULLIF(
              TRIM(
                CONCAT_WS(
                  ' ',
                  NULLIF(TRIM(creador.nombre), ''),
                  NULLIF(TRIM(creador.apellido1), ''),
                  NULLIF(TRIM(creador.apellido2), '')
                )
              ),
              ''
            ),
            NULLIF(TRIM(creador.email), ''),
            '—'
          ) AS creado_por
        FROM Expediente e
        LEFT JOIN Unidad_Organizacional u ON u.id = e.unidad_id
        LEFT JOIN Serie s ON s.id = e.serie_id
        LEFT JOIN Subserie ss ON ss.id = e.subserie_id
        LEFT JOIN Usuario creador ON creador.id = e.created_by
        ${whereClause}
        ORDER BY e.fecha_cierre IS NULL, e.fecha_cierre DESC, e.id DESC
      `,
            params
        );

        return rows;
    },

    // Listar documentos vencidos
    async listVencidos() {
        const [rows] = await pool.query(
            `
        SELECT
          d.id,
          d.titulo,
          d.estado,
          d.usuario_id,
          d.plazo_valor,
          d.plazo_unidad,
          d.fecha_inicio_conservacion,
          d.fecha_vencimiento,
          d.estado_conservacion,
          DATEDIFF(CURDATE(), d.fecha_vencimiento) AS dias_vencido
        FROM Documento d
        WHERE d.estado = 'ARCHIVADO'
          AND d.fecha_vencimiento IS NOT NULL
          AND d.fecha_vencimiento < CURDATE()
        ORDER BY d.fecha_vencimiento ASC
      `
        );

        return rows;
    },

    /** Expediente en estado final con `fecha_vencimiento` (gestión de plazos / extensión). */
    async getExpedienteParaExtenderVigencia(expedienteId) {
        const eid = Number(expedienteId);
        if (!Number.isInteger(eid) || eid <= 0) {
            return null;
        }
        const [rows] = await pool.query(
            `
        SELECT
          e.id,
          e.codigo,
          e.nombre,
          UPPER(TRIM(CAST(e.estado AS CHAR))) AS estado,
          e.fecha_vencimiento
        FROM Expediente e
        WHERE e.id = ?
          AND UPPER(TRIM(CAST(e.estado AS CHAR))) IN ('CERRADO', 'TRANSFERIDO', 'ELIMINADO')
        LIMIT 1
      `,
            [eid]
        );
        return rows[0] || null;
    },

    async updateExpedienteFechaVencimiento(expedienteId, fechaVencimiento) {
        const eid = Number(expedienteId);
        if (!Number.isInteger(eid) || eid <= 0) {
            return false;
        }
        const [result] = await pool.query(
            `UPDATE Expediente SET fecha_vencimiento = ? WHERE id = ?`,
            [fechaVencimiento, eid]
        );
        return result.affectedRows > 0;
    },

    /**
     * Expedientes en estado final cuya fecha de vencimiento (solo día) es anterior a hoy.
     * Misma regla que la pestaña «Alertas de vencimiento» en gestión de plazos.
     */
    async listExpedientesArchivadosVencimientoPasado() {
        const [rows] = await pool.query(
            `
        SELECT
          e.id AS id,
          e.codigo AS codigo,
          e.nombre AS nombre,
          UPPER(TRIM(CAST(e.estado AS CHAR))) AS estado,
          e.fecha_vencimiento AS fecha_vencimiento
        FROM Expediente e
        WHERE UPPER(TRIM(CAST(e.estado AS CHAR))) IN ('CERRADO', 'TRANSFERIDO', 'ELIMINADO')
          AND e.fecha_vencimiento IS NOT NULL
          AND DATE(e.fecha_vencimiento) < CURDATE()
        ORDER BY e.fecha_vencimiento ASC, e.id ASC
      `
        );
        return rows || [];
    },
};

export default gestionPlazosRepo;