import nodemailer from "nodemailer";

// Rate limiting configuration
const RATE_LIMIT = {
    maxPerSecond: 2,        // Máximo 2 correos por segundo
    maxPerMinute: 30,       // Máximo 30 correos por minuto
    maxPerHour: 90,         // Máximo 90 correos por hora (dejar margen para Microsoft 365)
};

// Track email sending times
const emailHistory = {
    bySecond: [],
    byMinute: [],
    byHour: [],
};

// Multiple SMTP accounts for load balancing
const smtpAccounts = [
    {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
        host: process.env.MAIL_HOST || "smtp.gmail.com",
        port: Number(process.env.MAIL_PORT) || 587,
    },
];

let currentAccountIndex = 0;

// Create transporters for each account
const transporters = smtpAccounts.map(account =>
    nodemailer.createTransport({
        host: account.host,
        port: account.port,
        secure: account.port === 465,
        auth: {
            user: account.user,
            pass: account.pass,
        },
        pool: true,
        maxConnections: 3,
        maxMessages: 50,
        rateDelta: 500,  // 500ms entre mensajes
        rateLimit: 2,     // máximo 2 mensajes por 500ms
        connectionTimeout: 10000,  // 10 segundos timeout de conexión
        socketTimeout: 10000,       // 10 segundos timeout de socket
        greetingTimeout: 10000,     // 10 segundos timeout de saludo
        tls: {
            rejectUnauthorized: false,
        },
    })
);

function getNextTransporter() {
    const transporter = transporters[currentAccountIndex];
    currentAccountIndex = (currentAccountIndex + 1) % transporters.length;
    return transporter;
}

function cleanupHistory() {
    const now = Date.now();

    // Limpiar historial por segundo
    emailHistory.bySecond = emailHistory.bySecond.filter(
        timestamp => now - timestamp < 1000
    );

    // Limpiar historial por minuto
    emailHistory.byMinute = emailHistory.byMinute.filter(
        timestamp => now - timestamp < 60000
    );

    // Limpiar historial por hora
    emailHistory.byHour = emailHistory.byHour.filter(
        timestamp => now - timestamp < 3600000
    );
}

async function checkRateLimit() {
    cleanupHistory();

    const now = Date.now();

    // Verificar límite por segundo
    if (emailHistory.bySecond.length >= RATE_LIMIT.maxPerSecond) {
        const oldestEmail = Math.min(...emailHistory.bySecond);
        const waitTime = 1000 - (now - oldestEmail);
        if (waitTime > 0) {
            console.log(`Rate limit por segundo alcanzado. Esperando ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    // Verificar límite por minuto
    if (emailHistory.byMinute.length >= RATE_LIMIT.maxPerMinute) {
        const oldestEmail = Math.min(...emailHistory.byMinute);
        const waitTime = 60000 - (now - oldestEmail);
        if (waitTime > 0) {
            console.log(`Rate limit por minuto alcanzado. Esperando ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    // Verificar límite por hora
    if (emailHistory.byHour.length >= RATE_LIMIT.maxPerHour) {
        const oldestEmail = Math.min(...emailHistory.byHour);
        const waitTime = 3600000 - (now - oldestEmail);
        if (waitTime > 0) {
            console.log(`Rate limit por hora alcanzado. Esperando ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    // Registrar este envío
    const timestamp = Date.now();
    emailHistory.bySecond.push(timestamp);
    emailHistory.byMinute.push(timestamp);
    emailHistory.byHour.push(timestamp);
}

async function sendEmailWithRetry(to, subject, text, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const transporter = getNextTransporter();
            const accountIndex = (currentAccountIndex - 1 + smtpAccounts.length) % smtpAccounts.length;
            const account = smtpAccounts[accountIndex];

            console.log(`Intentando enviar correo (intento ${attempt}/${maxRetries}):`, {
                host: account.host,
                port: account.port,
                user: account.user,
                to,
                subject
            });

            const info = await transporter.sendMail({
                from: `"Patrimonius" <${account.user}>`,
                to,
                subject,
                text,
            });

            console.log(`Correo enviado (intento ${attempt}):`, info.messageId);
            return { success: true, attempt, info };
        } catch (err) {
            console.error(`Error al enviar correo (intento ${attempt}/${maxRetries}):`, {
                message: err.message,
                code: err.code,
                command: err.command,
                response: err.response,
                responseCode: err.responseCode
            });

            if (attempt === maxRetries) {
                throw err;
            }

            // Espera exponencial: 1s, 2s, 4s, 8s...
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
            console.log(`Reintentando en ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Envía un correo genérico con rate limiting y reintentos
 * @param {string} to - destinatario
 * @param {string} subject - asunto
 * @param {string} text - contenido plano
 * @param {Object} options - opciones adicionales
 * @param {number} options.priority - prioridad (1=alta, 2=normal, 3=baja)
 */
export async function sendEmail(to, subject, text, options = {}) {
    // Verificar configuración
    if (!smtpAccounts.length || !smtpAccounts[0].user || !smtpAccounts[0].pass) {
        const err = new Error(
            "Correo no configurado: defina MAIL_USER y MAIL_PASS en el entorno (.env)."
        );
        err.code = "MAIL_NOT_CONFIGURED";
        throw err;
    }

    try {
        // Aplicar rate limiting
        await checkRateLimit();

        // Enviar con reintentos
        const result = await sendEmailWithRetry(to, subject, text);

        return result.info;
    } catch (err) {
        console.error("Error fatal al enviar correo:", err);

        // Guardar error para análisis posterior
        const errorData = {
            timestamp: new Date().toISOString(),
            to,
            subject,
            error: err.message,
            code: err.code,
        };


        console.error("Error registrado:", errorData);

        throw err;
    }
}

/**
 * Envía múltiples correos con control de concurrencia
 * @param {Array} emails - array de {to, subject, text}
 * @param {number} concurrency - número máximo de envíos simultáneos
 */
export async function sendBulkEmails(emails, concurrency = 3) {
    const results = [];

    for (let i = 0; i < emails.length; i += concurrency) {
        const batch = emails.slice(i, i + concurrency);

        const promises = batch.map(async (email) => {
            try {
                const result = await sendEmail(email.to, email.subject, email.text);
                return { success: true, email: email.to, result };
            } catch (err) {
                return { success: false, email: email.to, error: err.message };
            }
        });

        const batchResults = await Promise.all(promises);
        results.push(...batchResults);

        // Pequeña pausa entre lotes para no sobrecargar
        if (i + concurrency < emails.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return results;
}
