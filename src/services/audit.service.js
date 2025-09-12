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



/**
 * Returns the distinct list of document states possible in Documento (estado).
 */
export async function listAllPossibleDocumentStates() {
    const sql = `
        SELECT COLUMN_TYPE
        FROM information_schema.COLUMNS
        WHERE TABLE_NAME = 'Documento' AND COLUMN_NAME = 'estado';
    `;

    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.execute(sql);

        const enumValues = rows[0]?.COLUMN_TYPE || '';

        if (!enumValues) {
            console.error("No se pudo obtener el valor de COLUMN_TYPE");
            return [];
        }

        // Limpiamos el valor del enum y lo convertimos en un array de strings
        const states = enumValues
            .replace('enum(', '')    // Elimina la palabra 'enum('
            .replace(')', '')       // Elimina el paréntesis de cierre
            .split(',')             // Divide por las comas
            .map(value => value.trim().replace(/'/g, ''));  // Elimina los espacios y comillas simples

        return states; // Ahora `states` es un array con los valores del ENUM
    } catch (err) {
        console.error('Error fetching document states:', err);
        throw err;
    } finally {
        conn.release();
    }
}


/**
 * Returns the distinct list of event states possible in Bitacora_Ciclo_Documental (evento).
 */
export async function listAllPossibleBitacoraEventStates() {
    const sql = `
        SELECT COLUMN_TYPE
        FROM information_schema.COLUMNS
        WHERE TABLE_NAME = 'Bitacora_Ciclo_Documental' AND COLUMN_NAME = 'evento';
    `;

    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.execute(sql);

        const enumValues = rows[0]?.COLUMN_TYPE || '';

        if (!enumValues) {
            console.error("No se pudo obtener el valor de COLUMN_TYPE");
            return [];
        }

        // Limpiamos el valor del enum y lo convertimos en un array de strings
        const states = enumValues
            .replace('enum(', '')    // Elimina la palabra 'enum('
            .replace(')', '')       // Elimina el paréntesis de cierre
            .split(',')             // Divide por las comas
            .map(value => value.trim().replace(/'/g, ''));  // Elimina los espacios y comillas simples

        return states; // Ahora `states` es un array con los valores del ENUM
    } catch (err) {
        console.error('Error fetching event states from Bitacora_Ciclo_Documental:', err);
        throw err;
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
