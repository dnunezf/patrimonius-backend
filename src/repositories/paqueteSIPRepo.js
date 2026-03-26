//src/repositories/paqueteSIPRepo.js
import { pool } from "../db/pool.js";

/** PaqueteSIP repository. SQL-only. */
export const paqueteSIPRepo = {
    // Crear un nuevo Paquete SIP
    async createPaqueteSIP(paqueteData) {
        const { documento_id, metadatos, archivo } = paqueteData;
        const query = `
      INSERT INTO PaqueteSIP (documento_id, metadatos, archivo)
      VALUES (?, ?, ?)
    `;
        const values = [documento_id, metadatos, archivo];

        const [result] = await pool.query(query, values);
        return { id: result.insertId, ...paqueteData }; // Devolver el objeto creado con el ID asignado
    },

    // Obtener todos los paquetes SIP
    async getAllPaquetesSIP() {
        const query = "SELECT * FROM PaqueteSIP";
        const [rows] = await pool.query(query);
        return rows;
    },

    // Obtener un paquete SIP por ID
    async getPaqueteSIPById(id) {
        const query = `
      SELECT id, documento_id, metadatos, archivo
      FROM PaqueteSIP
      WHERE id = ?
    `;
        const [rows] = await pool.query(query, [id]);
        return rows[0] || null;
    },

    // Eliminar un paquete SIP por ID
    async removePaqueteSIP(id) {
        const query = `DELETE FROM PaqueteSIP WHERE id = ?`;
        await pool.query(query, [id]);
    },

    // Actualizar un paquete SIP
    async updatePaqueteSIP(id, updateData) {
        const { documento_id, metadatos, archivo } = updateData;
        const query = `
      UPDATE PaqueteSIP
      SET documento_id = ?, metadatos = ?, archivo = ?
      WHERE id = ?
    `;
        const values = [documento_id, metadatos, archivo, id];

        const [result] = await pool.query(query, values);
        return result.affectedRows > 0 ? { id, ...updateData } : null; // Devuelve el paquete SIP actualizado
    },
};