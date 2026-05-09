// src/repositories/consultaAprobados.repo.js
import { pool } from "../db/pool.js";

/** Estados finales consultables (HU-025): aprobados y archivados. */
export const ESTADOS_CONSULTA = ["APROBADO", "ARCHIVADO", "CONSERVACION"];

const SQL_ESTADOS_CONSULTA = `d.estado IN ('APROBADO','ARCHIVADO','CONSERVACION')`;
/** HU-025: solo documentos firmados (o sin requisito de firmas). */
const SQL_FIRMADO = `(d.numero_firmas = 0 OR d.firmas_obtenidas >= d.numero_firmas)`;

const SORT_MAP = {
    /** Expresión real en SQL (no alias), para ORDER BY estable en todos los motores */
    fecha_aprobacion: "COALESCE(vdmax.fecha_max, d.fecha)",
    titulo: "d.titulo",
    codigo: "d.numero_serie",
    estado: "d.estado",
    unidad: "u.nombre",
    categoria: "c.nombre",
};

function buildOrder(sortBy, sortDir) {
    const col = SORT_MAP[sortBy] || SORT_MAP.fecha_aprobacion;
    const dir = String(sortDir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    return `${col} ${dir}, d.id DESC`;
}

/**
 * Condición de confidencialidad para usuarios internos (misma unidad obligatoria salvo master).
 * PUBLIC e INTERNAL visibles dentro de la unidad; HIGH/RESTRICTED requieren lista explícita con VIEW.
 */
function sqlConfidInternal() {
    return `(
        d.confid_level IN ('PUBLIC', 'INTERNAL')
        OR EXISTS (
            SELECT 1 FROM Documento_Allowed_User dau
            WHERE dau.documento_id = d.id AND dau.usuario_id = ?
              AND FIND_IN_SET('VIEW', UPPER(TRIM(REPLACE(dau.actions, ' ', '')))) > 0
        )
        OR EXISTS (
            SELECT 1 FROM Documento_Allowed_Rol dar
            INNER JOIN Usuario_Rol ur ON ur.rol_id = dar.rol_id AND ur.usuario_id = ?
            WHERE dar.documento_id = d.id
              AND FIND_IN_SET('VIEW', UPPER(TRIM(REPLACE(dar.actions, ' ', '')))) > 0
        )
    )`;
}

function sqlGrantExterno() {
    return `(
        EXISTS (
            SELECT 1 FROM Permiso_Usuario pu
            WHERE pu.documento_id = d.id AND pu.usuario_id = ? AND pu.permiso = 'VIEW'
        )
        OR EXISTS (
            SELECT 1 FROM Documento_Allowed_User dau
            WHERE dau.documento_id = d.id AND dau.usuario_id = ?
              AND FIND_IN_SET('VIEW', UPPER(TRIM(REPLACE(dau.actions, ' ', '')))) > 0
        )
        OR EXISTS (
            SELECT 1 FROM Documento_Allowed_Rol dar
            INNER JOIN Usuario_Rol ur ON ur.rol_id = dar.rol_id AND ur.usuario_id = ?
            WHERE dar.documento_id = d.id
              AND FIND_IN_SET('VIEW', UPPER(TRIM(REPLACE(dar.actions, ' ', '')))) > 0
        )
    )`;
}

function sqlGrantExternoConExpediente() {
    return `(
        EXISTS (
            SELECT 1 FROM Permiso_Usuario pu
            WHERE pu.documento_id = d.id
              AND pu.usuario_id = ?
              AND pu.permiso = 'VIEW'
        )
        OR EXISTS (
            SELECT 1 FROM Documento_Allowed_User dau
            WHERE dau.documento_id = d.id
              AND dau.usuario_id = ?
              AND FIND_IN_SET('VIEW', UPPER(TRIM(REPLACE(dau.actions, ' ', '')))) > 0
        )
        OR EXISTS (
            SELECT 1 FROM Documento_Allowed_Rol dar
            INNER JOIN Usuario_Rol ur
                ON ur.rol_id = dar.rol_id
               AND ur.usuario_id = ?
            WHERE dar.documento_id = d.id
              AND FIND_IN_SET('VIEW', UPPER(TRIM(REPLACE(dar.actions, ' ', '')))) > 0
        )
        OR EXISTS (
            SELECT 1
            FROM Permiso_Usuario_Expediente pue
            WHERE pue.usuario_id = ?
              AND pue.expediente_id = d.expediente_id
              AND pue.permiso = 'VIEW'
              AND d.expediente_id IS NOT NULL
              AND d.confid_level = 'PUBLIC'
              AND d.estado IN ('ARCHIVADO', 'CONSERVACION')
        )
    )`;
}

export const consultaAprobadosRepo = {
    async searchInternal({
        userId,
        unidadId,
        isMaster,
        rolIds = [],
        filters = {},
        page = 1,
        pageSize = 10,
        sortBy = "fecha_aprobacion",
        sortDir = "desc",
    }) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 10));
        const offset = (p - 1) * ps;

        const args = [];
        const where = [SQL_ESTADOS_CONSULTA, SQL_FIRMADO];

        if (isMaster) {
            where.push("(1=1)");
        } else {
            where.push("d.unidad_id = ?");
            args.push(Number(unidadId));
        }

        where.push(sqlConfidInternal());
        args.push(Number(userId), Number(userId));

        this._applyCommonFilters(where, args, filters);

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const orderSql = buildOrder(sortBy, sortDir);

        const baseFrom = `
            FROM Documento d
            INNER JOIN Unidad_Organizacional u ON u.id = d.unidad_id
            LEFT JOIN Categoria c ON c.id = d.categoria_id
            LEFT JOIN Usuario cu ON cu.id = d.usuario_id
            LEFT JOIN Expediente e ON e.id = d.expediente_id
            LEFT JOIN Serie s ON s.id = e.serie_id
            LEFT JOIN Subserie ss ON ss.id = e.subserie_id
            LEFT JOIN (
                SELECT documento_id, MAX(fecha) AS fecha_max
                FROM Version_Documento
                GROUP BY documento_id
            ) vdmax ON vdmax.documento_id = d.id
        `;

        const [countRows] = await pool.query(
            `SELECT COUNT(*) AS total ${baseFrom} ${whereSql}`,
            args
        );
        const totalItems = Number(countRows?.[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(totalItems / ps));

        const selectCols = `
            SELECT
                d.id AS id,
                d.numero_serie AS codigo,
                d.titulo AS titulo,
                d.estado AS estado,
                d.confid_level AS confid_level,
                COALESCE(vdmax.fecha_max, d.fecha) AS fecha_aprobacion,
                u.id AS unidad_id,
                u.nombre AS unidad_nombre,
                c.id AS categoria_id,
                c.nombre AS categoria_nombre,
                e.id AS expediente_id,
                e.codigo AS expediente_codigo,
                s.nombre AS serie_nombre,
                ss.nombre AS subserie_nombre,
                TRIM(CONCAT(IFNULL(cu.nombre, ''), ' ', IFNULL(cu.apellido1, ''), ' ', IFNULL(cu.apellido2, ''))) AS autor_nombre
        `;

        const [rows] = await pool.query(
            `${selectCols}
            ${baseFrom}
            ${whereSql}
            ORDER BY ${orderSql}
            LIMIT ? OFFSET ?`,
            [...args, ps, offset]
        );

        return {
            items: rows || [],
            totalItems,
            totalPages,
            page: p,
            pageSize: ps,
        };
    },

    async searchExterno({
        userId,
        unidadId,
        isMaster = false,
        rolIds = [],
        filters = {},
        page = 1,
        pageSize = 10,
        sortBy = "fecha_aprobacion",
        sortDir = "desc",
    }) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 10));
        const offset = (p - 1) * ps;

        const args = [];
        /** Catálogo externo: solo documentos públicos aprobados/archivados/conservación y firmados. */
        const where = [
            SQL_ESTADOS_CONSULTA,
            SQL_FIRMADO,
            "d.confid_level = 'PUBLIC'",
        ];

        if (!isMaster) {
            where.push("d.unidad_id = ?");
            args.push(Number(unidadId));
        }

        this._applyCommonFilters(where, args, filters);

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const orderSql = buildOrder(sortBy, sortDir);

        const baseFrom = `
            FROM Documento d
            INNER JOIN Unidad_Organizacional u ON u.id = d.unidad_id
            LEFT JOIN Categoria c ON c.id = d.categoria_id
            LEFT JOIN Usuario cu ON cu.id = d.usuario_id
            LEFT JOIN Expediente e ON e.id = d.expediente_id
            LEFT JOIN Serie s ON s.id = e.serie_id
            LEFT JOIN Subserie ss ON ss.id = e.subserie_id
            LEFT JOIN (
                SELECT documento_id, MAX(fecha) AS fecha_max
                FROM Version_Documento
                GROUP BY documento_id
            ) vdmax ON vdmax.documento_id = d.id
        `;

        const [countRows] = await pool.query(
            `SELECT COUNT(*) AS total ${baseFrom} ${whereSql}`,
            args
        );
        const totalItems = Number(countRows?.[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(totalItems / ps));

        const whereSqlConPermisoDescarga = `${whereSql} AND ${sqlGrantExternoConExpediente()}`;
        const uid = Number(userId);

        const [permCountRows] = await pool.query(
            `SELECT COUNT(*) AS total ${baseFrom} ${whereSqlConPermisoDescarga}`,
            [...args, uid, uid, uid, uid]
        );
        const totalDescargables = Number(permCountRows?.[0]?.total || 0);

        const [rows] = await pool.query(
            `SELECT
        d.id AS id,
        d.numero_serie AS codigo,
        d.titulo AS titulo,
        d.estado AS estado,
        d.confid_level AS confid_level,
        COALESCE(vdmax.fecha_max, d.fecha) AS fecha_aprobacion,
        u.id AS unidad_id,
        u.nombre AS unidad_nombre,
        c.id AS categoria_id,
        c.nombre AS categoria_nombre,
        e.id AS expediente_id,
        e.codigo AS expediente_codigo,
        s.nombre AS serie_nombre,
        ss.nombre AS subserie_nombre,
        TRIM(CONCAT(IFNULL(cu.nombre, ''), ' ', IFNULL(cu.apellido1, ''), ' ', IFNULL(cu.apellido2, ''))) AS autor_nombre,
        ${sqlGrantExternoConExpediente()} AS can_view_perm,
        EXISTS (
            SELECT 1
            FROM Solicitud_Acceso sa
            WHERE sa.documento_id = d.id
              AND sa.usuario_solicitante_id = ?
              AND sa.estado_solicitud = 'PENDIENTE'
        ) AS has_pending_request
    ${baseFrom}
    ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ? OFFSET ?`,
            [uid, uid, uid, uid, uid, ...args, ps, offset]
        );

        return {
            items: rows || [],
            totalItems,
            totalDescargables,
            totalPages,
            page: p,
            pageSize: ps,
        };
    },

    _applyCommonFilters(where, args, f) {
        const q = f.q != null ? String(f.q).trim() : "";
        const codigo = f.codigo != null ? String(f.codigo).trim() : "";
        const titulo = f.titulo != null ? String(f.titulo).trim() : "";

        if (codigo) {
            where.push(`LOWER(IFNULL(d.numero_serie, '')) LIKE LOWER(?)`);
            args.push(`%${codigo}%`);
        }

        if (titulo) {
            where.push(`LOWER(IFNULL(d.titulo, '')) LIKE LOWER(?)`);
            args.push(`%${titulo}%`);
        }

        // Compatibilidad con el filtro general anterior
        if (q) {
            const like = `%${q}%`;
            where.push(`(
            LOWER(IFNULL(d.titulo, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(d.numero_serie, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(c.nombre, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(u.nombre, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(s.nombre, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(e.codigo, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(d.contenido, '')) LIKE LOWER(?)
            OR EXISTS (
                SELECT 1 FROM Metadato m
                WHERE m.documento_id = d.id AND LOWER(IFNULL(m.valor, '')) LIKE LOWER(?)
            )
        )`);
            args.push(like, like, like, like, like, like, like, like);
        }

        if (f.categoriaId != null && String(f.categoriaId).trim() !== "") {
            where.push("d.categoria_id = ?");
            args.push(Number(f.categoriaId));
        }

        if (f.unidadId != null && String(f.unidadId).trim() !== "") {
            where.push("d.unidad_id = ?");
            args.push(Number(f.unidadId));
        }

        if (f.serieId != null && String(f.serieId).trim() !== "") {
            where.push("e.serie_id = ?");
            args.push(Number(f.serieId));
        }

        if (f.subserieId != null && String(f.subserieId).trim() !== "") {
            where.push("e.subserie_id = ?");
            args.push(Number(f.subserieId));
        }

        if (f.expedienteId != null && String(f.expedienteId).trim() !== "") {
            where.push("d.expediente_id = ?");
            args.push(Number(f.expedienteId));
        }

        if (f.dateFrom) {
            where.push("DATE(COALESCE((SELECT MAX(vd.fecha) FROM Version_Documento vd WHERE vd.documento_id = d.id), d.fecha)) >= ?");
            args.push(String(f.dateFrom).slice(0, 10));
        }

        if (f.dateTo) {
            where.push("DATE(COALESCE((SELECT MAX(vd.fecha) FROM Version_Documento vd WHERE vd.documento_id = d.id), d.fecha)) <= ?");
            args.push(String(f.dateTo).slice(0, 10));
        }
    },

    /**
     * Opciones de filtros según documentos accesibles (sin keyword).
     */
    async listFiltersInternal({ userId, unidadId, isMaster }) {
        const args = [];
        const where = [SQL_ESTADOS_CONSULTA, SQL_FIRMADO];
        if (isMaster) {
            where.push("(1=1)");
        } else {
            where.push("d.unidad_id = ?");
            args.push(Number(unidadId));
        }
        where.push(sqlConfidInternal());
        args.push(Number(userId), Number(userId));

        const whereSql = `WHERE ${where.join(" AND ")}`;

        const [cats] = await pool.query(
            `SELECT DISTINCT c.id, c.nombre
             FROM Documento d
             LEFT JOIN Categoria c ON c.id = d.categoria_id
             ${whereSql}
             AND c.id IS NOT NULL
             ORDER BY c.nombre`,
            args
        );

        const [unidades] = await pool.query(
            `SELECT DISTINCT u.id, u.nombre
             FROM Documento d
             INNER JOIN Unidad_Organizacional u ON u.id = d.unidad_id
             ${whereSql}
             ORDER BY u.nombre`,
            args
        );

        const [series] = await pool.query(
            `SELECT DISTINCT s.id, s.nombre, s.unidad_id
             FROM Documento d
             LEFT JOIN Expediente e ON e.id = d.expediente_id
             LEFT JOIN Serie s ON s.id = e.serie_id
             ${whereSql}
             AND s.id IS NOT NULL
             ORDER BY s.nombre`,
            args
        );

        const [subseries] = await pool.query(
            `SELECT DISTINCT ss.id, ss.nombre, ss.serie_id
             FROM Documento d
             LEFT JOIN Expediente e ON e.id = d.expediente_id
             LEFT JOIN Subserie ss ON ss.id = e.subserie_id
             ${whereSql}
             AND ss.id IS NOT NULL
             ORDER BY ss.nombre`,
            args
        );

        return {
            categorias: cats || [],
            unidades: unidades || [],
            series: series || [],
            subseries: subseries || [],
        };
    },

    async listFiltersExterno({ unidadId, isMaster = false } = {}) {
        const parts = [
            SQL_ESTADOS_CONSULTA,
            SQL_FIRMADO,
            "d.confid_level = 'PUBLIC'",
        ];
        const args = [];
        if (!isMaster) {
            parts.push("d.unidad_id = ?");
            args.push(Number(unidadId));
        }
        const where = `WHERE ${parts.join(" AND ")}`;

        const [cats] = await pool.query(
            `SELECT DISTINCT c.id, c.nombre
             FROM Documento d
             LEFT JOIN Categoria c ON c.id = d.categoria_id
             ${where}
             AND c.id IS NOT NULL
             ORDER BY c.nombre`,
            args
        );

        const [unidades] = await pool.query(
            `SELECT DISTINCT u.id, u.nombre
             FROM Documento d
             INNER JOIN Unidad_Organizacional u ON u.id = d.unidad_id
             ${where}
             ORDER BY u.nombre`,
            args
        );

        const [series] = await pool.query(
            `SELECT DISTINCT s.id, s.nombre, s.unidad_id
             FROM Documento d
             LEFT JOIN Expediente e ON e.id = d.expediente_id
             LEFT JOIN Serie s ON s.id = e.serie_id
             ${where}
             AND s.id IS NOT NULL
             ORDER BY s.nombre`,
            args
        );

        const [subseries] = await pool.query(
            `SELECT DISTINCT ss.id, ss.nombre, ss.serie_id
             FROM Documento d
             LEFT JOIN Expediente e ON e.id = d.expediente_id
             LEFT JOIN Subserie ss ON ss.id = e.subserie_id
             ${where}
             AND ss.id IS NOT NULL
             ORDER BY ss.nombre`,
            args
        );

        return {
            categorias: cats || [],
            unidades: unidades || [],
            series: series || [],
            subseries: subseries || [],
        };
    },

    /**
     * Comprueba si el documento cumple reglas de consulta interna (y existe).
     */
    async existsForInternal({ documentoId, userId, unidadId, isMaster }) {
        const args = [Number(documentoId)];
        const where = [`d.id = ?`, SQL_ESTADOS_CONSULTA, SQL_FIRMADO];

        if (isMaster) {
            where.push("(1=1)");
        } else {
            where.push("d.unidad_id = ?");
            args.push(Number(unidadId));
        }

        where.push(sqlConfidInternal());
        args.push(Number(userId), Number(userId));

        const [rows] = await pool.query(
            `SELECT d.id FROM Documento d ${where.length ? `WHERE ${where.join(" AND ")}` : ""} LIMIT 1`,
            args
        );
        return rows.length > 0;
    },

    async existsForExterno({ documentoId, userId, unidadId, isMaster = false }) {
        const parts = [
            `d.id = ?`,
            SQL_ESTADOS_CONSULTA,
            SQL_FIRMADO,
            "d.confid_level = 'PUBLIC'",
        ];
        const args = [Number(documentoId)];
        if (!isMaster) {
            parts.push("d.unidad_id = ?");
            args.push(Number(unidadId));
        }
        args.push(
            Number(userId),
            Number(userId),
            Number(userId),
            Number(userId),
        );
        const [rows] = await pool.query(
            `SELECT d.id FROM Documento d
             WHERE ${parts.join(" AND ")}
               AND ${sqlGrantExternoConExpediente()}
                 LIMIT 1`,
            args
        );
        return rows.length > 0;
    },

    /**
     * HU-026 / HU-024: mismo criterio que descarga PDF para usuario externo (`Permiso_Usuario` VIEW aprobado).
     * Vista previa y descarga vía consulta no deben exponer contenido sin esta aprobación explícita.
     */
    async existsForExternoPermisoDescarga({ documentoId, userId, unidadId, isMaster = false }) {
        const did = Number(documentoId);
        const uid = Number(userId);

        const parts = [
            `d.id = ?`,
            SQL_ESTADOS_CONSULTA,
            SQL_FIRMADO,
            "d.confid_level = 'PUBLIC'",
        ];
        const args = [did];
        if (!isMaster) {
            parts.push("d.unidad_id = ?");
            args.push(Number(unidadId));
        }
        args.push(uid, uid, uid, uid);

        const [rows] = await pool.query(
            `SELECT d.id
             FROM Documento d
             WHERE ${parts.join(" AND ")}
               AND ${sqlGrantExternoConExpediente()}
                 LIMIT 1`,
            args
        );

        return rows.length > 0;
    },

    /**
     * Novedades: documentos cuya fecha efectiva (última versión o alta) cae en el rango [dateFrom, dateTo].
     * Misma regla de visibilidad que la búsqueda interna.
     */
    async listNovedadesSemanaActual({
        userId,
        unidadId,
        isMaster,
        dateFrom,
        dateTo,
        page = 1,
        pageSize = 20,
        fechaDesde = null,
    }) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const offset = (p - 1) * ps;

        const args = [];
        const where = [SQL_ESTADOS_CONSULTA, SQL_FIRMADO];

        if (isMaster) {
            where.push("(1=1)");
        } else {
            where.push("d.unidad_id = ?");
            args.push(Number(unidadId));
        }

        where.push(sqlConfidInternal());
        args.push(Number(userId), Number(userId));

        const df = String(dateFrom).slice(0, 10);
        const dt = String(dateTo).slice(0, 10);
        where.push(
            `DATE(COALESCE((SELECT MAX(vd.fecha) FROM Version_Documento vd WHERE vd.documento_id = d.id), d.fecha)) >= ?`
        );
        args.push(df);
        where.push(
            `DATE(COALESCE((SELECT MAX(vd.fecha) FROM Version_Documento vd WHERE vd.documento_id = d.id), d.fecha)) <= ?`
        );
        args.push(dt);

        if (fechaDesde) {
            const d = new Date(fechaDesde);
            if (!Number.isNaN(d.getTime())) {
                where.push(`COALESCE(vdmax.fecha_max, d.fecha) >= ?`);
                args.push(d);
            }
        }

        const baseFrom = `
            FROM Documento d
            INNER JOIN Unidad_Organizacional u ON u.id = d.unidad_id
            LEFT JOIN Categoria c ON c.id = d.categoria_id
            LEFT JOIN Usuario cu ON cu.id = d.usuario_id
            LEFT JOIN Expediente e ON e.id = d.expediente_id
            LEFT JOIN Serie s ON s.id = e.serie_id
            LEFT JOIN Subserie ss ON ss.id = e.subserie_id
            LEFT JOIN (
                SELECT documento_id, MAX(fecha) AS fecha_max
                FROM Version_Documento
                GROUP BY documento_id
            ) vdmax ON vdmax.documento_id = d.id
        `;

        const whereSql = `WHERE ${where.join(" AND ")}`;

        const [countRows] = await pool.query(
            `SELECT COUNT(*) AS n ${baseFrom} ${whereSql}`,
            args
        );
        const totalItems = Number(countRows?.[0]?.n || 0);

        const [rows] = await pool.query(
            `SELECT
                d.id AS id,
                d.numero_serie AS codigo,
                d.titulo AS titulo,
                d.estado AS estado,
                d.confid_level AS confid_level,
                COALESCE(vdmax.fecha_max, d.fecha) AS fecha_aprobacion,
                u.nombre AS unidad_nombre,
                c.nombre AS categoria_nombre
            ${baseFrom}
            ${whereSql}
            ORDER BY COALESCE(vdmax.fecha_max, d.fecha) DESC, d.id DESC
            LIMIT ? OFFSET ?`,
            [...args, ps, offset]
        );

        return {
            items: rows || [],
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / ps)),
            page: p,
            pageSize: ps,
        };
    },

    /** Metadatos de documentos por ids que el usuario puede ver con reglas internas (favoritos). */
    async getDocumentosByIdsInternal({ ids, userId, unidadId, isMaster }) {
        const clean = [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
        if (!clean.length) return [];

        const placeholders = clean.map(() => "?").join(",");
        const args = [...clean];
        const where = [`d.id IN (${placeholders})`, SQL_ESTADOS_CONSULTA, SQL_FIRMADO];

        if (isMaster) {
            where.push("(1=1)");
        } else {
            where.push("d.unidad_id = ?");
            args.push(Number(unidadId));
        }

        where.push(sqlConfidInternal());
        args.push(Number(userId), Number(userId));

        const baseFrom = `
            FROM Documento d
            INNER JOIN Unidad_Organizacional u ON u.id = d.unidad_id
            LEFT JOIN Categoria c ON c.id = d.categoria_id
            LEFT JOIN Usuario cu ON cu.id = d.usuario_id
            LEFT JOIN Expediente e ON e.id = d.expediente_id
            LEFT JOIN Serie s ON s.id = e.serie_id
            LEFT JOIN Subserie ss ON ss.id = e.subserie_id
            LEFT JOIN (
                SELECT documento_id, MAX(fecha) AS fecha_max
                FROM Version_Documento
                GROUP BY documento_id
            ) vdmax ON vdmax.documento_id = d.id
        `;

        const orderField = clean.map(() => "?").join(",");
        const [rows] = await pool.query(
            `SELECT
                d.id AS id,
                d.numero_serie AS codigo,
                d.titulo AS titulo,
                d.estado AS estado,
                d.confid_level AS confid_level,
                COALESCE(vdmax.fecha_max, d.fecha) AS fecha_aprobacion,
                u.nombre AS unidad_nombre,
                c.nombre AS categoria_nombre,
                s.nombre AS serie_nombre,
                ss.nombre AS subserie_nombre,
                TRIM(CONCAT(IFNULL(cu.nombre, ''), ' ', IFNULL(cu.apellido1, ''), ' ', IFNULL(cu.apellido2, ''))) AS autor_nombre
            ${baseFrom}
            WHERE ${where.join(" AND ")}
            ORDER BY FIELD(d.id, ${orderField})`,
            [...args, ...clean]
        );

        return rows || [];
    },

    /**
     * Documentos de un expediente visibles con reglas de consulta interna (unidad + confidencialidad).
     */
    async listDocumentsByExpedienteInternal({ expedienteId, userId, unidadId, isMaster }) {
        const eid = Number(expedienteId);
        const args = [eid];
        const where = [`d.expediente_id = ?`, SQL_ESTADOS_CONSULTA, SQL_FIRMADO];

        if (isMaster) {
            where.push("(1=1)");
        } else {
            where.push("d.unidad_id = ?");
            args.push(Number(unidadId));
        }

        where.push(sqlConfidInternal());
        args.push(Number(userId), Number(userId));

        const [rows] = await pool.query(
            `SELECT
                d.id,
                d.numero_serie AS codigo,
                d.titulo,
                d.estado,
                d.confid_level,
                COALESCE(vdmax.fecha_max, d.fecha) AS fecha_aprobacion,
                COALESCE(vdmax.fecha_max, d.fecha) AS fecha,
                c.nombre AS categoria_nombre,
                u.nombre AS unidad_nombre,
                e.codigo AS expediente_codigo,
                s.nombre AS serie_nombre,
                ss.nombre AS subserie_nombre,
                TRIM(CONCAT(IFNULL(cu.nombre, ''), ' ', IFNULL(cu.apellido1, ''), ' ', IFNULL(cu.apellido2, ''))) AS autor_nombre
            FROM Documento d
            INNER JOIN Expediente e ON e.id = d.expediente_id
            INNER JOIN Unidad_Organizacional u ON u.id = d.unidad_id
            LEFT JOIN Categoria c ON c.id = d.categoria_id
            LEFT JOIN Usuario cu ON cu.id = d.usuario_id
            LEFT JOIN Serie s ON s.id = e.serie_id
            LEFT JOIN Subserie ss ON ss.id = e.subserie_id
            LEFT JOIN (
                SELECT documento_id, MAX(fecha) AS fecha_max
                FROM Version_Documento
                GROUP BY documento_id
            ) vdmax ON vdmax.documento_id = d.id
            WHERE ${where.join(" AND ")}
            ORDER BY COALESCE(vdmax.fecha_max, d.fecha) DESC, d.id DESC`,
            args
        );

        return rows || [];
    },
};
