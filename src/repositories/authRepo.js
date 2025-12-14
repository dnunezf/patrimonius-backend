//src/authRepo.js
import { pool } from "../db/pool.js";
import bcrypt from "bcryptjs";

export const authRepo = {
    async findByEmail(email) {
        const [rows] = await pool.query(
            `SELECT * FROM Usuario WHERE email = :email LIMIT 1`,
            { email }
        );
        return rows[0] || null;
    },

    async verifyPassword(plain, hashed) {

        return bcrypt.compare(plain, hashed || "");
    }
};
