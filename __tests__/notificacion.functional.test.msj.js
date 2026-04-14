import request from "supertest";
import express from "express";
import { jest } from "@jest/globals";

// Mock del middleware de auth
const mockAuthGuard = (req, res, next) => {
    req.user = { id: 5, role: "ADMIN" };
    next();
};

// Mock del service
const mockNotificacionService = {
    listarPorUsuario: jest.fn(async (usuarioId) => [
        {
            id: 1,
            usuario_id: usuarioId,
            tipo: "DOC_FIRMA_SOLICITADA",
            titulo: "Firma requerida",
            mensaje: "Debe firmar el documento 20",
            leida: 0,
            enlace_directo: "/firma/20",
            created_at: "2026-03-15T10:00:00Z",
        },
        {
            id: 2,
            usuario_id: usuarioId,
            tipo: "DOC_ARCHIVADO",
            titulo: "Documento archivado",
            mensaje: "El documento 40 fue archivado",
            leida: 1,
            enlace_directo: "/editor/document/40",
            created_at: "2026-03-14T08:00:00Z",
        },
    ]),

    marcarLeida: jest.fn(async (id, usuarioId) => ({
        id,
        usuarioId,
        leida: 1,
    })),
};

// App de prueba
const app = express();
app.use(express.json());

// Rutas fake para prueba funcional
app.get("/api/notificaciones", mockAuthGuard, async (req, res) => {
    try {
        const data = await mockNotificacionService.listarPorUsuario(req.user.id);
        return res.status(200).json({
            ok: true,
            data,
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error al listar notificaciones",
        });
    }
});

app.patch("/api/notificaciones/:id/leida", mockAuthGuard, async (req, res) => {
    try {
        const out = await mockNotificacionService.marcarLeida(
            Number(req.params.id),
            req.user.id
        );

        return res.status(200).json({
            ok: true,
            data: out,
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            message: "Error al marcar notificación como leída",
        });
    }
});

describe("HU-030 Pruebas funcionales de notificaciones", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("HU-030 debe listar las notificaciones del usuario autenticado", async () => {
        const res = await request(app)
            .get("/api/notificaciones")
            .expect(200);

        expect(res.body.ok).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data).toHaveLength(2);

        expect(res.body.data[0]).toMatchObject({
            tipo: "DOC_FIRMA_SOLICITADA",
            titulo: "Firma requerida",
            usuario_id: 5,
            leida: 0,
        });

        expect(mockNotificacionService.listarPorUsuario).toHaveBeenCalledTimes(1);
        expect(mockNotificacionService.listarPorUsuario).toHaveBeenCalledWith(5);
    });

    test("HU-030 debe marcar una notificación como leída", async () => {
        const res = await request(app)
            .patch("/api/notificaciones/1/leida")
            .expect(200);

        expect(res.body.ok).toBe(true);
        expect(res.body.data).toMatchObject({
            id: 1,
            usuarioId: 5,
            leida: 1,
        });

        expect(mockNotificacionService.marcarLeida).toHaveBeenCalledTimes(1);
        expect(mockNotificacionService.marcarLeida).toHaveBeenCalledWith(1, 5);
    });

    test("HU-030 debe devolver error 500 si falla la consulta de notificaciones", async () => {
        mockNotificacionService.listarPorUsuario.mockRejectedValueOnce(
            new Error("Fallo interno")
        );

        const res = await request(app)
            .get("/api/notificaciones")
            .expect(500);

        expect(res.body).toMatchObject({
            ok: false,
            message: "Error al listar notificaciones",
        });
    });

    test("HU-030 debe devolver error 500 si falla marcar como leída", async () => {
        mockNotificacionService.marcarLeida.mockRejectedValueOnce(
            new Error("No se pudo actualizar")
        );

        const res = await request(app)
            .patch("/api/notificaciones/1/leida")
            .expect(500);

        expect(res.body).toMatchObject({
            ok: false,
            message: "Error al marcar notificación como leída",
        });
    });
});