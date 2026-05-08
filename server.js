import http from "http";

process.on("uncaughtException", (err) => {
    console.error("🔥 uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
    console.error("🔥 unhandledRejection:", reason);
});

console.log("1. Antes de imports dinámicos");

try {
    const { app, logger } = await import("./src/app.js");
    console.log("2. app.js cargado");

    const { initRealtime } = await import("./src/realtime/ysw.js");
    console.log("3. ysw.js cargado");

    console.log("DB_HOST =", process.env.DB_HOST);
    console.log("DB_PORT =", process.env.DB_PORT);
    console.log("DB_DATABASE =", process.env.DB_DATABASE);

    const dbUser = process.env.DB_USER || "";
    console.log("DB_USER raw =", JSON.stringify(dbUser));
    console.log("DB_USER length =", dbUser.length);
    console.log("DB_USER has dot =", dbUser.includes("."));

    const { seedSystemUser } = await import("./src/db/seedSystemUser.js");
    console.log("4. seedSystemUser.js cargado");

    const { startNotificacionDigestJob } = await import("./src/jobs/notificacionDigest.job.js");
    console.log("5. notificacionDigest.job.js cargado");

    const port = process.env.PORT || 3000;
    console.log("6. Antes de seedSystemUser");

    const systemUserId = await seedSystemUser();
    console.log("7. seedSystemUser OK:", systemUserId);

    process.env.SYSTEM_USER_ID = String(systemUserId);

    const server = http.createServer(app);
    console.log("8. HTTP server creado");

    initRealtime(server);
    console.log("9. Realtime iniciado");

    startNotificacionDigestJob();
    console.log("10. Job iniciado");

    server.listen(port, "0.0.0.0", () => {
        logger.info(`HTTP+WS listening on :${port}`);
        console.log(`✅ HTTP+WS listening on :${port}`);
    });
} catch (e) {
    console.error("❌ Error inicializando servidor:", e);
    process.exit(1);
}