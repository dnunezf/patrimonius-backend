import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || "smtp.gmail.com", // puedes usar smtp.office365.com
    port: Number(process.env.MAIL_PORT) || 587,
    secure: false, // true para 465, false para 587
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
});

/**
 * Envía un correo genérico
 * @param {string} to - destinatario
 * @param {string} subject - asunto
 * @param {string} text - contenido plano
 */
export async function sendEmail(to, subject, text) {
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASS;
    if (!String(user || "").trim() || !String(pass || "").trim()) {
        const err = new Error(
            "Correo no configurado: defina MAIL_USER y MAIL_PASS en el entorno (.env)."
        );
        err.code = "MAIL_NOT_CONFIGURED";
        throw err;
    }
    try {
        const info = await transporter.sendMail({
            from: `"Patrimonius" <${user}>`,
            to,
            subject,
            text,
        });
        console.log("Correo enviado:", info.messageId);
        return info;
    } catch (err) {
        console.error("Error al enviar correo:", err);
        throw err;
    }
}
