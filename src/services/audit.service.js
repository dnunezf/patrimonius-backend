//src/services/audit.service.js
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


        const states = enumValues
            .replace('enum(', '')
            .replace(')', '')
            .split(',')
            .map(value => value.trim().replace(/'/g, ''));

        return states;
    } catch (err) {
        console.error('Error fetching event states from Bitacora_Ciclo_Documental:', err);
        throw err;
    } finally {
        conn.release();
    }
}



export async function getAuditEventDetailById(idEvento) {
    // Keep parity with seguridad detail endpoint: return all fields from the view.
    const sql = `
        SELECT *
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

export async function listarEventosSeguridad({
                                                 page = 1,
                                                 pageSize = 25,
                                                 q,
                                                 usuario,
                                                 tipoEvento,   // Bitacora_Seguridad.tipo_evento
                                                 resultado,
                                                 accion,
                                                 sortBy = "fecha_hora",
                                                 sortDir = "DESC",
                                             }) {
    const pageNum = Math.max(Number(page) || 1, 1);
    const sizeNum = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
    const offset = (pageNum - 1) * sizeNum;

    const ALLOWED_SORT = new Set([
        "fecha_hora",
        "usuario",
        "accion",
        "resultado",
        "tipo_evento",
        "ip",
    ]);
    const sortCol = ALLOWED_SORT.has(String(sortBy)) ? String(sortBy) : "fecha_hora";
    const sortDirection = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

    const where = [];
    const params = {};

    // filtros
    if (q && String(q).trim()) {
        params.q = `%${String(q).trim()}%`;
        where.push(`(
      usuario LIKE :q OR accion LIKE :q OR resultado LIKE :q
      OR tipo_evento LIKE :q OR ip LIKE :q OR user_agent LIKE :q
    )`);
    }

    if (usuario && String(usuario).trim()) {
        params.usuario = String(usuario).trim();
        where.push(`usuario = :usuario`);
    }

    if (tipoEvento && String(tipoEvento).trim()) {
        params.tipoEvento = String(tipoEvento).trim();
        where.push(`tipo_evento = :tipoEvento`);
    }

    if (accion && String(accion).trim()) {
        params.accion = String(accion).trim();
        where.push(`accion = :accion`);
    }

    // ✅ CAMBIO CLAVE: resultado por prefijo (PERMITIDO: ... / DENEGADO: ...)
    if (resultado && String(resultado).trim()) {
        params.resultado = `${String(resultado).trim()}%`; // "PERMITIDO%" o "DENEGADO%"
        where.push(`UPPER(resultado) LIKE UPPER(:resultado)`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total
     FROM VW_Bitacora_Seguridad_Lista
     ${whereSql}`,
        params
    );

    const totalItems = Number(countRows[0]?.total || 0);
    const totalPages = Math.max(Math.ceil(totalItems / sizeNum), 1);

    const [rows] = await pool.query(
        `SELECT *
     FROM VW_Bitacora_Seguridad_Lista
     ${whereSql}
     ORDER BY ${sortCol} ${sortDirection}
     LIMIT :limit OFFSET :offset`,
        { ...params, limit: sizeNum, offset }
    );

    return {
        items: rows,
        page: pageNum,
        pageSize: sizeNum,
        totalItems,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
    };
}


export async function getSecurityEventDetailById(id) {
    const [rows] = await pool.query(
        `SELECT *
     FROM VW_Bitacora_Seguridad_Detalle
     WHERE id_evento = :id
     LIMIT 1`,
        { id }
    );
    return rows[0] || null;
}

export async function listAllPossibleSecurityEventTypes() {
    const [rows] = await pool.query(
        `SELECT DISTINCT tipo_evento
     FROM VW_Bitacora_Seguridad_Lista
     WHERE tipo_evento IS NOT NULL
     ORDER BY tipo_evento ASC`
    );
    return rows.map(r => r.tipo_evento);
}

export async function listAllPossibleSecurityActions() {
    const [rows] = await pool.query(
        `SELECT DISTINCT accion
     FROM VW_Bitacora_Seguridad_Lista
     WHERE accion IS NOT NULL
     ORDER BY accion ASC`
    );
    return rows.map(r => r.accion);
}

// --- Bitácora Permisos (VW_Bitacora_Permisos_Lista / _Detalle) ---

/**
 * Lista paginada desde VW_Bitacora_Permisos_Lista (mismo shape que security/events).
 */
