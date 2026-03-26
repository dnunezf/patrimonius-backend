//src/repositories/userRepo.js
import { pool } from "../db/pool.js";

/** User repository. SQL-only. */
export const userRepo = {
    // ============================
    // NUEVO: Upload permission API
    // ============================
    async hasUpload(userId) {
        const [[row]] = await pool.query(
            `SELECT 1 AS ok
       FROM Editor_Permission
       WHERE user_id = :userId AND perm = 'UPLOAD'
       LIMIT 1`,
            { userId }
        );
        return !!row;
    },

    async setUpload(userId, enabled) {
        if (enabled) {
            await pool.execute(
                `INSERT IGNORE INTO Editor_Permission (user_id, perm)
         VALUES (:userId, 'UPLOAD')`,
                { userId }
            );
        } else {
            await pool.execute(
                `DELETE FROM Editor_Permission
         WHERE user_id = :userId AND perm = 'UPLOAD'`,
                { userId }
            );
        }
    },

    async create(u) {
        // Normalize and validate inputs defensively
        const nombre = String(u?.nombre ?? "").trim();
        const apellido1 = String(u?.apellido1 ?? "").trim();
        const apellido2 = String(u?.apellido2 ?? "").trim();
        const email = String(u?.email ?? "").trim().toLowerCase();
        const rolId = Number(u?.rolId);
        const unidadId = Number(u?.unidadId);

        // persisted caps (Usuario)
        const canEdit = u?.canEdit === false ? 0 : 1; // default true
        const canSign = u?.canSign === false ? 0 : 1; // default true

        if (!nombre || !apellido1 || !email) {
            const err = new Error("missing_required_fields");
            err.code = 400;
            throw err;
        }
        if (!Number.isInteger(rolId) || rolId <= 0) {
            const err = new Error("invalid_role_id");
            err.code = 400;
            throw err;
        }
        if (!Number.isInteger(unidadId) || unidadId <= 0) {
            const err = new Error("invalid_unit_id");
            err.code = 400;
            throw err;
        }

        const [[role]] = await pool.query(`SELECT id FROM Rol WHERE id = :id LIMIT 1`, { id: rolId });
        if (!role) {
            const err = new Error("role_not_found");
            err.code = 400;
            throw err;
        }

        const [[unit]] = await pool.query(
            `SELECT id FROM Unidad_Organizacional WHERE id = :id LIMIT 1`,
            { id: unidadId }
        );
        if (!unit) {
            const err = new Error("unit_not_found");
            err.code = 400;
            throw err;
        }

        try {
            const [r] = await pool.execute(
                `INSERT INTO Usuario
                 (nombre, apellido1, apellido2, email, rol_id, unidad_id, password, mustChangePassword, can_edit, can_sign)
                 VALUES (:nombre, :apellido1, :apellido2, :email, :rolId, :unidadId, 'changeme', 1, :canEdit, :canSign)`,
                { nombre, apellido1, apellido2, email, rolId, unidadId, canEdit, canSign }
            );
            return {
                id: r.insertId,
                nombre,
                apellido1,
                apellido2,
                email,
                rolId,
                unidadId,
                canEdit: !!Number(canEdit),
                canSign: !!Number(canSign),
            };
        } catch (e) {
            if (e.code === "ER_DUP_ENTRY") {
                const err = new Error("email_already_exists");
                err.code = 409;
                throw err;
            }
            if (e.code === "ER_NO_REFERENCED_ROW_2") {
                const err = new Error("foreign_key_violation");
                err.code = 400;
                throw err;
            }
            throw e;
        }
    },

    /** Sync all roles for a user (including the primary one). */
    async setRoles(userId, rolIds = []) {
        const ids = Array.from(new Set((rolIds || []).map(Number))).filter(
            (n) => Number.isInteger(n) && n > 0
        );
        await pool.execute(`DELETE FROM Usuario_Rol WHERE usuario_id=:userId`, { userId });
        if (ids.length) {
            const values = ids.map((id) => `(${userId},${id})`).join(",");
            await pool.query(`INSERT INTO Usuario_Rol (usuario_id, rol_id) VALUES ${values}`);
        }
    },

    /** Read users including aggregated roles. */
    async findAll() {
        const [rows] = await pool.query(
            `SELECT
                 u.id, u.nombre, u.apellido1, u.apellido2, u.email,
                 r.nombre AS rol, u.rol_id AS rolId,
                 un.nombre AS unidad, u.unidad_id AS unidadId,
                 u.mustChangePassword,
                 u.can_edit AS canEdit, u.can_sign AS canSign,
                 EXISTS(
                     SELECT 1 FROM Editor_Permission ep
                     WHERE ep.user_id = u.id AND ep.perm = 'UPLOAD'
                 ) AS canUpload,
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
            canEdit: !!Number(r.canEdit ?? 1),
            canSign: !!Number(r.canSign ?? 1),
            canUpload: !!Number(r.canUpload ?? 0),
            rolIds: r.rolIdsCsv ? r.rolIdsCsv.split(",").map((n) => Number(n)) : [],
            roles: r.rolesCsv ? r.rolesCsv.split(",") : [],
        }));
    },

    async findById(id) {
        const [rows] = await pool.query(
            `SELECT
                 u.id, u.nombre, u.apellido1, u.apellido2, u.email,
                 u.rol_id AS rolId,
                 r.nombre  AS rol,
                 u.unidad_id AS unidadId,
                 un.nombre AS unidad,
                 u.mustChangePassword,
                 u.can_edit AS canEdit, u.can_sign AS canSign,
                 EXISTS(
                     SELECT 1 FROM Editor_Permission ep
                     WHERE ep.user_id = u.id AND ep.perm = 'UPLOAD'
                 ) AS canUpload,
                 u.last2FACode, u.last2FAExpiry,
                 COALESCE(GROUP_CONCAT(DISTINCT ur.rol_id ORDER BY ur.rol_id SEPARATOR ','), '') AS rolIdsCsv,
                 COALESCE(GROUP_CONCAT(DISTINCT r2.nombre ORDER BY r2.id SEPARATOR ','), '') AS rolesCsv
             FROM Usuario u
                      JOIN Rol r  ON r.id  = u.rol_id
                      JOIN Unidad_Organizacional un ON un.id = u.unidad_id
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
                canEdit: !!Number(row.canEdit ?? 1),
                canSign: !!Number(row.canSign ?? 1),
                canUpload: !!Number(row.canUpload ?? 0),
                rolIds: row.rolIdsCsv ? row.rolIdsCsv.split(",").map(Number) : [],
                roles: row.rolesCsv ? row.rolesCsv.split(",") : [],
            }
            : null;
    },

    async update(id, patch) {
        const fields = [];
        const params = { id };

        const map = { ...patch };
        if (map.rol_id != null) map.rol_id = Number(map.rol_id);
        if (map.unidad_id != null) map.unidad_id = Number(map.unidad_id);

        if (map.can_edit != null) map.can_edit = map.can_edit ? 1 : 0;
        if (map.can_sign != null) map.can_sign = map.can_sign ? 1 : 0;

        for (const [k, v] of Object.entries(map)) {
            fields.push(`${k}=:${k}`);
            params[k] = v;
        }
        if (fields.length) {
            await pool.execute(`UPDATE Usuario SET ${fields.join(", ")} WHERE id=:id`, params);
        }
        return this.findById(id);
    },

    async findByEmail(email) {
        const norm = String(email ?? "").trim().toLowerCase();
        const [rows] = await pool.query(
            `SELECT u.id, u.email, u.password AS passwordHash,
                    u.rol_id AS rolId, u.unidad_id AS unidadId,
                    u.can_edit AS canEdit, u.can_sign AS canSign,
                    u.mustChangePassword, u.last2FACode, u.last2FAExpiry
             FROM Usuario u
             WHERE u.email = :email
                 LIMIT 1`,
            { email: norm }
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

    async save2FACode(userId, code, expiry) {
        await pool.execute(
            `UPDATE Usuario
             SET last2FACode = :code, last2FAExpiry = :expiry
             WHERE id = :id`,
            { code, expiry, id: userId }
        );
    },

    async clear2FACode(userId) {
        await pool.execute(
            `UPDATE Usuario
             SET last2FACode = NULL, last2FAExpiry = NULL
             WHERE id = :id`,
            { id: userId }
        );
    },

    async findEmailsByIds(ids = []) {
        const clean = Array.from(new Set(ids.map(Number))).filter(
            (n) => Number.isInteger(n) && n > 0
        );
        if (!clean.length) return [];

        const placeholders = clean.map(() => "?").join(",");
        const [rows] = await pool.query(
            `SELECT id, email, nombre, apellido1 FROM Usuario WHERE id IN (${placeholders})`,
            clean
        );
        return rows;
    },
};