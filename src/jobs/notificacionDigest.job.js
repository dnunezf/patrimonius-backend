import cron from "node-cron";
import { notificacionService } from "../services/notificacion.service.js";

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

    console.log("🕗 Job Digest Notificaciones activo (08:00 America/Costa_Rica)");
}
