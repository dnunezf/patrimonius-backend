import { pool } from '../db/pool.js';

export async function listarEventosAuditoria(opts) {
    const {
        page,
        pageSize,
        q,
        estado,
        resultado,
        usuario,
        documento,
        sortBy = 'fecha_hora',
        sortDir = 'desc'
    } = opts;

    const where = [];  // Array to hold the WHERE conditions
    const params = {}; // Object to hold the parameterized values

    // Adding search conditions to the WHERE clause
    if (q) {
        where.push(`(
            documento_titulo LIKE :q
            OR documento_codigo_unico LIKE :q
            OR documento_codigo_oficial LIKE :q
            OR usuario LIKE :q
            OR accion_solicitada LIKE :q
            OR razon LIKE :q
        )`);
        params.q = `%${q}%`; // Parameters for 'q' to match partial text
    }
    if (estado) {
        where.push(`estado_documento = :estado`);
        params.estado = estado;
    }
    if (resultado) {
        where.push(`resultado = :resultado`);
        params.resultado = resultado;
    }
    if (usuario) {
        where.push(`usuario LIKE :usuario`);
        params.usuario = `%${usuario}%`; // Matching partial user names
    }
    if (documento) {
        where.push(`documento_titulo LIKE :documento`);
        params.documento = `%${documento}%`; // Matching partial document titles
    }

    // If any filter is added, append the WHERE clause
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Count SQL to get the total number of records
    const countSql = `
        SELECT COUNT(1) AS total
        FROM VW_Bitacora_Ciclo_Documental_Lista
        ${whereSql};
    `;

    // Paginated data SQL
    const offset = (page - 1) * pageSize; // Calculate the offset for pagination
    const dataSql = `
        SELECT
            id_evento,
            fecha_hora,
            usuario,
            documento_titulo,
            documento_codigo_unico,
            documento_codigo_oficial,
            accion_solicitada,
            estado_documento,
            resultado,
            razon
        FROM VW_Bitacora_Ciclo_Documental_Lista
        ${whereSql}
        ORDER BY ${sortBy} ${sortDir}
        LIMIT ${pageSize} OFFSET ${offset};
    `;

    const conn = await pool.getConnection(); // Get a connection to the database
    try {
        // Get the count of total items that match the filters
        const [countRows] = await conn.execute(countSql, params);
        const totalItems = countRows[0]?.total || 0;

        // Get the paginated list of events
        const [rows] = await conn.execute(dataSql, params);

        // Calculate total pages based on total items and page size
        const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);

        // Return the paginated results with additional pagination info
        return {
            items: rows, // The actual event data
            page,        // Current page number
            pageSize,    // Number of items per page
            totalItems,  // Total number of items
            totalPages,  // Total number of pages
            hasNext: page < totalPages, // Whether there are more pages after this
            hasPrev: page > 1          // Whether there are previous pages
        };
    } finally {
        conn.release(); // Release the database connection
    }


}

// --- Document states (distinct) ---

/**
 * Returns the distinct list of states present in Documento.
 */
export async function listAllDocumentStates() {
    const sql = `
        SELECT DISTINCT estado
        FROM Documento
        WHERE estado IS NOT NULL AND estado <> ''
        ORDER BY estado ASC
    `;

    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.execute(sql);
        console.log('Document states:', rows);  // Imprimir los resultados de la consulta
        return rows.map(r => r.estado);
    } finally {
        conn.release();
    }
}


export async function getAuditEventDetailById(idEvento) {
    // NOTE: Read the event detail from the detail view.
    const sql = `
        SELECT
          id_evento,
          fecha_evento,
          accion,
          resultado,
          usuario_email,
          usuario_nombre,
          usuario_apellido1,
          usuario_apellido2,
          rol_usuario,
          documento_titulo,
          documento_codigo,
          documento_estado,
          evento_ciclo,
          accion_solicitada,
          motivo,
          descripcion
        FROM VW_Bitacora_Ciclo_Documental_Detalle
        WHERE id_evento = :id
        LIMIT 1;
      `;

    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.execute(sql, { id: idEvento });
        if (!rows || rows.length === 0) return null;
        return rows[0];
    } finally {
        conn.release();
    }
}
