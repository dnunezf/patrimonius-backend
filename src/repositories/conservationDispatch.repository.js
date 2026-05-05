import { pool } from "../db/pool.js";

function safeJsonParse(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value;

  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export const conservationDispatchRepo = {
  async findConservationDocumentById(documentId) {
    const [rows] = await pool.query(
      `
        SELECT
          d.id,
          d.numero_serie AS officialCode,
          d.titulo AS title,
          d.estado AS state,
          d.fecha AS createdAtISO,
          d.unidad_id AS unitId,
          d.usuario_id AS createdBy,
          d.expediente_id AS expedienteId,
          d.contenido AS content,
          d.confid_level AS accessLevel,

          uo.nombre AS producingUnit,

          ic.id AS intakeId,
          ic.payload_snapshot AS payloadSnapshot,

          (
            SELECT m.valor
            FROM Metadato m
            WHERE m.documento_id = d.id
              AND m.tipo = 'FINAL_DOCUMENT_TYPE'
            LIMIT 1
          ) AS documentType,

          (
            SELECT m.valor
            FROM Metadato m
            WHERE m.documento_id = d.id
              AND m.tipo = 'FINAL_OUT_DISPATCH_EMAILS_JSON'
            LIMIT 1
          ) AS dispatchEmailsJson,

          (
            SELECT m.valor
            FROM Metadato m
            WHERE m.documento_id = d.id
              AND m.tipo IN ('FINAL_FORMAT', 'TECH_MIME_TYPE', 'TECH_FILE_EXT')
            ORDER BY FIELD(m.tipo, 'FINAL_FORMAT', 'TECH_MIME_TYPE', 'TECH_FILE_EXT')
            LIMIT 1
          ) AS mimeType,

          (
            SELECT m.valor
            FROM Metadato m
            WHERE m.documento_id = d.id
              AND m.tipo IN ('FINAL_SIZE_BYTES', 'TECH_SIZE_BYTES', 'EDIT_AUTO_SIZE_BYTES')
            ORDER BY FIELD(m.tipo, 'FINAL_SIZE_BYTES', 'TECH_SIZE_BYTES', 'EDIT_AUTO_SIZE_BYTES')
            LIMIT 1
          ) AS sizeBytes

        FROM Documento d
        INNER JOIN Ingreso_Conservacion ic ON ic.documento_id = d.id
        LEFT JOIN Unidad_Organizacional uo ON uo.id = d.unidad_id
        WHERE d.id = ?
        LIMIT 1
      `,
      [Number(documentId)],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      ...row,
      dispatchEmails: safeJsonParse(row.dispatchEmailsJson, []),
      payloadSnapshot: safeJsonParse(row.payloadSnapshot, null),
    };
  },

  async actorHasExplicitDocumentAccess({ documentId, actorId }) {
    const [rows] = await pool.query(
      `
        SELECT
          (
            EXISTS (
              SELECT 1
              FROM Permiso_Usuario pu
              WHERE pu.usuario_id = ?
                AND pu.documento_id = ?
                AND UPPER(TRIM(pu.permiso)) IN ('VIEW', 'EDIT', 'SIGN')
            )
            OR EXISTS (
              SELECT 1
              FROM Documento d
              INNER JOIN Permiso_Usuario_Expediente pue
                ON pue.expediente_id = d.expediente_id
              WHERE d.id = ?
                AND pue.usuario_id = ?
                AND d.expediente_id IS NOT NULL
                AND UPPER(TRIM(pue.permiso)) IN ('VIEW', 'EDIT')
            )
          ) AS allowed
      `,
      [
        Number(actorId),
        Number(documentId),
        Number(documentId),
        Number(actorId),
      ],
    );

    return Number(rows[0]?.allowed || 0) === 1;
  },

  async getDocumentMainContent(documentId) {
    const [rows] = await pool.query(
      `
        SELECT
          id,
          numero_serie AS officialCode,
          titulo AS title,
          contenido AS content
        FROM Documento
        WHERE id = ?
        LIMIT 1
      `,
      [Number(documentId)],
    );

    return rows[0] ?? null;
  },

  async findDocumentPdfPath(documentId) {
    const [rows] = await pool.query(
      `
        SELECT tipo, valor
        FROM Metadato
        WHERE documento_id = ?
          AND tipo IN (
            'CURRENT_PDF_PATH',
            'SOURCE_PDF_PATH',
            'SIGNED_PDF_CURRENT'
          )
          AND TRIM(IFNULL(valor, '')) <> ''
        ORDER BY FIELD(
          tipo,
          'CURRENT_PDF_PATH',
          'SOURCE_PDF_PATH',
          'SIGNED_PDF_CURRENT'
        )
        LIMIT 1
      `,
      [Number(documentId)],
    );

    return rows[0]?.valor || null;
  },

  async insertDispatchHistory({
    documentId,
    sentBy,
    to,
    cc,
    subject,
    message,
    attachments,
    messageId,
    estado = "ENVIADO",
    error = null,
  }) {
    const [result] = await pool.query(
      `
        INSERT INTO Despacho_Correo_Documento (
          documento_id,
          enviado_por,
          para_json,
          cc_json,
          asunto,
          mensaje,
          adjuntos_json,
          message_id,
          estado,
          error,
          fecha_envio
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        Number(documentId),
        Number(sentBy),
        JSON.stringify(to || []),
        JSON.stringify(cc || []),
        String(subject || ""),
        String(message || ""),
        JSON.stringify(attachments || []),
        messageId || null,
        String(estado),
        error ? String(error) : null,
      ],
    );

    return { id: result.insertId };
  },

  async listDispatchHistory(documentId) {
    const [rows] = await pool.query(
      `
        SELECT
          dc.id,
          dc.documento_id AS documentId,
          dc.para_json AS toJson,
          dc.cc_json AS ccJson,
          dc.asunto AS subject,
          dc.estado AS status,
          dc.error,
          dc.fecha_envio AS sentAt,

          TRIM(
            CONCAT(
              IFNULL(u.nombre, ''),
              ' ',
              IFNULL(u.apellido1, ''),
              ' ',
              IFNULL(u.apellido2, '')
            )
          ) AS sentByName

        FROM Despacho_Correo_Documento dc
        LEFT JOIN Usuario u ON u.id = dc.enviado_por
        WHERE dc.documento_id = ?
        ORDER BY dc.fecha_envio DESC, dc.id DESC
      `,
      [Number(documentId)],
    );

    return (rows || []).map((row) => ({
      id: Number(row.id),
      documentId: Number(row.documentId),
      to: safeJsonParse(row.toJson, []),
      cc: safeJsonParse(row.ccJson, []),
      subject: row.subject || "",
      status: row.status || "ENVIADO",
      error: row.error || null,
      sentAt: row.sentAt ? new Date(row.sentAt).toISOString() : null,
      sentByName: row.sentByName || "—",
    }));
  },

  async countDispatchesByDocumentId(documentId) {
    const [rows] = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM Despacho_Correo_Documento
        WHERE documento_id = ?
          AND estado = 'ENVIADO'
      `,
      [Number(documentId)],
    );

    return Number(rows[0]?.total || 0);
  },

  async listDispatchAnexos(documentId) {
    const [rows] = await pool.query(
      `
        SELECT
          id,
          documento_id,
          nombre_original,
          nombre_guardado,
          ruta_archivo,
          mime_type,
          tamano_bytes,
          descripcion,
          orden_visual
        FROM Documento_Anexo
        WHERE documento_id = ?
        ORDER BY orden_visual ASC, id ASC
      `,
      [Number(documentId)],
    );

    return (rows || []).map((row) => ({
      id: Number(row.id),
      documentId: Number(row.documento_id),
      fileName: row.nombre_original || row.nombre_guardado || `anexo-${row.id}`,
      storedName: row.nombre_guardado || null,
      filePath: row.ruta_archivo || null,
      mimeType: row.mime_type || "application/octet-stream",
      sizeBytes:
        row.tamano_bytes != null && row.tamano_bytes !== ""
          ? Number(row.tamano_bytes)
          : null,
      description: row.descripcion || null,
      order: row.orden_visual != null ? Number(row.orden_visual) : null,
    }));
  },

  async findDispatchAnexoById({ documentId, anexoId }) {
    const [rows] = await pool.query(
      `
        SELECT
          id,
          documento_id,
          nombre_original,
          nombre_guardado,
          ruta_archivo,
          mime_type,
          tamano_bytes
        FROM Documento_Anexo
        WHERE id = ?
          AND documento_id = ?
        LIMIT 1
      `,
      [Number(anexoId), Number(documentId)],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: Number(row.id),
      documentId: Number(row.documento_id),
      fileName: row.nombre_original || row.nombre_guardado || `anexo-${row.id}`,
      filePath: row.ruta_archivo || null,
      mimeType: row.mime_type || "application/octet-stream",
      sizeBytes:
        row.tamano_bytes != null && row.tamano_bytes !== ""
          ? Number(row.tamano_bytes)
          : null,
    };
  },
};
