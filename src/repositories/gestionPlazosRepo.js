import { pool } from '../db/pool.js';

export async function findDocumentoById(documentoId) {
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
                d.plazo_tipo,
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
}

export async function assignConservationTerm(documentoId, data) {
    const [result] = await pool.query(
        `
      UPDATE Documento
      SET
        plazo_valor = ?,
        plazo_unidad = ?,
        plazo_tipo = ?,
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
            data.plazo_tipo,
            data.fecha_inicio_conservacion,
            data.fecha_vencimiento,
            data.estado_conservacion,
            data.plazo_asignado_por,
            documentoId,
        ]
    );

    return result;
}

export async function listDocumentosConPlazo(filters = {}) {
    const conditions = [];
    const params = [];

    conditions.push(`d.estado = 'ARCHIVADO'`);

    if (filters.estado_conservacion) {
        conditions.push(`d.estado_conservacion = ?`);
        params.push(filters.estado_conservacion);
    }

    if (filters.plazo_tipo) {
        conditions.push(`d.plazo_tipo = ?`);
        params.push(filters.plazo_tipo);
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
        d.plazo_tipo,
        d.fecha_inicio_conservacion,
        d.fecha_vencimiento,
        d.estado_conservacion,
        d.plazo_asignado_por,
        d.plazo_asignado_en,
        u.correo AS asignado_por_correo
      FROM Documento d
      LEFT JOIN Usuario u ON u.id = d.plazo_asignado_por
      ${whereClause}
      ORDER BY d.fecha_vencimiento ASC, d.id DESC
    `,
        params
    );

    return rows;
}

export async function listProximosAVencer(days = 30) {
    const [rows] = await pool.query(
        `
            SELECT
                d.id,
                d.titulo,
                d.estado,
                d.usuario_id,
                d.plazo_valor,
                d.plazo_unidad,
                d.plazo_tipo,
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
}

export async function listVencidos() {
    const [rows] = await pool.query(
        `
            SELECT
                d.id,
                d.titulo,
                d.estado,
                d.usuario_id,
                d.plazo_valor,
                d.plazo_unidad,
                d.plazo_tipo,
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
}