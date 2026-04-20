import { pool } from '../db/pool.js';

const expedienteRepo = {
    async getAll() {
        const [rows] = await pool.query(`
      SELECT
        e.id,
        e.codigo,
        e.nombre,
        e.fecha_creacion,
        e.fecha_cierre,
        e.descripcion,
        e.estado,
        e.unidad_id,
        e.serie_id,
        e.subserie_id,
        e.created_by,
        e.updated_at,
        u.nombre AS unidad_nombre,
        s.nombre AS serie_nombre,
        ss.nombre AS subserie_nombre
      FROM Expediente e
      INNER JOIN Unidad_Organizacional u ON u.id = e.unidad_id
      INNER JOIN Serie s ON s.id = e.serie_id
      LEFT JOIN Subserie ss ON ss.id = e.subserie_id
      ORDER BY e.fecha_creacion DESC
    `);

        return rows;
    },

    async getById(id) {
        const [rows] = await pool.query(`
      SELECT
        e.id,
        e.codigo,
        e.nombre,
        e.fecha_creacion,
        e.fecha_cierre,
        e.descripcion,
        e.estado,
        e.unidad_id,
        e.serie_id,
        e.subserie_id,
        e.created_by,
        e.updated_at,
        u.nombre AS unidad_nombre,
        s.nombre AS serie_nombre,
        ss.nombre AS subserie_nombre
      FROM Expediente e
      INNER JOIN Unidad_Organizacional u ON u.id = e.unidad_id
      INNER JOIN Serie s ON s.id = e.serie_id
      LEFT JOIN Subserie ss ON ss.id = e.subserie_id
      WHERE e.id = ?
      LIMIT 1
    `, [id]);

        return rows[0] || null;
    },

    async getByFilters({ unidad_id, serie_id, subserie_id, estado }) {
        let sql = `
      SELECT
        e.id,
        e.codigo,
        e.nombre,
        e.fecha_creacion,
        e.fecha_cierre,
        e.descripcion,
        e.estado,
        e.unidad_id,
        e.serie_id,
        e.subserie_id,
        e.created_by,
        e.updated_at
      FROM Expediente e
      WHERE 1 = 1
    `;
        const params = [];

        if (unidad_id) {
            sql += ` AND e.unidad_id = ?`;
            params.push(unidad_id);
        }

        if (serie_id) {
            sql += ` AND e.serie_id = ?`;
            params.push(serie_id);
        }

        if (subserie_id !== undefined && subserie_id !== null && subserie_id !== '') {
            sql += ` AND e.subserie_id = ?`;
            params.push(subserie_id);
        }

        if (estado) {
            sql += ` AND e.estado = ?`;
            params.push(estado);
        }

        sql += ` ORDER BY e.nombre ASC`;

        const [rows] = await pool.query(sql, params);
        return rows;
    },

    async create({
                     codigo,
                     nombre,
                     descripcion,
                     unidad_id,
                     serie_id,
                     subserie_id,
                     estado = 'ACTIVO',
                     created_by = null
                 }) {
        const [result] = await pool.query(`
      INSERT INTO Expediente (
        codigo,
        nombre,
        descripcion,
        unidad_id,
        serie_id,
        subserie_id,
        estado,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            codigo,
            nombre,
            descripcion ?? null,
            unidad_id,
            serie_id,
            subserie_id ?? null,
            estado,
            created_by
        ]);

        return this.getById(result.insertId);
    },

    async update(id, {
        codigo,
        nombre,
        descripcion,
        unidad_id,
        serie_id,
        subserie_id,
        estado,
        fecha_cierre
    }) {
        await pool.query(`
      UPDATE Expediente
      SET
        codigo = ?,
        nombre = ?,
        descripcion = ?,
        unidad_id = ?,
        serie_id = ?,
        subserie_id = ?,
        estado = ?,
        fecha_cierre = ?
      WHERE id = ?
    `, [
            codigo,
            nombre,
            descripcion ?? null,
            unidad_id,
            serie_id,
            subserie_id ?? null,
            estado,
            fecha_cierre ?? null,
            id
        ]);

        return this.getById(id);
    },

    async remove(id) {
        const [result] = await pool.query(`
      DELETE FROM Expediente
      WHERE id = ?
    `, [id]);

        return result.affectedRows > 0;
    },

    async existsByCodigo(codigo) {
        const [rows] = await pool.query(`
      SELECT id
      FROM Expediente
      WHERE codigo = ?
      LIMIT 1
    `, [codigo]);

        return rows[0] || null;
    },

    async searchAccess({
                           userId,
                           codigo = "",
                           nombre = "",
                           serieId = "",
                           subserieId = "",
                           soloConElegibles = "",
                           q = "",
                           page = 1,
                           pageSize = 10,
                           sortBy = "nombre",
                           sortDir = "asc",
                       }) {
        const pageNum = Math.max(Number(page) || 1, 1);
        const sizeNum = Math.max(Number(pageSize) || 10, 1);
        const offset = (pageNum - 1) * sizeNum;

        const allowedSortBy = new Set(["nombre", "codigo", "fecha_creacion"]);
        const safeSortBy = allowedSortBy.has(String(sortBy)) ? String(sortBy) : "nombre";
        const safeSortDir = String(sortDir).toLowerCase() === "desc" ? "DESC" : "ASC";

        const where = [];
        const whereParams = [];

        const codigoTrim = String(codigo || "").trim();
        const nombreTrim = String(nombre || "").trim();
        const qTrim = String(q || "").trim();

        if (codigoTrim) {
            where.push(`LOWER(IFNULL(e.codigo, '')) LIKE LOWER(?)`);
            whereParams.push(`%${codigoTrim}%`);
        }

        if (nombreTrim) {
            where.push(`LOWER(IFNULL(e.nombre, '')) LIKE LOWER(?)`);
            whereParams.push(`%${nombreTrim}%`);
        }

        // Compatibilidad con el filtro general anterior
        if (qTrim) {
            where.push(`(
            LOWER(IFNULL(e.codigo, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(e.nombre, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(u.nombre, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(s.nombre, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(ss.nombre, '')) LIKE LOWER(?)
        )`);
            const like = `%${qTrim}%`;
            whereParams.push(like, like, like, like, like);
        }

        if (serieId !== undefined && serieId !== null && String(serieId).trim() !== "") {
            where.push(`e.serie_id = ?`);
            whereParams.push(Number(serieId));
        }

        if (subserieId !== undefined && subserieId !== null && String(subserieId).trim() !== "") {
            where.push(`e.subserie_id = ?`);
            whereParams.push(Number(subserieId));
        }

        if (String(soloConElegibles || "").trim() === "1") {
            where.push(`(
            SELECT COUNT(*)
            FROM Documento d
            WHERE d.expediente_id = e.id
              AND d.confid_level = 'PUBLIC'
              AND d.estado IN ('ARCHIVADO', 'CONSERVACION')
        ) > 0`);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const countSql = `
            SELECT COUNT(*) AS total
            FROM Expediente e
                     INNER JOIN Unidad_Organizacional u ON u.id = e.unidad_id
                     INNER JOIN Serie s ON s.id = e.serie_id
                     LEFT JOIN Subserie ss ON ss.id = e.subserie_id
                ${whereSql}
        `;

        const dataSql = `
            SELECT
                e.id,
                e.codigo,
                e.nombre,
                e.estado,
                e.fecha_creacion,
                e.fecha_cierre,
                u.nombre AS unidad_nombre,
                s.nombre AS serie_nombre,
                ss.nombre AS subserie_nombre,

                (
                    SELECT COUNT(*)
                    FROM Documento d
                    WHERE d.expediente_id = e.id
                ) AS total_documentos,

                (
                    SELECT COUNT(*)
                    FROM Documento d
                    WHERE d.expediente_id = e.id
                      AND d.confid_level = 'PUBLIC'
                      AND d.estado IN ('ARCHIVADO', 'CONSERVACION')
                ) AS total_documentos_elegibles,

                EXISTS (
                    SELECT 1
                    FROM Permiso_Usuario_Expediente pue
                    WHERE pue.usuario_id = ?
                      AND pue.expediente_id = e.id
                      AND pue.permiso = 'VIEW'
                ) AS has_approved_access,

                EXISTS (
                    SELECT 1
                    FROM Solicitud_Acceso_Expediente sae
                    WHERE sae.usuario_solicitante_id = ?
                      AND sae.expediente_id = e.id
                      AND sae.estado_solicitud = 'PENDIENTE'
                ) AS has_pending_request

            FROM Expediente e
                     INNER JOIN Unidad_Organizacional u ON u.id = e.unidad_id
                     INNER JOIN Serie s ON s.id = e.serie_id
                     LEFT JOIN Subserie ss ON ss.id = e.subserie_id
                ${whereSql}
            ORDER BY e.${safeSortBy} ${safeSortDir}, e.id DESC
                LIMIT ?
            OFFSET ?
        `;

        const [countRows] = await pool.query(countSql, whereParams);
        const totalItems = Number(countRows?.[0]?.total || 0);

        const uid = Number(userId);
        const [items] = await pool.query(
            dataSql,
            [uid, uid, ...whereParams, sizeNum, offset]
        );

        return {
            items,
            totalItems,
            totalPages: Math.max(Math.ceil(totalItems / sizeNum), 1),
            page: pageNum,
            pageSize: sizeNum,
        };
    },

    /**
     * Búsqueda de expedientes para consulta interna: filtro por unidad (salvo master) y fechas sobre fecha_creacion.
     */
    async searchAccessInternal({
        unidadId,
        isMaster,
        codigo = "",
        nombre = "",
        serieId = "",
        subserieId = "",
        q = "",
        dateFrom = "",
        dateTo = "",
        page = 1,
        pageSize = 10,
        sortBy = "nombre",
        sortDir = "asc",
    }) {
        const pageNum = Math.max(Number(page) || 1, 1);
        const sizeNum = Math.max(Number(pageSize) || 10, 1);
        const offset = (pageNum - 1) * sizeNum;

        const allowedSortBy = new Set(["nombre", "codigo", "fecha_creacion"]);
        const safeSortBy = allowedSortBy.has(String(sortBy)) ? String(sortBy) : "nombre";
        const safeSortDir = String(sortDir).toLowerCase() === "desc" ? "DESC" : "ASC";

        const where = [];
        const whereParams = [];

        if (!isMaster) {
            where.push(`e.unidad_id = ?`);
            whereParams.push(Number(unidadId));
        }

        const codigoTrim = String(codigo || "").trim();
        const nombreTrim = String(nombre || "").trim();
        const qTrim = String(q || "").trim();
        const df = String(dateFrom || "").trim();
        const dt = String(dateTo || "").trim();

        if (codigoTrim) {
            where.push(`LOWER(IFNULL(e.codigo, '')) LIKE LOWER(?)`);
            whereParams.push(`%${codigoTrim}%`);
        }

        if (nombreTrim) {
            where.push(`LOWER(IFNULL(e.nombre, '')) LIKE LOWER(?)`);
            whereParams.push(`%${nombreTrim}%`);
        }

        if (qTrim) {
            where.push(`(
            LOWER(IFNULL(e.codigo, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(e.nombre, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(u.nombre, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(s.nombre, '')) LIKE LOWER(?)
            OR LOWER(IFNULL(ss.nombre, '')) LIKE LOWER(?)
        )`);
            const like = `%${qTrim}%`;
            whereParams.push(like, like, like, like, like);
        }

        if (serieId !== undefined && serieId !== null && String(serieId).trim() !== "") {
            where.push(`e.serie_id = ?`);
            whereParams.push(Number(serieId));
        }

        if (subserieId !== undefined && subserieId !== null && String(subserieId).trim() !== "") {
            where.push(`e.subserie_id = ?`);
            whereParams.push(Number(subserieId));
        }

        if (df) {
            where.push(`DATE(e.fecha_creacion) >= ?`);
            whereParams.push(df);
        }

        if (dt) {
            where.push(`DATE(e.fecha_creacion) <= ?`);
            whereParams.push(dt);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const countSql = `
            SELECT COUNT(*) AS total
            FROM Expediente e
                     INNER JOIN Unidad_Organizacional u ON u.id = e.unidad_id
                     INNER JOIN Serie s ON s.id = e.serie_id
                     LEFT JOIN Subserie ss ON ss.id = e.subserie_id
                ${whereSql}
        `;

        const dataSql = `
            SELECT
                e.id,
                e.codigo,
                e.nombre,
                e.estado,
                e.fecha_creacion,
                e.fecha_cierre,
                u.nombre AS unidad_nombre,
                s.nombre AS serie_nombre,
                ss.nombre AS subserie_nombre,

                (
                    SELECT COUNT(*)
                    FROM Documento d
                    WHERE d.expediente_id = e.id
                ) AS total_documentos,

                (
                    SELECT COUNT(*)
                    FROM Documento d
                    WHERE d.expediente_id = e.id
                      AND d.confid_level = 'PUBLIC'
                      AND d.estado IN ('ARCHIVADO', 'CONSERVACION')
                ) AS total_documentos_elegibles,

                1 AS has_approved_access,
                0 AS has_pending_request

            FROM Expediente e
                     INNER JOIN Unidad_Organizacional u ON u.id = e.unidad_id
                     INNER JOIN Serie s ON s.id = e.serie_id
                     LEFT JOIN Subserie ss ON ss.id = e.subserie_id
                ${whereSql}
            ORDER BY e.${safeSortBy} ${safeSortDir}, e.id DESC
                LIMIT ?
            OFFSET ?
        `;

        const [countRows] = await pool.query(countSql, whereParams);
        const totalItems = Number(countRows?.[0]?.total || 0);

        const [items] = await pool.query(dataSql, [...whereParams, sizeNum, offset]);

        return {
            items,
            totalItems,
            totalPages: Math.max(Math.ceil(totalItems / sizeNum), 1),
            page: pageNum,
            pageSize: sizeNum,
        };
    },

    async getAccessibleDocumentsForExternal({ expedienteId, userId }) {
        const eid = Number(expedienteId);
        const uid = Number(userId);

        const [rows] = await pool.query(
            `
        SELECT
            d.id,
            d.numero_serie AS codigo,
            d.titulo,
            d.estado,
            d.confid_level,
            d.fecha,
            c.nombre AS categoria_nombre,
            u.nombre AS unidad_nombre,
            e.codigo AS expediente_codigo,
            s.nombre AS serie_nombre,
            ss.nombre AS subserie_nombre,
            TRIM(CONCAT(IFNULL(cu.nombre, ''), ' ', IFNULL(cu.apellido1, ''), ' ', IFNULL(cu.apellido2, ''))) AS autor_nombre
        FROM Documento d
        INNER JOIN Expediente e
            ON e.id = d.expediente_id
        INNER JOIN Unidad_Organizacional u
            ON u.id = d.unidad_id
        LEFT JOIN Categoria c
            ON c.id = d.categoria_id
        LEFT JOIN Usuario cu
            ON cu.id = d.usuario_id
        LEFT JOIN Serie s
            ON s.id = e.serie_id
        LEFT JOIN Subserie ss
            ON ss.id = e.subserie_id
        WHERE d.expediente_id = ?
          AND d.confid_level = 'PUBLIC'
          AND d.estado IN ('ARCHIVADO', 'CONSERVACION')
          AND EXISTS (
              SELECT 1
              FROM Permiso_Usuario_Expediente pue
              WHERE pue.usuario_id = ?
                AND pue.expediente_id = d.expediente_id
                AND pue.permiso = 'VIEW'
          )
        ORDER BY d.fecha DESC, d.id DESC
        `,
            [eid, uid]
        );

        return rows || [];
    },

    /** Conteo de expedientes por estado (p. ej. ACTIVO). */
    async countByEstado(estado) {
        const [rows] = await pool.query(
            `SELECT COUNT(*) AS n FROM Expediente WHERE estado = ?`,
            [estado]
        );
        return Number(rows?.[0]?.n || 0);
    },

    /**
     * Un documento asociado a expediente ACTIVO (para FK de Notificacion.documento_id).
     * Si no hay documentos ligados a expedientes activos, devuelve null.
     */
    async findAnyDocumentoIdForActivoExpedientes() {
        const [rows] = await pool.query(
            `SELECT MIN(d.id) AS id
             FROM Documento d
                      INNER JOIN Expediente e ON e.id = d.expediente_id
             WHERE e.estado = 'ACTIVO'
               AND d.expediente_id IS NOT NULL`
        );
        const id = rows?.[0]?.id;
        return id != null ? Number(id) : null;
    },
};



export default expedienteRepo;