export async function listarEventosBitacoraPermisos({
    page = 1,
    pageSize = 25,
    q,
    tipoFlujo,
    estadoFlujo,
    accion,
    usuario,
    documento,
    from,
    to,
    sortBy = "fecha_hora",
    sortDir = "DESC",
}) {
    const pageNum = Math.max(Number(page) || 1, 1);
    const sizeNum = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
    const offset = (pageNum - 1) * sizeNum;

    const ALLOWED_SORT = new Set([
        "fecha_hora",
        "id_registro",
        "titulo_documento",
        "numero_serie_documento",
        "responsable_email",
        "usuario_objetivo_email",
        "tipo_flujo",
        "estado_flujo",
        "accion",
        "resultado_resumen",
    ]);
    const sortCol = ALLOWED_SORT.has(String(sortBy)) ? String(sortBy) : "fecha_hora";
    const sortDirection = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

    const where = [];
    const params = {};

    if (q && String(q).trim()) {
        params.q = `%${String(q).trim()}%`;
        where.push(`(
      titulo_documento LIKE :q
      OR numero_serie_documento LIKE :q
      OR responsable_email LIKE :q
      OR responsable_nombre_completo LIKE :q
      OR usuario_objetivo_email LIKE :q
      OR usuario_objetivo_nombre_completo LIKE :q
      OR resultado_resumen LIKE :q
      OR accion LIKE :q
      OR permisos_csv LIKE :q
      OR solicitud_id LIKE :q
    )`);
    }

    if (tipoFlujo && String(tipoFlujo).trim()) {
        params.tipoFlujo = String(tipoFlujo).trim();
        where.push(`tipo_flujo = :tipoFlujo`);
    }

    if (estadoFlujo && String(estadoFlujo).trim()) {
        params.estadoFlujo = String(estadoFlujo).trim();
        where.push(`estado_flujo = :estadoFlujo`);
    }

    if (accion && String(accion).trim()) {
        params.accion = String(accion).trim();
        where.push(`accion = :accion`);
    }

    if (usuario && String(usuario).trim()) {
        params.usuario = `%${String(usuario).trim()}%`;
        where.push(`(
      responsable_email LIKE :usuario
      OR usuario_objetivo_email LIKE :usuario
      OR responsable_nombre_completo LIKE :usuario
      OR usuario_objetivo_nombre_completo LIKE :usuario
    )`);
    }

    if (documento && String(documento).trim()) {
        params.documento = `%${String(documento).trim()}%`;
        where.push(`(
      titulo_documento LIKE :documento
      OR numero_serie_documento LIKE :documento
    )`);
    }

    if (from && String(from).trim()) {
        params.fromDt = `${String(from).trim()} 00:00:00`;
        where.push(`fecha_hora >= :fromDt`);
    }

    if (to && String(to).trim()) {
        params.toDt = `${String(to).trim()} 23:59:59`;
        where.push(`fecha_hora <= :toDt`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total
     FROM VW_Bitacora_Permisos_Lista
     ${whereSql}`,
        params
    );

    const totalItems = Number(countRows[0]?.total || 0);
    const totalPages = Math.max(Math.ceil(totalItems / sizeNum), 1);

    const [rows] = await pool.query(
        `SELECT *
     FROM VW_Bitacora_Permisos_Lista
     ${whereSql}
     ORDER BY ${sortCol} ${sortDirection}
     LIMIT :limit OFFSET :offset`,
        { ...params, limit: sizeNum, offset }
    );

    return {
        items: rows,
        page: pageNum,
        pageSize: sizeNum,
        totalItems,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
    };
}

export async function getBitacoraPermisoDetailById(idRegistro) {
    const [rows] = await pool.query(
        `SELECT *
     FROM VW_Bitacora_Permisos_Detalle
     WHERE id_registro = :id
     LIMIT 1`,
        { id: Number(idRegistro) }
    );
    return rows[0] || null;
}

export async function listAllPossiblePermissionBitacoraTipoFlujo() {
    const [rows] = await pool.query(
        `SELECT DISTINCT tipo_flujo
     FROM VW_Bitacora_Permisos_Lista
     WHERE tipo_flujo IS NOT NULL
     ORDER BY tipo_flujo ASC`
    );
    return rows.map((r) => r.tipo_flujo);
}

export async function listAllPossiblePermissionBitacoraEstadoFlujo() {
    const [rows] = await pool.query(
        `SELECT DISTINCT estado_flujo
     FROM VW_Bitacora_Permisos_Lista
     WHERE estado_flujo IS NOT NULL
     ORDER BY estado_flujo ASC`
    );
    return rows.map((r) => r.estado_flujo);
}