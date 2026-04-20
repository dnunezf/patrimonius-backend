//src/services/audit.service.js
import { pool } from '../db/pool.js';
import {
    sqlUserActivityBitacoraJoinFilter,
    USER_ACTIVITY_RECURSOS_FILTRO,
} from '../utils/userActivityBitacoraPolicy.js';

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
    const params = []; // Ordered SQL params for positional placeholders

    // Adding search conditions to the WHERE clause
    if (q) {
        where.push(`(
            documento_titulo LIKE ?
            OR documento_codigo_unico LIKE ?
            OR usuario LIKE ?
            OR accion_solicitada LIKE ?
            OR razon LIKE ?
        )`);
        const likeQ = `%${q}%`;
        params.push(likeQ, likeQ, likeQ, likeQ, likeQ);
    }
    if (estado) {
        where.push(`estado_documento = ?`);
        params.push(estado);
    }
    if (resultado) {
        where.push(`resultado = ?`);
        params.push(resultado);
    }
    if (usuario) {
        where.push(`usuario LIKE ?`);
        params.push(`%${usuario}%`); // Matching partial user names
    }
    if (documento) {
        where.push(`documento_titulo LIKE ?`);
        params.push(`%${documento}%`); // Matching partial document titles
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

// --- Bitácora Base + Actividad de Usuario (Bitacora_Actividad_Usuario) ---

const SORT_COL_ACTIVIDAD_USUARIO = {
    fecha_hora: "b.fecha",
    id_evento: "b.id",
    usuario: "u.email",
    documento_titulo: "d.titulo",
    accion: "b.accion",
    resultado: "b.resultado",
    actividad: "a.actividad",
    recurso: "a.recurso",
};

/**
 * Lista paginada: Bitacora_Base + Bitacora_Actividad_Usuario (mismo patrón que security/events).
 */
export async function listarEventosActividadUsuario({
    page = 1,
    pageSize = 25,
    q,
    usuario,
    documento,
    actividad,
    recurso,
    resultado,
    from,
    to,
    sortBy = "fecha_hora",
    sortDir = "DESC",
}) {
    const pageNum = Math.max(Number(page) || 1, 1);
    const sizeNum = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
    const offset = (pageNum - 1) * sizeNum;

    const sortCol = SORT_COL_ACTIVIDAD_USUARIO[String(sortBy)] || SORT_COL_ACTIVIDAD_USUARIO.fecha_hora;
    const sortDirection = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

    const where = [];
    const params = {};

    if (q && String(q).trim()) {
        params.q = `%${String(q).trim()}%`;
        where.push(`(
      b.accion LIKE :q
      OR b.resultado LIKE :q
      OR a.actividad LIKE :q
      OR a.recurso LIKE :q
      OR a.parametros LIKE :q
      OR u.email LIKE :q
      OR d.titulo LIKE :q
      OR d.numero_serie LIKE :q
    )`);
    }

    if (usuario && String(usuario).trim()) {
        params.usuario = `%${String(usuario).trim()}%`;
        where.push(`u.email LIKE :usuario`);
    }

    if (documento && String(documento).trim()) {
        params.documento = `%${String(documento).trim()}%`;
        where.push(`(d.titulo LIKE :documento OR d.numero_serie LIKE :documento)`);
    }

    if (actividad && String(actividad).trim()) {
        params.actividad = String(actividad).trim();
        where.push(`a.actividad = :actividad`);
    }

    if (recurso && String(recurso).trim()) {
        params.recurso = String(recurso).trim();
        where.push(`a.recurso = :recurso`);
    }

    if (resultado && String(resultado).trim()) {
        params.resultado = `${String(resultado).trim()}%`;
        where.push(`UPPER(b.resultado) LIKE UPPER(:resultado)`);
    }

    if (from && String(from).trim()) {
        params.fromDt = `${String(from).trim()} 00:00:00`;
        where.push(`b.fecha >= :fromDt`);
    }

    if (to && String(to).trim()) {
        params.toDt = `${String(to).trim()} 23:59:59`;
        where.push(`b.fecha <= :toDt`);
    }

    where.push(sqlUserActivityBitacoraJoinFilter('b', 'a'));

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const fromSql = `
    FROM Bitacora_Base b
    INNER JOIN Bitacora_Actividad_Usuario a ON a.id = b.id
    LEFT JOIN Usuario u ON u.id = b.usuario_id
    LEFT JOIN Documento d ON d.id = b.documento_id
    ${whereSql}
  `;

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total ${fromSql}`, params);
    const totalItems = Number(countRows[0]?.total || 0);
    const totalPages = Math.max(Math.ceil(totalItems / sizeNum), 1);

    const [rows] = await pool.query(
        `SELECT
      b.id AS id_evento,
      b.fecha AS fecha_hora,
      u.email AS usuario,
      b.accion AS accion,
      b.resultado AS resultado,
      a.actividad AS actividad,
      a.recurso AS recurso,
      d.titulo AS documento_titulo,
      d.numero_serie AS documento_codigo_unico,
      LEFT(a.parametros, 400) AS parametros_resumen
    ${fromSql}
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

export async function getActividadUsuarioBitacoraDetailById(idEvento) {
    const [rows] = await pool.query(
        `SELECT
      b.id AS id_evento,
      b.fecha AS fecha_evento,
      b.usuario_id AS usuario_id,
      u.email AS usuario_email,
      TRIM(CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellido1,''),' ',COALESCE(u.apellido2,''))) AS usuario_nombre_completo,
      r.nombre AS rol_usuario,
      b.accion AS accion,
      b.resultado AS resultado,
      b.documento_id AS documento_id,
      d.titulo AS documento_titulo,
      d.numero_serie AS documento_numero_serie,
      a.actividad AS actividad,
      a.recurso AS recurso,
      a.parametros AS parametros
    FROM Bitacora_Base b
    INNER JOIN Bitacora_Actividad_Usuario a ON a.id = b.id
    LEFT JOIN Usuario u ON u.id = b.usuario_id
    LEFT JOIN Rol r ON r.id = u.rol_id
    LEFT JOIN Documento d ON d.id = b.documento_id
    WHERE b.id = :id AND ${sqlUserActivityBitacoraJoinFilter('b', 'a')}
    LIMIT 1`,
        { id: Number(idEvento) }
    );
    return rows[0] || null;
}

export async function listDistinctActividadUsuarioActividades() {
    const scope = sqlUserActivityBitacoraJoinFilter('b', 'a');
    const [rows] = await pool.query(
        `SELECT DISTINCT a.actividad
     FROM Bitacora_Actividad_Usuario a
     INNER JOIN Bitacora_Base b ON b.id = a.id
     WHERE ${scope}
       AND a.actividad IS NOT NULL AND TRIM(a.actividad) <> ''
     ORDER BY a.actividad ASC`
    );
    return rows.map((r) => r.actividad);
}

export async function listDistinctActividadUsuarioRecursos() {
    return [...USER_ACTIVITY_RECURSOS_FILTRO];
}

// --- Bitácora Expediente (VW_Bitacora_Expediente_Lista / _Detalle) ---

/**
 * Lista paginada desde VW_Bitacora_Expediente_Lista (mismo patrón que permission-bitacora/events).
 */
export async function listarEventosBitacoraExpediente({
    page = 1,
    pageSize = 25,
    q,
    evento,
    resultado,
    expedienteId,
    usuario,
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
        "expediente_codigo",
        "expediente_nombre",
        "evento",
        "resultado",
        "usuario_email",
        "expediente_estado_actual",
    ]);
    const sortCol = ALLOWED_SORT.has(String(sortBy)) ? String(sortBy) : "fecha_hora";
    const sortDirection = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

    const where = [];
    const params = {};

    if (q && String(q).trim()) {
        params.q = `%${String(q).trim()}%`;
        where.push(`(
      expediente_codigo LIKE :q
      OR expediente_nombre LIKE :q
      OR usuario_email LIKE :q
      OR usuario_nombre_completo LIKE :q
      OR CAST(evento AS CHAR) LIKE :q
      OR CAST(resultado AS CHAR) LIKE :q
    )`);
    }

    if (evento && String(evento).trim()) {
        params.evento = String(evento).trim();
        where.push(`evento = :evento`);
    }

    if (resultado && String(resultado).trim()) {
        params.resultado = String(resultado).trim();
        where.push(`resultado = :resultado`);
    }

    if (expedienteId != null && String(expedienteId).trim() !== "") {
        const eid = Number(expedienteId);
        if (Number.isFinite(eid) && eid > 0) {
            params.expedienteId = eid;
            where.push(`expediente_id = :expedienteId`);
        }
    }

    if (usuario && String(usuario).trim()) {
        params.usuario = `%${String(usuario).trim()}%`;
        where.push(`(
      usuario_email LIKE :usuario
      OR usuario_nombre_completo LIKE :usuario
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
     FROM VW_Bitacora_Expediente_Lista
     ${whereSql}`,
        params
    );

    const totalItems = Number(countRows[0]?.total || 0);
    const totalPages = Math.max(Math.ceil(totalItems / sizeNum), 1);

    const [rows] = await pool.query(
        `SELECT *
     FROM VW_Bitacora_Expediente_Lista
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

export async function getBitacoraExpedienteDetailById(idRegistro) {
    const [rows] = await pool.query(
        `SELECT *
     FROM VW_Bitacora_Expediente_Detalle
     WHERE id_registro = :id
     LIMIT 1`,
        { id: Number(idRegistro) }
    );
    return rows[0] || null;
}

export async function listAllPossibleBitacoraExpedienteEventos() {
    const [rows] = await pool.query(
        `SELECT DISTINCT evento
     FROM VW_Bitacora_Expediente_Lista
     WHERE evento IS NOT NULL
     ORDER BY evento ASC`
    );
    return rows.map((r) => r.evento);
}

export async function listAllPossibleBitacoraExpedienteResultados() {
    const [rows] = await pool.query(
        `SELECT DISTINCT resultado
     FROM VW_Bitacora_Expediente_Lista
     WHERE resultado IS NOT NULL
     ORDER BY resultado ASC`
    );
    return rows.map((r) => r.resultado);
}