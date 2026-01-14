// server.js
import http from "http";
import { app, logger } from "./src/app.js";
import { initRealtime } from "./src/realtime/ysw.js";
import { seedSystemUser } from "./src/db/seedSystemUser.js";
import { startNotificacionDigestJob } from "./src/jobs/notificacionDigest.job.js";
const port = process.env.PORT || 3000;

try {

    // 1) Asegurar usuario SYSTEM en la DB (para bitacora FK)
    const systemUserId = await seedSystemUser();
    process.env.SYSTEM_USER_ID = String(systemUserId);

    // 2) Levantar HTTP + WS
    const server = http.createServer(app);
    initRealtime(server);
    startNotificacionDigestJob();
    server.listen(port, () => logger.info(`HTTP+WS listening on :${port}`));
} catch (e) {
    console.error("❌ Error inicializando servidor:", e);
    process.exit(1);
}
