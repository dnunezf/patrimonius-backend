import { pool } from "../db/pool.js";

/** User repository. SQL-only. */
export const userRepo = {
    async create(u) {
        try {
            // Inserts primary role in Usuario (compat)
            const [r] = await pool.execute(
                `INSERT INTO Usuario (nombre,apellido1,apellido2,email,rol_id,unidad_id,password,mustChangePassword)
                 VALUES (:nombre,:apellido1,:apellido2,:email,:rolId,:unidadId,'changeme',1)`,
                u
            );
            return { id: r.insertId, ...u };
        } catch (e) {
            if (e.code === "ER_DUP_ENTRY") {
                throw Object.assign(new Error("email_already_exists"), { code: 409 });
            }
            throw e;
        }
    },

    /** Sync all roles for a user (including the primary one). */
    async setRoles(userId, rolIds = []) {
        // Ensure unique integers
        const ids = Array.from(new Set((rolIds || []).map(Number))).filter(
            (n) => Number.isInteger(n) && n > 0
        );
        await pool.execute(`DELETE FROM Usuario_Rol WHERE usuario_id=:userId`, {
            userId,
        });
        if (ids.length) {
            const values = ids.map((id) => `(${userId},${id})`).join(",");
            await pool.query(
                `INSERT INTO Usuario_Rol (usuario_id, rol_id) VALUES ${values}`
            );
        }
    },

    /** Read users including aggregated roles (keeps legacy fields too). */
    async findAll() {
        const [rows] = await pool.query(
            `SELECT
                 u.id, u.nombre, u.apellido1, u.apellido2, u.email,
                 r.nombre AS rol, u.rol_id AS rolId,
                 un.nombre AS unidad, u.unidad_id AS unidadId,
                 u.mustChangePassword,
                 COALESCE(GROUP_CONCAT(DISTINCT ur.rol_id ORDER BY ur.rol_id SEPARATOR ','), '') AS rolIdsCsv,
                 COALESCE(GROUP_CONCAT(DISTINCT r2.nombre ORDER BY r2.id SEPARATOR ','), '') AS rolesCsv
             FROM Usuario u
                      JOIN Rol r ON r.id = u.rol_id
                      JOIN Unidad_Organizacional un ON un.id = u.unidad_id
                      LEFT JOIN Usuario_Rol ur ON ur.usuario_id = u.id
                      LEFT JOIN Rol r2 ON r2.id = ur.rol_id
             GROUP BY u.id
             ORDER BY u.id DESC`
        );
        return rows.map((r) => ({
            ...r,
            rolIds: r.rolIdsCsv ? r.rolIdsCsv.split(",").map((n) => Number(n)) : [],
            roles: r.rolesCsv ? r.rolesCsv.split(",") : [],
        }));
    },

    async findById(id) {
        const [rows] = await pool.query(
            `SELECT u.id, u.nombre, u.apellido1, u.apellido2, u.email,
                    u.rol_id AS rolId, u.unidad_id AS unidadId,
                    u.mustChangePassword,
                    u.last2FACode, u.last2FAExpiry,
                    COALESCE(GROUP_CONCAT(DISTINCT ur.rol_id ORDER BY ur.rol_id SEPARATOR ','), '') AS rolIdsCsv,
                    COALESCE(GROUP_CONCAT(DISTINCT r2.nombre ORDER BY r2.id SEPARATOR ','), '') AS rolesCsv
             FROM Usuario u
                      LEFT JOIN Usuario_Rol ur ON ur.usuario_id = u.id
                      LEFT JOIN Rol r2 ON r2.id = ur.rol_id
             WHERE u.id = :id
             GROUP BY u.id`,
            { id }
        );
        const row = rows[0];
        return row
            ? {
                ...row,
                rolIds: row.rolIdsCsv
                    ? row.rolIdsCsv.split(",").map((n) => Number(n))
                    : [],
                roles: row.rolesCsv ? row.rolesCsv.split(",") : [],
            }
            : null;
    },

    async update(id, patch) {
        const fields = [];
        const params = { id };
        for (const [k, v] of Object.entries(patch)) {
            fields.push(`${k}=:${k}`);
            params[k] = v;
        }
        if (fields.length) {
            await pool.execute(
                `UPDATE Usuario SET ${fields.join(", ")} WHERE id=:id`,
                params
            );
        }
        return this.findById(id);
    },

    async findByEmail(email) {
        const [rows] = await pool.query(
            `SELECT u.id, u.email, u.password AS passwordHash,
                    u.rol_id AS rolId, u.unidad_id AS unidadId,
                    u.mustChangePassword,
                    u.last2FACode, u.last2FAExpiry
             FROM Usuario u
             WHERE u.email = :email
                 LIMIT 1`,
            { email }
        );
        return rows.length ? rows[0] : null;
    },

    async search(searchTerm) {
        const [rows] = await pool.query(
            `SELECT u.id, u.nombre, u.apellido1, u.apellido2, u.email
             FROM Usuario u
             WHERE u.nombre LIKE :search OR u.email LIKE :search
             ORDER BY u.id DESC`,
            { search: `%${searchTerm}%` }
        );
        return rows;
    },

    async remove(id) {
        await pool.execute(`DELETE FROM Usuario WHERE id=:id`, { id });
    },

    /** Guarda código 2FA temporal */
    async save2FACode(userId, code, expiry) {
        await pool.execute(
            `UPDATE Usuario
             SET last2FACode = :code, last2FAExpiry = :expiry
             WHERE id = :id`,
            { code, expiry, id: userId }
        );
    },

    /** Limpia el código 2FA para que no se reutilice */
    async clear2FACode(userId) {
        await pool.execute(
            `UPDATE Usuario
             SET last2FACode = NULL, last2FAExpiry = NULL
             WHERE id = :id`,
            { id: userId }
        );
    },
};
