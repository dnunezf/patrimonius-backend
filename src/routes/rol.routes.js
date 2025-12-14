// src/routes/rol.routes.js
import { Router } from 'express';
import { catalogoRolesRepo } from '../repositories/catalogoRolesRepo.js';
import { adminGuard } from '../middleware/adminGuard.js';

const router = Router();

// Protegemos estas rutas (igual que otros catálogos)
router.use(adminGuard);

/** Listar roles */
router.get('/roles', async (_req, res) => {
    try {
        const roles = await catalogoRolesRepo.findAll();
        res.json(roles); // [{ id, nombre, descripcion }, ...]
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'internal_error', message: 'Error fetching roles' });
    }
});

/** Crear rol */
router.post('/roles', async (req, res) => {
    try {
        const { nombre, descripcion } = req.body ?? {};
        if (!nombre?.trim()) return res.status(400).json({ error: 'bad_request', message: 'El nombre es obligatorio' });

        const created = await catalogoRolesRepo.create({ nombre: nombre.trim(), descripcion: descripcion ?? null });
        res.status(201).json(created); // { id, nombre, descripcion }
    } catch (error) {
        const code = error?.code === 409 ? 409 : 500;
        res.status(code).json({ error: 'internal_error', message: error.message });
    }
});

/** Actualizar (PATCH) */
router.patch('/roles/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_request', message: 'ID inválido' });

        const updated = await catalogoRolesRepo.update(id, {
            nombre: req.body?.nombre,
            descripcion: req.body?.descripcion
        });
        if (!updated) return res.status(404).json({ error: 'not_found' });

        res.json(updated); // { id, nombre, descripcion }
    } catch (error) {
        res.status(500).json({ error: 'internal_error', message: error.message });
    }
});

/** Eliminar */
router.delete('/roles/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_request', message: 'ID inválido' });

        const ok = await catalogoRolesRepo.remove(id);
        if (!ok) return res.status(404).json({ error: 'not_found' });

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'internal_error', message: error.message });
    }
});

export default router;
