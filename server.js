// server.js
import http from "http";
import { app, logger } from "./src/app.js";
import { initRealtime } from "./src/realtime/ysw.js";

const port = process.env.PORT || 3000;
const server = http.createServer(app);

// inicia Socket.IO (ws en /ws)
initRealtime(server);

server.listen(port, () => logger.info(`HTTP+WS listening on :${port}`));
