//src/routes/audit.routes.js
import { Router } from 'express';
import {
    listarEventosAuditoria, listAllPossibleDocumentStates, getAuditEventDetailById,
    listAllPossibleBitacoraEventStates, listarEventosSeguridad ,getSecurityEventDetailById, listAllPossibleSecurityEventTypes, listAllPossibleSecurityActions,
    listarEventosBitacoraPermisos, getBitacoraPermisoDetailById,
    listAllPossiblePermissionBitacoraTipoFlujo, listAllPossiblePermissionBitacoraEstadoFlujo,
} from '../services/audit.service.js';
import { parse } from 'json2csv'; // Import json2csv to convert JSON to CSV
import js2xmlparser from 'js2xmlparser'; // Import js2xmlparser to convert JSON to XML

const router = Router();

// GET endpoint to list audit events with filters (pagination applied)
router.get('/events', async (req, res) => {
    try {
        const {
            page = '1', // Default page number
            pageSize = '25', // Default page size
            q, // Search query
            estado, // Filter by document status
            resultado, // Filter by result
            usuario, // Filter by user
            documento, // Filter by document
            sortBy = 'fecha_hora', // Default sort by 'fecha_hora'
            sortDir = 'desc' // Default sort direction (descending)
        } = req.query;

        // Set of allowed fields for sorting
        const ALLOWED_SORT = new Set([
            'fecha_hora', 'usuario', 'documento_titulo', 'documento_codigo_unico',
            'estado_documento', 'resultado', 'accion_solicitada'
        ]);

        // Check if sortBy is in the allowed set, otherwise default to 'fecha_hora'
        const sortCol = ALLOWED_SORT.has(String(sortBy)) ? String(sortBy) : 'fecha_hora';

        // Ensure sortDir is either 'ASC' or 'DESC'
        const sortDirection = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const pageNum = Math.max(parseInt(page, 10) || 1, 1); // Validate the page number
        const sizeNum = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100); // Validate the page size (max 100)

        // Fetch audit events from the service with filters and pagination
        const result = await listarEventosAuditoria({
            page: pageNum,
            pageSize: sizeNum,
            q,
            estado,
            resultado,
            usuario,
            documento,
            sortBy: sortCol,
            sortDir: sortDirection
        });

        // Return the result as JSON response
        res.json(result);
    } catch (err) {
        // Handle any errors during the process
        console.error('GET /audit/events error:', err);
        res.status(500).json({ message: 'Error al listar eventos de auditoría' }); // Send error response
    }
});

// GET endpoint to export audit events as a CSV file
router.get('/events/csv', async (req, res) => {
    try {
        const {
            q,
            estado,
            resultado,
            usuario,
            documento,
            sortBy = 'fecha_hora',
            sortDir = 'desc'
        } = req.query;

        // Fetch all audit events without pagination (set a large page size)
        const result = await listarEventosAuditoria({
            page: 1, // Page 1 to fetch all data
            pageSize: 10000, // A large page size to bring all events
            q,
            estado,
            resultado,
            usuario,
            documento,
            sortBy,
            sortDir
        });

        // Check if there are no items to export
        if (!result.items || result.items.length === 0) {
            return res.status(404).json({ message: 'No hay datos disponibles para exportar.' }); // No data found
        }

        // Define the fields to export in the CSV (you can adjust these based on your needs)
        const fields = [
            'id_evento', 'fecha_hora', 'usuario', 'documento_titulo',
            'documento_codigo_unico',
            'accion_solicitada', 'estado_documento', 'resultado', 'razon'
        ];

        // Convert the result items to CSV format using json2csv
        const csv = parse(result.items, { fields });

        const filename = 'eventos_auditoria.csv'; // CSV file name
        res.header('Content-Type', 'text/csv'); // Set the correct content type for CSV
        res.header('Content-Disposition', `attachment; filename=${filename}`); // Set the content disposition to download the file

        res.send(csv); // Send the CSV file as the response
    } catch (err) {
        // Handle any errors during the CSV generation
        console.error('GET /audit/events/csv error:', err);
        res.status(500).json({ message: 'Error al generar el archivo CSV' }); // Send error response
    }
});

// GET endpoint to export audit events as an XML file
router.get('/events/xml', async (req, res) => {
    try {
        const {
            q,
            estado,
            resultado,
            usuario,
            documento,
            sortBy = 'fecha_hora',
            sortDir = 'desc'
        } = req.query;

        // Fetch all audit events without pagination (set a large page size)
        const result = await listarEventosAuditoria({
            page: 1, // Page 1 to fetch all data
            pageSize: 10000, // A large page size to bring all events
            q,
            estado,
            resultado,
            usuario,
            documento,
            sortBy,
            sortDir
        });

        // Check if there are no items to export
        if (!result.items || result.items.length === 0) {
            return res.status(404).json({ message: 'No hay datos disponibles para exportar.' }); // No data found
        }

        // Convert the result items to XML using js2xmlparser
        const xml = js2xmlparser.parse("eventos", { evento: result.items });

        const filename = 'eventos_auditoria.xml'; // XML file name
        res.header('Content-Type', 'application/xml'); // Set the correct content type for XML
        res.header('Content-Disposition', `attachment; filename=${filename}`); // Set the content disposition to download the file

        res.send(xml); // Send the XML file as the response
    } catch (err) {
        // Handle any errors during the XML generation
        console.error('GET /audit/events/xml error:', err);
        res.status(500).json({ message: 'Error al generar el archivo XML' }); // Send error response
    }




});


