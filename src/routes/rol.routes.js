// src/routes/rol.routes.js
import { Router } from 'express';
import { rolService } from '../services/rolService.js';

const router = Router();

/** Endpoint to get all roles */
router.get('/rol', async (req, res) => {
    try {
        const roles = await rolService.getAllRoles();
        res.json(roles);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching roles' });
    }
});

export default router;
