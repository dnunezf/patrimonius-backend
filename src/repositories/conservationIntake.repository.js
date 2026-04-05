import { pool } from "../db/pool.js";

const DEFAULT_REFERENCE_ORG_CODE = String(
  process.env.FINAL_REFERENCE_ORG_CODE || "MNCR",
)
  .trim()
  .toUpperCase();

function safeJsonParse(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value;

  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeComparable(value) {
  return stripDiacritics(value).toLowerCase().trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function padSequence(value) {
  return String(Number(value || 0)).padStart(3, "0");
}

function buildDocumentTypeCode(documentType) {
  const normalized = normalizeComparable(documentType);

  if (normalized.includes("oficio")) return "OFI";
  if (normalized.includes("informe")) return "INF";
  if (normalized.includes("acta")) return "ACT";
  if (normalized.includes("memorando") || normalized.includes("memo")) {
    return "MEM";
  }
  if (normalized.includes("circular")) return "CIR";
  if (normalized.includes("resolucion")) return "RES";
  if (normalized.includes("contrato")) return "CON";
  if (normalized.includes("acuerdo")) return "ACU";
  if (normalized.includes("solicitud")) return "SOL";

  return "DOC";
}

function buildReferenceUnitCode(_unitName) {
  return DEFAULT_REFERENCE_ORG_CODE || "MNCR";
}

function buildReferencePrefix({ documentType, unitName }) {
  return `${buildDocumentTypeCode(documentType)}-${buildReferenceUnitCode(unitName)}`;
}

function currentReferenceYear() {
  return new Date().getFullYear();
}

function isStructuredReferenceCode(code) {
  return /^[A-Z]{2,10}-[A-Z]{2,10}-\d{3,}-\d{4}$/.test(
    String(code || "")
      .trim()
      .toUpperCase(),
  );
}

function normalizeReferenceCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase();
}

function extractSequenceFromReference(code, { prefix, year }) {
  const escapedPrefix = escapeRegExp(prefix);
  const match = normalizeReferenceCode(code).match(
    new RegExp(`^${escapedPrefix}-(\\d{3,})-${year}$`),
  );

  if (!match) return null;

  const seq = Number(match[1]);
  return Number.isFinite(seq) ? seq : null;
}

/**
 * Repository for conservation intake.
 * SQL-only layer.
 */
export const conservationIntakeRepo = {
  isStructuredReferenceCode,

  normalizeReferenceCode,

  buildReferencePrefix,

  async getMaxReferenceSequence({ prefix, year, conn = pool }) {
    const likePattern = `${prefix}-%-${year}`;

    const [rows] = await conn.query(
      `
      SELECT numero_serie AS code
      FROM Documento
      WHERE UPPER(numero_serie) LIKE UPPER(?)

      UNION ALL

      SELECT official_code AS code
      FROM Ingreso_Conservacion
      WHERE UPPER(official_code) LIKE UPPER(?)
      `,
      [likePattern, likePattern],
    );

    let max = 0;

    for (const row of rows || []) {
      const seq = extractSequenceFromReference(row.code, { prefix, year });
      if (seq != null && seq > max) {
        max = seq;
      }
    }

    return max;
  },

  async previewReferenceCode({
    currentCode,
    documentType,
    unitName,
    cache = null,
  }) {
    if (isStructuredReferenceCode(currentCode)) {
      return normalizeReferenceCode(currentCode);
    }

    const year = currentReferenceYear();
    const prefix = buildReferencePrefix({ documentType, unitName });
    const cacheKey = `${prefix}|${year}`;

    let nextSequence = cache?.get(cacheKey);

    if (nextSequence == null) {
      nextSequence = await this.getMaxReferenceSequence({ prefix, year });
    }

    nextSequence += 1;
    cache?.set(cacheKey, nextSequence);

    return `${prefix}-${padSequence(nextSequence)}-${year}`;
  },

  async generateReferenceCodeTx(conn, { currentCode, documentType, unitName }) {
    if (isStructuredReferenceCode(currentCode)) {
      return normalizeReferenceCode(currentCode);
    }

    const year = currentReferenceYear();
    const prefix = buildReferencePrefix({ documentType, unitName });
    const maxSequence = await this.getMaxReferenceSequence({
      prefix,
      year,
      conn,
    });

    return `${prefix}-${padSequence(maxSequence + 1)}-${year}`;
  },

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
              AND mq.tipo IN (
                'DESC_KEYWORDS_JSON',
                'EDIT_MANUAL_KEYWORDS_JSON',
                'FINAL_KEYWORDS_JSON'
              )
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
        d.confid_level AS accessLevel,
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

        (
          SELECT mm.valor
          FROM Metadato mm
          WHERE mm.documento_id = d.id
            AND mm.tipo IN ('EDIT_MANUAL_DOCUMENT_TYPE', 'DESC_PRELIM_CLASS')
          ORDER BY FIELD(mm.tipo, 'EDIT_MANUAL_DOCUMENT_TYPE', 'DESC_PRELIM_CLASS')
          LIMIT 1
        ) AS documentType,

        (
          SELECT ms.valor
          FROM Metadato ms
          WHERE ms.documento_id = d.id
            AND ms.tipo IN ('EDIT_AUTO_SIZE_BYTES', 'TECH_SIZE_BYTES')
          ORDER BY FIELD(ms.tipo, 'EDIT_AUTO_SIZE_BYTES', 'TECH_SIZE_BYTES')
          LIMIT 1
        ) AS sizeBytes,

        (
          SELECT mf.valor
          FROM Metadato mf
          WHERE mf.documento_id = d.id
            AND mf.tipo IN ('TECH_MIME_TYPE', 'TECH_FILE_EXT')
          ORDER BY FIELD(mf.tipo, 'TECH_MIME_TYPE', 'TECH_FILE_EXT')
          LIMIT 1
        ) AS formatValue,

        (
          SELECT msv.valor
          FROM Metadato msv
          WHERE msv.documento_id = d.id
            AND msv.tipo IN ('EDIT_AUTO_SOFTWARE_VERSION', 'TECH_SOFTWARE')
          ORDER BY FIELD(msv.tipo, 'EDIT_AUTO_SOFTWARE_VERSION', 'TECH_SOFTWARE')
          LIMIT 1
        ) AS softwareVersion,

        (
          SELECT mk.valor
          FROM Metadato mk
          WHERE mk.documento_id = d.id
            AND mk.tipo IN ('EDIT_MANUAL_KEYWORDS_JSON', 'DESC_KEYWORDS_JSON')
          ORDER BY FIELD(mk.tipo, 'EDIT_MANUAL_KEYWORDS_JSON', 'DESC_KEYWORDS_JSON')
          LIMIT 1
        ) AS keywordsJson,

        (
          SELECT JSON_ARRAYAGG(
            TRIM(
              CONCAT(
                IFNULL(su.nombre, ''),
                ' ',
                IFNULL(su.apellido1, ''),
                ' ',
                IFNULL(su.apellido2, '')
              )
            )
          )
          FROM Firma_Digital fd
          JOIN Usuario su ON su.id = fd.usuario_id
          WHERE fd.documento_id = d.id
        ) AS signersJson,

        (
          SELECT JSON_ARRAYAGG(
            DATE_FORMAT(fd.fecha, '%Y-%m-%dT%H:%i:%s')
          )
          FROM Firma_Digital fd
          WHERE fd.documento_id = d.id
        ) AS signedAtJson

      FROM Documento d
      JOIN Unidad_Organizacional uo
        ON uo.id = d.unidad_id
      JOIN Usuario u
        ON u.id = d.usuario_id
      ${whereSql}
      ORDER BY d.fecha DESC
      LIMIT 100
      `,
      args,
    );

    const previewCache = new Map();
    const mapped = [];

    for (const row of rows || []) {
      const effectiveOfficialCode = await this.previewReferenceCode({
        currentCode: row.officialCode,
        documentType: row.documentType,
        unitName: row.producingUnit,
        cache: previewCache,
      });

      mapped.push({
        id: Number(row.id),
        officialCode: effectiveOfficialCode,
        title: row.title || "",
        documentType: row.documentType || null,
        producingUnit: row.producingUnit || "",
        createdAtISO: row.createdAtISO,
        author: row.author || "",
        accessLevel: row.accessLevel || "INTERNAL",
        isPDFA: true,
        signaturesComplete:
          Number(row.numero_firmas || 0) === 0 ||
          Number(row.firmas_obtenidas || 0) >= Number(row.numero_firmas || 0),
        keywords: safeJsonParse(row.keywordsJson, []),
        sizeBytes:
          row.sizeBytes != null && row.sizeBytes !== ""
            ? Number(row.sizeBytes)
            : null,
        format: row.formatValue || null,
        signers: safeJsonParse(row.signersJson, []),
        signedAt: safeJsonParse(row.signedAtJson, []),
        softwareVersion: row.softwareVersion || null,
        documentFlow: null,
      });
    }

    return mapped;
  },

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

  async listDocumentSignatures(documentId) {
    const [rows] = await pool.query(
      `
      SELECT
        fd.fecha AS signedAt,
        TRIM(
          CONCAT(
            IFNULL(u.nombre, ''),
            ' ',
            IFNULL(u.apellido1, ''),
            ' ',
            IFNULL(u.apellido2, '')
          )
        ) AS signerName
      FROM Firma_Digital fd
      JOIN Usuario u
        ON u.id = fd.usuario_id
      WHERE fd.documento_id = ?
      ORDER BY fd.fecha ASC, fd.id ASC
      `,
      [Number(documentId)],
    );

    return (rows || []).map((row) => ({
      signerName: row.signerName || "",
      signedAtISO: row.signedAt ? new Date(row.signedAt).toISOString() : null,
    }));
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

  async findSerieById(serieId) {
    const [rows] = await pool.query(
      `
      SELECT id, codigo, nombre, unidad_id, activa
      FROM Serie
      WHERE id = ?
      LIMIT 1
      `,
      [Number(serieId)],
    );
    return rows[0] ?? null;
  },

  async findSubserieById(subserieId) {
    const [rows] = await pool.query(
      `
      SELECT id, codigo, nombre, serie_id, activa
      FROM Subserie
      WHERE id = ?
      LIMIT 1
      `,
      [Number(subserieId)],
    );
    return rows[0] ?? null;
  },

  async findExpedienteById(expedienteId) {
    const [rows] = await pool.query(
      `
      SELECT id, codigo, nombre, unidad_id, serie_id, subserie_id, estado
      FROM Expediente
      WHERE id = ?
      LIMIT 1
      `,
      [Number(expedienteId)],
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
    { documentId, expedienteId, title, accessLevel, officialCode },
  ) {
    await conn.query(
      `
      UPDATE Documento
      SET
        numero_serie = ?,
        titulo = ?,
        confid_level = ?,
        expediente_id = ?,
        estado = 'ARCHIVADO'
      WHERE id = ?
      `,
      [
        String(officialCode),
        String(title),
        String(accessLevel),
        Number(expedienteId),
        Number(documentId),
      ],
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
