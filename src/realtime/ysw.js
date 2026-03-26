// src/realtime/ysw.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { editSessionRepo } from "../repositories/editSessionRepo.js";
import { documentoService } from "../services/documento.service.js";

const SECRET = process.env.JWT_SECRET || "dev_only_key";

export function initRealtime(server) {
    const io = new Server(server, {
        path: "/ws",
        cors: { origin: "*", methods: ["GET", "POST"] },
    });

    io.use((socket, next) => {
        try {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.query?.token ||
                socket.handshake.headers?.authorization?.split(" ")[1];

            if (!token) return next(new Error("missing_token"));
            const payload = jwt.verify(token, SECRET, { algorithms: ["HS256"] });

            socket.user = {
                id: payload.id ?? payload.userId ?? 0,
                email: payload.email ?? "unknown",
                unidad_id: payload.unidad_id ?? payload.unidadId ?? null,
                rol: payload.rol ?? payload.role ?? null,
            };
            next();
        } catch {
            next(new Error("invalid_token"));
        }
    });

    io.on("connection", (socket) => {
        socket.on("editor:join", async ({ documentoId }) => {
            if (!documentoId) return;
            const room = `doc:${documentoId}`;
            socket.join(room);

            let active = true; // 🟢 Flag de vida

            // Registrar usuario activo
            await editSessionRepo.upsert(documentoId, socket.user.id);
            io.to(room).emit("presence:update", await editSessionRepo.listActive(documentoId, 60));

            const hb = setInterval(async () => {
                if (!active) return; // evita ejecución tras desconexión
                try {
                    await editSessionRepo.upsert(documentoId, socket.user.id);
                    io.to(room).emit("presence:update", await editSessionRepo.listActive(documentoId, 60));
                } catch {}
            }, 25000);
            socket.data._hb = hb;

            socket.on("content:patch", ({ content, ts }) => {
                socket.to(room).emit("content:patch", { from: socket.user.id, content, ts });
            });

            socket.on("editor:save", async ({ documentoId, content, baseVersionId }) => {
                try {
                    const res = await documentoService.colabSave({
                        documento_id: documentoId,
                        usuario_id: socket.user.id,
                        contenido: content,
                        base_version_id: Number(baseVersionId),
                    });
                    io.to(room).emit("editor:saved", { by: socket.user.id, version_id: res.version_id });
                } catch (e) {
                    if (e.code === "VERSION_CONFLICT") {
                        socket.emit("editor:conflict", e.details);
                    } else {
                        socket.emit("editor:error", { message: e.message });
                    }
                }
            });

            socket.on("editor:cursor", (payload) => {
                socket.to(room).emit("editor:cursor", { userId: socket.user.id, ...payload });
            });

            socket.on("disconnect", async () => {
                active = false; // 🔴 Detiene el heartbeat
                clearInterval(hb);
                try {
                    await editSessionRepo.remove(documentoId, socket.user.id);
                    io.to(room).emit("presence:update", await editSessionRepo.listActive(documentoId, 60));
                } catch {}
            });
        });
    });

    return io;
}