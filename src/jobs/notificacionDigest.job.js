//src/jobs/notificacionDigest.job.js
import cron from "node-cron";
import { notificacionService } from "../services/notificacion.service.js";

/**
 * node-cron solo ejecuta en el instante programado: si el proceso Node arranca
 * o se reinicia *después* de esa hora, ese disparo del día ya no corre (no hay “catch-up”).
 */
export function startNotificacionDigestJob() {
    cron.schedule(
        "0 8 * * *",
        async () => {
            try {
                const out = await notificacionService.sendDailyEditDigestEmails();
                console.log("✅ Digest notificaciones (8am):", out);
            } catch (err) {
                console.error("❌ Error digest notificaciones:", err);
            }
        },
        { timezone: "America/Costa_Rica" }
    );

    cron.schedule(
        "0 10 1 6 *",
        async () => {
            try {
                const out = await notificacionService.notifyArchivistasExpedientesActivosSemestral({
                    campaign: "JUN",
                });
                console.log("✅ Recordatorio archivistas expedientes ACTIVO (20 jun 10:00 CR):", out);
            } catch (err) {
                console.error("❌ Error recordatorio archivistas (junio):", err);
            }
        },
        { timezone: "America/Costa_Rica" }
    );

    cron.schedule(
        "0 10 1 11 *",
        async () => {
            try {
                const out = await notificacionService.notifyArchivistasExpedientesActivosSemestral({
                    campaign: "NOV",
                });
                console.log("✅ Recordatorio archivistas expedientes ACTIVO (1 nov 10:00):", out);
            } catch (err) {
                console.error("❌ Error recordatorio archivistas (noviembre):", err);
            }
        },
        { timezone: "America/Costa_Rica" }
    );

    console.log("🕗 Job Digest Notificaciones activo (08:00 America/Costa_Rica)");
    console.log(
        "📅 Jobs recordatorio archivistas (expedientes ACTIVO): 20 jun y 1 nov 10:00 America/Costa_Rica"
    );

    // Prueba local sin esperar al cron: .env → ARCHIVISTA_EXP_ACTIVOS_DEBUG_RUN=true (y reiniciar backend).
    if (String(process.env.ARCHIVISTA_EXP_ACTIVOS_DEBUG_RUN || "").toLowerCase() === "true") {
        const delayMs = Number(process.env.ARCHIVISTA_EXP_ACTIVOS_DEBUG_DELAY_MS || 8000);
        setTimeout(() => {
            notificacionService
                .notifyArchivistasExpedientesActivosSemestral({ campaign: "JUN" })
                .catch((err) => console.error("🔧 DEBUG recordatorio archivistas error:", err));
        }, delayMs);
    }
}
