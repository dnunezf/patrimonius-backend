import { pool } from "../db/pool.js";

function safeJsonParse(value, fallback = []) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Repository for HU-019 archival conservation intake.
 * SQL-only layer.
 */
export const conservationIntakeRepo = {
  /**
   * Search conservation candidates that are not already registered.
   * Filters:
   * - officialCode
   * - q
   * - producingUnit
   * - dateFrom
   * - dateTo
   */
  async searchCandidates(filters) {
    const where = [];
    const args = [];

    where.push(`
      NOT EXISTS (
        SELECT 1
        FROM Ingreso_Conservacion ic
        WHERE ic.documento_id = d.id
      )
    `);

    where.push(`TRIM(IFNULL(d.numero_serie, '')) <> ''`);

    if (filters.officialCode) {
      where.push("d.numero_serie LIKE ?");
      args.push(`%${filters.officialCode}%`);
    }

    if (filters.q) {
      where.push(`
        (
          d.titulo LIKE ?
          OR d.numero_serie LIKE ?
          OR EXISTS (
            SELECT 1
            FROM Metadato mq
            WHERE mq.documento_id = d.id
              AND mq.tipo = 'DESC_KEYWORDS_JSON'
              AND mq.valor LIKE ?
          )
        )
      `);
      const q = `%${filters.q}%`;
      args.push(q, q, q);
    }

    if (filters.producingUnit) {
      where.push("uo.nombre LIKE ?");
      args.push(`%${filters.producingUnit}%`);
    }

    if (filters.dateFrom) {
      where.push("DATE(d.fecha) >= ?");
      args.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      where.push("DATE(d.fecha) <= ?");
      args.push(filters.dateTo);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `
      SELECT
        d.id,
        d.numero_serie AS officialCode,
        d.titulo AS title,
        uo.nombre AS producingUnit,
        d.fecha AS createdAtISO,
        d.firmas_obtenidas,
        d.numero_firmas,

        TRIM(
          CONCAT(
            IFNULL(u.nombre, ''),
            ' ',
            IFNULL(u.apellido1, ''),
            ' ',
            IFNULL(u.apellido2, '')
          )
        ) AS author,

        MAX(CASE WHEN m.tipo = 'TECH_MIME_TYPE' THEN m.valor END) AS mimeType,
        MAX(CASE WHEN m.tipo = 'TECH_FILE_EXT' THEN m.valor END) AS fileExt,
        MAX(CASE WHEN m.tipo = 'DESC_KEYWORDS_JSON' THEN m.valor END) AS keywordsJson,
        MAX(CASE WHEN m.tipo = 'SIGNED_PDF_CURRENT' THEN m.valor END) AS signedPdfCurrent
      FROM Documento d
      JOIN Unidad_Organizacional uo
        ON uo.id = d.unidad_id
      JOIN Usuario u
        ON u.id = d.usuario_id
      LEFT JOIN Metadato m
        ON m.documento_id = d.id
       AND m.tipo IN (
         'TECH_MIME_TYPE',
         'TECH_FILE_EXT',
         'DESC_KEYWORDS_JSON',
         'SIGNED_PDF_CURRENT'
       )
      ${whereSql}
      GROUP BY
        d.id,
        d.numero_serie,
        d.titulo,
        uo.nombre,
        d.fecha,
        d.firmas_obtenidas,
        d.numero_firmas,
        u.nombre,
        u.apellido1,
        u.apellido2
      ORDER BY d.fecha DESC
      LIMIT 100
      `,
      args,
    );

    return (rows || []).map((row) => ({
      id: Number(row.id),
      officialCode: row.officialCode || "",
      title: row.title,
      producingUnit: row.producingUnit,
      createdAtISO: row.createdAtISO,
      author: row.author || "",
      firmas_obtenidas: Number(row.firmas_obtenidas || 0),
      numero_firmas: Number(row.numero_firmas || 0),
      mimeType: row.mimeType || null,
      fileExt: row.fileExt || null,
      signedPdfCurrent: row.signedPdfCurrent || null,
      keywords: safeJsonParse(row.keywordsJson, []),
    }));
  },

  /**
   * Find one document with enough context for conservation intake.
   */
  async findDocumentById(documentId) {
    const [rows] = await pool.query(
      `
      SELECT
        d.*,
        uo.nombre AS producingUnitName,
        TRIM(
          CONCAT(
            IFNULL(u.nombre, ''),
            ' ',
            IFNULL(u.apellido1, ''),
            ' ',
            IFNULL(u.apellido2, '')
          )
        ) AS authorName
      FROM Documento d
      JOIN Unidad_Organizacional uo
        ON uo.id = d.unidad_id
      JOIN Usuario u
        ON u.id = d.usuario_id
      WHERE d.id = ?
      LIMIT 1
      `,
      [Number(documentId)],
    );
    return rows[0] ?? null;
  },

  async findClassificationByCode(code) {
    const [rows] = await pool.query(
      `
      SELECT codigo, etiqueta, activa
      FROM Clasificacion_Archivistica
      WHERE codigo = ?
      LIMIT 1
      `,
      [String(code)],
    );
    return rows[0] ?? null;
  },

  async listRetentionRules() {
    const [rows] = await pool.query(
      `
      SELECT id, etiqueta AS label, anos AS years
      FROM Regla_Retencion
      WHERE activa = 1
      ORDER BY anos DESC, id ASC
      `,
    );
    return rows;
  },

  async findRetentionRuleById(ruleId) {
    const [rows] = await pool.query(
      `
      SELECT id, etiqueta AS label, anos AS years, activa
      FROM Regla_Retencion
      WHERE id = ?
      LIMIT 1
      `,
      [Number(ruleId)],
    );
    return rows[0] ?? null;
  },

  async findExistingIntakeByOfficialCode(code) {
    const [rows] = await pool.query(
      `
      SELECT id, documento_id AS documentId, official_code AS officialCode
      FROM Ingreso_Conservacion
      WHERE official_code = ?
      LIMIT 1
      `,
      [String(code)],
    );
    return rows[0] ?? null;
  },

  async findExistingIntakeByDocumentId(documentId) {
    const [rows] = await pool.query(
      `
      SELECT id, documento_id AS documentId, official_code AS officialCode
      FROM Ingreso_Conservacion
      WHERE documento_id = ?
      LIMIT 1
      `,
      [Number(documentId)],
    );
    return rows[0] ?? null;
  },

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

  async updateDocumentForConservationTx(
    conn,
    { documentId, title, accessLevel },
  ) {
    await conn.query(
      `
      UPDATE Documento
      SET
        titulo = ?,
        confid_level = ?,
        estado = 'ARCHIVADO'
      WHERE id = ?
      `,
      [title, accessLevel, Number(documentId)],
    );
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

  async insertIntakeTx(
    conn,
    {
      documentId,
      officialCode,
      classificationCode,
      classificationLabel,
      accessLevel,
      retentionRuleId,
      retentionYears,
      retentionStartDate,
      retentionEndDate,
      trackingEnabled,
      payloadSnapshot,
      createdBy,
    },
  ) {
    const [result] = await conn.query(
      `
      INSERT INTO Ingreso_Conservacion (
        documento_id,
        official_code,
        classification_code,
        classification_label,
        access_level,
        retention_rule_id,
        retention_years,
        retention_start_date,
        retention_end_date,
        tracking_enabled,
        payload_snapshot,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(documentId),
        String(officialCode),
        String(classificationCode),
        String(classificationLabel),
        String(accessLevel),
        Number(retentionRuleId),
        Number(retentionYears),
        retentionStartDate,
        retentionEndDate,
        trackingEnabled ? 1 : 0,
        JSON.stringify(payloadSnapshot),
        Number(createdBy),
      ],
    );

    return { id: result.insertId };
  },
};
