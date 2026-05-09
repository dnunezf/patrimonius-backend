// src/realtime/ysw.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { editSessionRepo } from "../repositories/editSessionRepo.js";
import { documentoService } from "../services/documento.service.js";

const SECRET = process.env.JWT_SECRET || "dev_only_key";

function getTokenFromSocket(socket) {
    const authToken = socket.handshake.auth?.token;
    const queryToken = socket.handshake.query?.token;
    const authorization = socket.handshake.headers?.authorization;

    if (authToken) return authToken;
    if (queryToken) return queryToken;

    if (authorization && String(authorization).startsWith("Bearer ")) {
        return String(authorization).split(" ")[1];
    }

    return null;
}

function normalizeDocumentoId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeUserFromPayload(payload) {
    const userId = Number(payload.id ?? payload.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
        return null;
    }

    return {
        id: userId,
        email: payload.email ?? "unknown",
        unidad_id: payload.unidad_id ?? payload.unidadId ?? null,
        rol: payload.rol ?? payload.role ?? null,
    };
}

export function initRealtime(server) {
    const io = new Server(server, {
        path: "/ws",
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });

    io.use((socket, next) => {
        try {
            const token = getTokenFromSocket(socket);

            if (!token) {
                return next(new Error("missing_token"));
            }

            const payload = jwt.verify(token, SECRET, {
                algorithms: ["HS256"],
            });

            const user = normalizeUserFromPayload(payload);

            if (!user) {
                return next(new Error("invalid_user"));
            }

            socket.user = user;
            return next();
        } catch (error) {
            return next(new Error("invalid_token"));
        }
    });

    io.on("connection", (socket) => {
        socket.data.joinedDocuments = new Set();
        socket.data.heartbeats = new Map();

        socket.on("editor:join", async ({ documentoId }) => {
            const docId = normalizeDocumentoId(documentoId);
            if (!docId) return;

            const room = `doc:${docId}`;

            if (socket.data.joinedDocuments.has(docId)) {
                return;
            }

            socket.data.joinedDocuments.add(docId);
            socket.join(room);

            try {
                await editSessionRepo.upsert(docId, socket.user.id);

                const activeUsers = await editSessionRepo.listActive(docId, 60);

                io.to(room).emit("presence:update", activeUsers);
            } catch (error) {
                socket.emit("editor:error", {
                    message: "No se pudo registrar la sesión de edición.",
                });
            }

            const heartbeat = setInterval(async () => {
                try {
                    await editSessionRepo.upsert(docId, socket.user.id);

                    const activeUsers = await editSessionRepo.listActive(docId, 60);

                    io.to(room).emit("presence:update", activeUsers);
                } catch {
                    // No se rompe el socket por un fallo temporal de presencia.
                }
            }, 25000);

            socket.data.heartbeats.set(docId, heartbeat);
        });

        socket.on("delta", ({ documentoId, delta, ts, from }) => {
            const docId = normalizeDocumentoId(documentoId);
            if (!docId || !delta) return;

            const room = `doc:${docId}`;

            if (!socket.rooms.has(room)) {
                socket.join(room);
                socket.data.joinedDocuments.add(docId);
            }

            socket.to(room).emit("delta", {
                documentoId: docId,
                delta,
                ts: ts || Date.now(),
                from: from || socket.id,
                userId: socket.user.id,
            });
        });

        socket.on("content:patch", ({ documentoId, content, ts, from }) => {
            const docId = normalizeDocumentoId(documentoId);
            if (!docId || typeof content !== "string") return;

            const room = `doc:${docId}`;

            if (!socket.rooms.has(room)) {
                socket.join(room);
                socket.data.joinedDocuments.add(docId);
            }

            socket.to(room).emit("content:patch", {
                documentoId: docId,
                content,
                ts: ts || Date.now(),
                from: from || socket.id,
                userId: socket.user.id,
            });
        });

        socket.on("editor:save", async ({ documentoId, content, baseVersionId }) => {
            const docId = normalizeDocumentoId(documentoId);

            if (!docId) {
                socket.emit("editor:error", {
                    message: "Documento inválido.",
                });
                return;
            }

            const room = `doc:${docId}`;

            try {
                const result = await documentoService.colabSave({
                    documento_id: docId,
                    usuario_id: socket.user.id,
                    contenido: content ?? "",
                    base_version_id: Number(baseVersionId),
                });

                io.to(room).emit("editor:saved", {
                    documentoId: docId,
                    by: socket.user.id,
                    version_id: result.version_id,
                    saved: result.saved,
                    reason: result.reason ?? null,
                });
            } catch (error) {
                if (error.code === "VERSION_CONFLICT") {
                    socket.emit("editor:conflict", {
                        documentoId: docId,
                        ...(error.details ?? {}),
                    });
                    return;
                }

                socket.emit("editor:error", {
                    documentoId: docId,
                    message: error.message || "No se pudo guardar el documento.",
                });
            }
        });

        socket.on("editor:cursor", ({ documentoId, index, length, range, ts }) => {
            const docId = normalizeDocumentoId(documentoId);
            if (!docId) return;

            const room = `doc:${docId}`;

            if (!socket.rooms.has(room)) {
                return;
            }

            socket.to(room).emit("editor:cursor", {
                documentoId: docId,
                userId: socket.user.id,
                index: index ?? range?.index ?? null,
                length: length ?? range?.length ?? 0,
                range: range ?? null,
                ts: ts || Date.now(),
            });
        });

        socket.on("comentario:nuevo", ({ documentoId, comentario }) => {
            const docId = normalizeDocumentoId(documentoId);
            if (!docId || !comentario) return;

            const room = `doc:${docId}`;

            socket.to(room).emit("comentario:nuevo", comentario);
        });

        socket.on("comentario:resuelto", ({ documentoId, id }) => {
            const docId = normalizeDocumentoId(documentoId);
            const comentarioId = Number(id);

            if (!docId || !comentarioId) return;

            const room = `doc:${docId}`;

            socket.to(room).emit("comentario:resuelto", {
                id: comentarioId,
            });
        });

        socket.on("disconnect", async () => {
            const joinedDocuments = Array.from(socket.data.joinedDocuments ?? []);

            for (const docId of joinedDocuments) {
                const heartbeat = socket.data.heartbeats?.get(docId);

                if (heartbeat) {
                    clearInterval(heartbeat);
                }

                const room = `doc:${docId}`;

                try {
                    await editSessionRepo.remove(docId, socket.user.id);

                    const activeUsers = await editSessionRepo.listActive(docId, 60);

                    socket.to(room).emit("presence:update", activeUsers);
                } catch {
                    // No hacer nada. El socket ya se está desconectando.
                }
            }

            socket.data.joinedDocuments?.clear?.();
            socket.data.heartbeats?.clear?.();
        });
    });

    return io;
}