/**
 * GET /documents/states
 * Returns all distinct states from Documento.
 */
router.get('/documents/states', async (_req, res) => {
    console.log('GET /documents/states received');
    try {
        const states = await listAllPossibleDocumentStates();
        return res.json({ items: states, totalItems: states.length });
    } catch (err) {
        return res.status(500).json({ message: 'Failed to retrieve document states' });
    }
});

/**
 * GET /log/events
 * Returns all distinct event states from Bitacora_Ciclo_Documental.
 */
router.get('/log/events', async (_req, res) => {
    console.log('GET /bitacora/events received');
    try {
        const eventStates = await listAllPossibleBitacoraEventStates();
        return res.json({ items: eventStates, totalItems: eventStates.length });
    } catch (err) {
        return res.status(500).json({ message: 'Failed to retrieve event states from Bitacora_Ciclo_Documental' });
    }
});


/**
 * GET /audit/events/:id
 * Returns a single audit event detail from the view VW_Bitacora_Ciclo_Documental_Detalle.
 */
router.get('/events/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: 'Invalid event id' });
        }

        const detail = await getAuditEventDetailById(id);
        if (!detail) {
            return res.status(404).json({ message: 'Event not found' });
        }
        return res.json({ item: detail });
    } catch (err) {
        console.error('GET /audit/events/:id error:', err);
        return res.status(500).json({ message: 'Failed to retrieve event detail' });
    }
});

// ✅ LISTA bitácora seguridad
router.get("/security/events", async (req, res) => {
    try {
        const {
            page = "1",
            pageSize = "25",
            q,
            usuario,
            tipoEvento,
            accion,
            resultado,
            sortBy = "fecha_hora",
            sortDir = "desc",
        } = req.query;

        const result = await listarEventosSeguridad({
            page: Number(page),
            pageSize: Number(pageSize),
            q,
            usuario,
            tipoEvento,
            accion,
            resultado,
            sortBy,
            sortDir,
        });

        return res.json(result);
    } catch (err) {
        console.error("GET /audit/security/events error:", err);
        return res.status(500).json({ message: "Error al listar eventos de seguridad" });
    }
});

// ✅ DETALLE bitácora seguridad
router.get("/security/events/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: "Invalid event id" });
        }

        const detail = await getSecurityEventDetailById(id);
        if (!detail) return res.status(404).json({ message: "Event not found" });

        return res.json({ item: detail });
    } catch (err) {
        console.error("GET /audit/security/events/:id error:", err);
        return res.status(500).json({ message: "Failed to retrieve security event detail" });
    }
});

// ✅ combos
router.get("/security/types", async (_req, res) => {
    try {
        const items = await listAllPossibleSecurityEventTypes();
        return res.json({ items, totalItems: items.length });
    } catch (err) {
        return res.status(500).json({ message: "Failed to retrieve security event types" });
    }
});

router.get("/security/actions", async (_req, res) => {
    try {
        const items = await listAllPossibleSecurityActions();
        return res.json({ items, totalItems: items.length });
    } catch (err) {
        return res.status(500).json({ message: "Failed to retrieve security actions" });
    }
});

// --- Bitácora Permisos (excepciones / VW_Bitacora_Permisos_*) — mismo patrón que security/events ---

router.get("/permission-bitacora/events", async (req, res) => {
    try {
        const {
            page = "1",
            pageSize = "25",
            q,
            tipoFlujo,
            estadoFlujo,
            accion,
            usuario,
            documento,
            from,
            to,
            sortBy = "fecha_hora",
            sortDir = "desc",
        } = req.query;

        const result = await listarEventosBitacoraPermisos({
            page: Number(page),
            pageSize: Number(pageSize),
            q,
            tipoFlujo,
            estadoFlujo,
            accion,
            usuario,
            documento,
            from,
            to,
            sortBy,
            sortDir,
        });

        return res.json(result);
    } catch (err) {
        console.error("GET /audit/permission-bitacora/events error:", err);
        return res.status(500).json({ message: "Error al listar bitácora de permisos" });
    }
});

router.get("/permission-bitacora/events/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: "Invalid id" });
        }

        const detail = await getBitacoraPermisoDetailById(id);
        if (!detail) return res.status(404).json({ message: "Registro no encontrado" });

        return res.json({ item: detail });
    } catch (err) {
        console.error("GET /audit/permission-bitacora/events/:id error:", err);
        return res.status(500).json({ message: "Error al obtener detalle de bitácora de permisos" });
    }
});

router.get("/permission-bitacora/tipo-flujo", async (_req, res) => {
    try {
        const items = await listAllPossiblePermissionBitacoraTipoFlujo();
        return res.json({ items, totalItems: items.length });
    } catch (err) {
        return res.status(500).json({ message: "Failed to retrieve tipo_flujo values" });
    }
});

router.get("/permission-bitacora/estado-flujo", async (_req, res) => {
    try {
        const items = await listAllPossiblePermissionBitacoraEstadoFlujo();
        return res.json({ items, totalItems: items.length });
    } catch (err) {
        return res.status(500).json({ message: "Failed to retrieve estado_flujo values" });
    }
});

export default router;