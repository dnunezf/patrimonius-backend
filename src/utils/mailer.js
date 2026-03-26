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
    try {
        const info = await transporter.sendMail({
            from: `"Patrimonius" <${process.env.MAIL_USER}>`,
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
