import { pool } from "../db/pool.js";

function toMap(rows = []) {
  const map = {};
  for (const row of rows) {
    if (!row?.tipo) continue;
    map[String(row.tipo)] = row.valor;
  }
  return map;
}

/**
 * SQL-only repository for EAD 2002 export.
 */
export const eadExportRepo = {
  async withTransaction(work) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },

  async listConservationDocuments(filters = {}) {
    const where = [
      `d.estado = 'ARCHIVADO'`,
      `EXISTS (
        SELECT 1
        FROM Ingreso_Conservacion ic
        WHERE ic.documento_id = d.id
      )`,
    ];

    const args = [];

    if (filters.q && String(filters.q).trim()) {
      const q = `%${String(filters.q).trim()}%`;
      where.push(`
        (
          d.titulo LIKE ?
          OR d.numero_serie LIKE ?
          OR e.codigo LIKE ?
          OR e.nombre LIKE ?
          OR s.nombre LIKE ?
          OR ss.nombre LIKE ?
        )
      `);
      args.push(q, q, q, q, q, q);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `
        SELECT
          d.id AS id,
          COALESCE(ic.official_code, d.numero_serie) AS officialCode,
          d.titulo AS title,
          d.estado AS state,
          d.fecha AS createdAt,
          s.nombre AS serieName,
          ss.nombre AS subserieName,
          e.nombre AS expedienteName,
          e.codigo AS expedienteCode,

          mex_at.valor AS lastExportedAt,
          mex_by.valor AS lastExportedByName

        FROM Documento d
        INNER JOIN Ingreso_Conservacion ic
          ON ic.documento_id = d.id
        LEFT JOIN Expediente e
          ON e.id = d.expediente_id
        LEFT JOIN Serie s
          ON s.id = e.serie_id
        LEFT JOIN Subserie ss
          ON ss.id = e.subserie_id
        LEFT JOIN Metadato mex_at
          ON mex_at.documento_id = d.id
         AND mex_at.tipo = 'EAD2002_LAST_EXPORTED_AT'
        LEFT JOIN Metadato mex_by
          ON mex_by.documento_id = d.id
         AND mex_by.tipo = 'EAD2002_LAST_EXPORTED_BY_NAME'
        ${whereSql}
        ORDER BY d.fecha DESC, d.id DESC
      `,
      args,
    );

    return (rows || []).map((row) => ({
      id: Number(row.id),
      officialCode: row.officialCode || "",
      title: row.title || "",
      state: row.state || "",
      createdAtISO: row.createdAt
        ? new Date(row.createdAt).toISOString()
        : null,
      serieName: row.serieName || "",
      subserieName: row.subserieName || "",
      expedienteName: row.expedienteName || "",
      expedienteCode: row.expedienteCode || "",
      eadStatus: row.lastExportedAt ? "EXPORTADO" : "NO_EXPORTADO",
      lastExportedAt: row.lastExportedAt || null,
      lastExportedByName: row.lastExportedByName || null,
    }));
  },

  async findDocumentContextById(documentId) {
    const [rows] = await pool.query(
      `
        SELECT
          d.id,
          d.numero_serie,
          d.titulo,
          d.estado,
          d.confid_level,
          d.fecha,
          d.expediente_id,
          d.unidad_id,
          d.usuario_id,
          d.categoria_id,
          d.plazo_valor,
          d.plazo_unidad,
          d.fecha_inicio_conservacion,
          d.fecha_vencimiento,
          d.estado_conservacion,

          ic.id AS intake_id,
          ic.official_code,
          ic.classification_code,
          ic.classification_label,
          ic.access_level AS intake_access_level,
          ic.retention_rule_id,
          ic.retention_years,
          ic.retention_start_date,
          ic.retention_end_date,
          ic.tracking_enabled,
          ic.payload_snapshot,
          ic.created_at AS intake_created_at,
          ic.created_by AS intake_created_by,

          e.id AS expediente_real_id,
          e.codigo AS expediente_codigo,
          e.nombre AS expediente_nombre,
          e.estado AS expediente_estado,
          e.serie_id,
          e.subserie_id,
          e.fecha_creacion AS expediente_fecha_creacion,
          e.fecha_cierre AS expediente_fecha_cierre,

          s.id AS serie_real_id,
          s.codigo AS serie_codigo,
          s.nombre AS serie_nombre,
          s.plazo_conservacion_anios,

          ss.id AS subserie_real_id,
          ss.codigo AS subserie_codigo,
          ss.nombre AS subserie_nombre,

          uo.id AS unidad_real_id,
          uo.nombre AS unidad_nombre,

          u.id AS creador_real_id,
          u.email AS creador_email,
          TRIM(
            CONCAT(
              IFNULL(u.nombre, ''),
              ' ',
              IFNULL(u.apellido1, ''),
              ' ',
              IFNULL(u.apellido2, '')
            )
          ) AS creador_nombre_completo,

          c.nombre AS categoria_nombre

        FROM Documento d
        INNER JOIN Ingreso_Conservacion ic
          ON ic.documento_id = d.id
        LEFT JOIN Expediente e
          ON e.id = d.expediente_id
        LEFT JOIN Serie s
          ON s.id = e.serie_id
        LEFT JOIN Subserie ss
          ON ss.id = e.subserie_id
        LEFT JOIN Unidad_Organizacional uo
          ON uo.id = d.unidad_id
        LEFT JOIN Usuario u
          ON u.id = d.usuario_id
        LEFT JOIN Categoria c
          ON c.id = d.categoria_id
        WHERE d.id = ?
        LIMIT 1
      `,
      [Number(documentId)],
    );

    return rows[0] ?? null;
  },

  async getMetadataMap(documentId) {
    const [rows] = await pool.query(
      `
        SELECT tipo, valor
        FROM Metadato
        WHERE documento_id = ?
      `,
      [Number(documentId)],
    );

    return toMap(rows || []);
  },

  async upsertMetadataMapTx(conn, documentId, map) {
    const entries = Object.entries(map).filter(
      ([tipo, valor]) => tipo && valor !== undefined && valor !== null,
    );

    if (!entries.length) return;

    const values = [];
    const placeholders = entries
      .map(([tipo, valor]) => {
        values.push(String(tipo), Number(documentId), String(valor));
        return "(?, ?, ?)";
      })
      .join(", ");

    await conn.query(
      `
        INSERT INTO Metadato (tipo, documento_id, valor)
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE valor = VALUES(valor)
      `,
      values,
    );
  },

  async insertExportAuditTx(
    conn,
    {
      actorId,
      documentId,
      generatedAt,
      filename,
      xmlHash,
      eadId,
      officialCode,
      title,
      state,
    },
  ) {
    const [baseResult] = await conn.query(
      `
        INSERT INTO Bitacora_Base (
          fecha,
          accion,
          resultado,
          usuario_id,
          documento_id
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        generatedAt,
        "EXPORTACION_EAD2002",
        "PERMITIDO",
        Number(actorId),
        Number(documentId),
      ],
    );

    const baseId = Number(baseResult.insertId);

    const cycleDetail = {
      accion_solicitada: "EXPORTAR_XML_EAD_2002",
      descripcion: "Exportación XML EAD 2002 generada correctamente",
      formato: "EAD 2002 XML",
      filename,
      eadId,
      xmlHash,
      snapshot: {
        documento_titulo: title,
        documento_codigo_unico: officialCode,
        documento_estado: state,
        documento_codigo_oficial: officialCode,
      },
    };

    await conn.query(
      `
        INSERT INTO Bitacora_Ciclo_Documental (
          id,
          evento,
          detalle
        )
        VALUES (?, ?, ?)
      `,
      [baseId, "CONSERVACION", JSON.stringify(cycleDetail)],
    );

    const activityParams = {
      action: "EXPORTAR_XML_EAD_2002",
      filename,
      format: "application/xml",
      eadId,
      xmlHash,
      officialCode,
    };

    await conn.query(
      `
        INSERT INTO Bitacora_Actividad_Usuario (
          id,
          actividad,
          recurso,
          parametros
        )
        VALUES (?, ?, ?, ?)
      `,
      [baseId, "DESCARGA", "EAD2002_EXPORT", JSON.stringify(activityParams)],
    );

    return baseId;
  },

  async insertExpedienteAuditTx(
    conn,
    { expedienteId, actorId, generatedAt, documentId, officialCode, filename },
  ) {
    if (!expedienteId) return null;

    const detail = {
      accion: "EXPORTAR_XML_EAD_2002",
      documento_id: Number(documentId),
      officialCode,
      filename,
      generatedAt: new Date(generatedAt).toISOString(),
    };

    const [result] = await conn.query(
      `
        INSERT INTO Bitacora_Expediente (
          fecha,
          expediente_id,
          usuario_id,
          evento,
          resultado,
          detalle
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        generatedAt,
        Number(expedienteId),
        Number(actorId),
        "DESCARGA",
        "PERMITIDO",
        JSON.stringify(detail),
      ],
    );

    return Number(result.insertId);
  },
};
