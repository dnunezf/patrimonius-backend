// src/repositories/documentoRepo.js
import { pool } from "../db/pool.js";

export const documentoRepo = {
    async create(dto) {
        const {
            numero_serie,
            titulo,
            contenido,
            estado,
            fecha,
            unidad_id,
            usuario_id,
            categoria_id,
        } = dto;

        const query = `
            INSERT INTO Documento (numero_serie, titulo, contenido, estado, fecha, unidad_id, usuario_id, categoria_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await pool.query(query, [
            numero_serie,
            titulo,
            contenido,
            estado,
            fecha,
            unidad_id,
            usuario_id,
            categoria_id ?? null,
        ]);

        return { id: result.insertId, ...dto };
    },

    async findAll() {
        const query = `
      SELECT d.*, u.nombre AS nombre_usuario, c.nombre AS nombre_categoria, un.nombre AS nombre_unidad
      FROM Documento d
      JOIN Usuario u ON u.id = d.usuario_id
      JOIN Unidad_Organizacional un ON un.id = d.unidad_id
      LEFT JOIN Categoria c ON c.id = d.categoria_id
      ORDER BY d.fecha DESC
    `;
        const [rows] = await pool.query(query);
        return rows;
    },

    async findById(id) {
        const query = `SELECT * FROM Documento WHERE id = ?`;
        const [rows] = await pool.query(query, [id]);
        return rows[0] ?? null;
    },

    async update(id, patch) {
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(patch)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }

        if (!fields.length) return this.findById(id);

        const query = `UPDATE Documento SET ${fields.join(", ")} WHERE id = ?`;
        values.push(id);

        await pool.query(query, values);
        return this.findById(id);
    },

    async remove(id) {
        await pool.query(`DELETE FROM Documento WHERE id = ?`, [id]);
    },

    // ==== MÉTODOS EXTRA PARA HU-007/008/016 ====

// Alias para mantener compatibilidad con servicios que llaman insertDocumento
    async insertDocumento(dto) {
        return this.create(dto);
    },

// Vincular documento con plantilla
    async linkPlantilla(documento_id, plantilla_id) {
        await pool.query(
            `INSERT INTO Documento_Plantilla (documento_id, plantilla_id) VALUES (?, ?)`,
            [documento_id, plantilla_id]
        );
    },



// Actualizar solo el contenido (cache en la tabla Documento)
    async updateContenido(id, contenido) {
        await pool.query(`UPDATE Documento SET contenido = ? WHERE id = ?`, [contenido, id]);
        return this.findById(id);
    },

// Cambiar estado del documento
    async updateEstado(id, estado) {
        await pool.query(`UPDATE Documento SET estado = ? WHERE id = ?`, [estado, id]);
        return this.findById(id);
    },

// Actualizar número de serie (para índice oficial)
    async updateNumeroSerie(id, numero_serie) {
        await pool.query(`UPDATE Documento SET numero_serie = ? WHERE id = ?`, [numero_serie, id]);
        return this.findById(id);
    },

// (Compat) usado por tu editDocument actual
    async updateContent(documentId, content) {
        return this.updateContenido(documentId, content);
    },

// (Compat) firmado rápido: registra firma y suma contador
// Nota: tu service actual no pasa userId al repo; si no viene, se usa el creador del documento como firmante.
    async sign(documentId, userId = null) {
        // fallback al creador si no llega userId desde el service
        if (!userId) {
            const [r] = await pool.query(`SELECT usuario_id FROM Documento WHERE id = ?`, [documentId]);
            userId = r[0]?.usuario_id ?? null;
        }

        if (!userId) {
            // Último fallback seguro: no insertes firma sin usuario
            throw new Error('No se pudo determinar el usuario firmante');
        }

        await pool.query(
            `INSERT INTO Firma_Digital (fecha, documento_id, usuario_id) VALUES (NOW(), ?, ?)`,
            [documentId, userId]
        );

        await pool.query(
            `UPDATE Documento
     SET firmas_obtenidas = COALESCE(firmas_obtenidas, 0) + 1
     WHERE id = ?`,
            [documentId]
        );

        return this.findById(documentId);
    },

    async insertVersion({ documento_id, contenido, fecha, nombre_versionado = null }) {
        const [res] = await pool.query(
            `INSERT INTO Version_Documento (fecha, contenido, documento_id, nombre_versionado)
     VALUES (?, ?, ?, ?)`,
            [fecha, contenido, documento_id, nombre_versionado]
        );
        return res.insertId;
    },

    async countVersions(documento_id) {
        const [r] = await pool.query(
            `SELECT COUNT(*) AS n FROM Version_Documento WHERE documento_id = ?`,
            [documento_id]
        );
        return r[0]?.n ?? 0;
    },

    async getContenido(documento_id) {
        const [rows] = await pool.query(
            `SELECT id, titulo, contenido, estado, usuario_id, unidad_id, categoria_id
       FROM Documento
       WHERE id = ?`,
            [documento_id]
        );
        return rows[0] ?? null;
    },

    async getLatestVersion(documento_id) {
        const [rows] = await pool.query(
            `SELECT id, fecha FROM Version_Documento
       WHERE documento_id = ?
       ORDER BY id DESC
       LIMIT 1`,
            [documento_id]
        );
        return rows[0] ?? null;
    },



};