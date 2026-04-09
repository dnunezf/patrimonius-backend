-- =============================================================================
-- Patrimonius — datos de prueba para HU-025 (consulta de documentos archivados)
-- =============================================================================
-- Prerrequisitos:
--   • Esquema aplicado (tablas Documento, Permiso_Usuario, Version_Documento, …).
--   • Al menos un Usuario interno con unidad_id = 1 (p. ej. usuario de prueba).
--   • Tabla Expediente creada (JOIN en consulta usa Expediente con mayúscula).
--
-- Requiere: sql/migrate_documento_estado_aprobado.sql (valor ENUM APROBADO) si la BD aún no lo tiene.
--
-- Qué crea:
--   • 2 documentos, unidad_id = 1
--       - HU025-DEMO-PUBLIC  → estado APROBADO, PUBLIC (visible a externo con permiso VIEW)
--       - HU025-DEMO-INTERNAL → estado ARCHIVADO, INTERNAL (solo internos misma unidad)
--   • 1 fila en Version_Documento por documento (para fecha_aprobacion en listado)
--   • 1 Permiso_Usuario VIEW para el usuario EXTERNO sobre el documento PUBLIC
--
-- Ajuste el correo del externo en @EMAIL_EXTERNO si no usa el de prueba.
-- Ejecutar en la BD (p. ej. bd_patrimonius):
--   mysql -u ... -p bd_patrimonius < sql/seed_hu025_consulta_prueba.sql
-- =============================================================================

USE bd_patrimonius;

-- Evita error 1267 (Illegal mix of collations) entre literales/variables y columnas utf8mb4_unicode_ci
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @EMAIL_EXTERNO = 'alexia.alvarado18@gmail.com';
-- Si su usuario externo es otro (ej. alexia...), cambie arriba.

SET @UNIDAD_PRUEBA = 1;
SET @uid_creador = (SELECT COALESCE(MIN(u.id), 1) FROM Usuario u);
SET @cat_id = (SELECT id FROM Categoria ORDER BY id LIMIT 1);

-- Opcional: categoría dedicada (si no hay categorías, @cat_id puede ser NULL y es válido)
INSERT INTO Categoria (nombre, descripcion)
SELECT 'HU025 — Prueba consulta', 'Documentos de prueba consulta general'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Categoria c WHERE c.nombre = 'HU025 — Prueba consulta');

SET @cat_id = COALESCE(
  (SELECT id FROM Categoria WHERE nombre = 'HU025 — Prueba consulta' LIMIT 1),
  @cat_id
);

-- ---------------------------------------------------------------------------
-- Documento 1: PUBLIC + ARCHIVADO (visible a internos unidad 1 por regla PUBLIC/INTERNAL)
-- ---------------------------------------------------------------------------
INSERT INTO Documento (
  numero_serie,
  titulo,
  contenido,
  estado,
  fecha,
  firmas_obtenidas,
  numero_firmas,
  confid_level,
  unidad_id,
  usuario_id,
  categoria_id
)
SELECT
  'HU025-DEMO-PUBLIC',
  'Documento demo — confidencialidad PUBLIC (archivado)',
  '<p>Prueba <strong>HU-025</strong>. Este documento es <strong>ARCHIVADO</strong>, nivel <strong>PUBLIC</strong>, unidad 1.</p>',
  'ARCHIVADO',
  NOW(),
  1,
  1,
  'PUBLIC',
  @UNIDAD_PRUEBA,
  @uid_creador,
  @cat_id
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Documento d WHERE d.numero_serie = 'HU025-DEMO-PUBLIC');

-- ---------------------------------------------------------------------------
-- Documento 2: INTERNAL + ARCHIVADO (visible solo a internos de la misma unidad)
-- ---------------------------------------------------------------------------
INSERT INTO Documento (
  numero_serie,
  titulo,
  contenido,
  estado,
  fecha,
  firmas_obtenidas,
  numero_firmas,
  confid_level,
  unidad_id,
  usuario_id,
  categoria_id
)
SELECT
  'HU025-DEMO-INTERNAL',
  'Documento demo — confidencialidad INTERNAL (archivado)',
  '<p>Prueba <strong>HU-025</strong>. Este documento es <strong>ARCHIVADO</strong>, nivel <strong>INTERNAL</strong>, unidad 1.</p><p>Solo usuarios internos de la <strong>misma unidad organizacional</strong> lo ven sin lista explícita.</p>',
  'ARCHIVADO',
  NOW(),
  1,
  1,
  'INTERNAL',
  @UNIDAD_PRUEBA,
  @uid_creador,
  @cat_id
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Documento d WHERE d.numero_serie = 'HU025-DEMO-INTERNAL');

-- Si ya existían filas de una corrida anterior con PUBLIC en ARCHIVADO, normalizar a APROBADO:
UPDATE Documento SET estado = 'APROBADO' WHERE numero_serie = 'HU025-DEMO-PUBLIC';

-- Versiones (aparecen en fecha de “aprobación” del listado)
INSERT INTO Version_Documento (fecha, contenido, documento_id, nombre_versionado)
SELECT NOW(), '<p>Versión archivada de prueba</p>', d.id, 'v1-archivo-demo'
FROM Documento d
WHERE d.numero_serie = 'HU025-DEMO-PUBLIC'
  AND NOT EXISTS (
    SELECT 1 FROM Version_Documento v WHERE v.documento_id = d.id
  );

INSERT INTO Version_Documento (fecha, contenido, documento_id, nombre_versionado)
SELECT NOW(), '<p>Versión archivada de prueba</p>', d.id, 'v1-archivo-demo'
FROM Documento d
WHERE d.numero_serie = 'HU025-DEMO-INTERNAL'
  AND NOT EXISTS (
    SELECT 1 FROM Version_Documento v WHERE v.documento_id = d.id
  );

-- ---------------------------------------------------------------------------
-- Usuario EXTERNO: simular HU-023 / permiso explícito solo sobre el documento PUBLIC
-- (el INTERNAL no lleva Permiso_Usuario → el externo no debe verlo)
-- ---------------------------------------------------------------------------
INSERT INTO Permiso_Usuario (usuario_id, documento_id, permiso, motive)
SELECT u.id, d.id, 'VIEW', 'Seed prueba HU-025 — acceso externo simulado'
FROM Usuario u
CROSS JOIN Documento d
WHERE (u.email COLLATE utf8mb4_unicode_ci) = (@EMAIL_EXTERNO COLLATE utf8mb4_unicode_ci)
  AND (d.numero_serie COLLATE utf8mb4_unicode_ci) = ('HU025-DEMO-PUBLIC' COLLATE utf8mb4_unicode_ci)
  AND NOT EXISTS (
    SELECT 1
    FROM Permiso_Usuario pu
    WHERE pu.usuario_id = u.id
      AND pu.documento_id = d.id
      AND pu.permiso = 'VIEW'
  );

-- Verificación rápida (opcional: comentar si molesta en consola)
SELECT 'Documentos HU025' AS tipo, id, numero_serie, titulo, estado, confid_level, unidad_id
FROM Documento
WHERE numero_serie IN ('HU025-DEMO-PUBLIC', 'HU025-DEMO-INTERNAL');

SELECT 'Permiso externo' AS tipo, pu.*
FROM Permiso_Usuario pu
JOIN Documento d ON d.id = pu.documento_id
JOIN Usuario u ON u.id = pu.usuario_id
WHERE (d.numero_serie COLLATE utf8mb4_unicode_ci) = ('HU025-DEMO-PUBLIC' COLLATE utf8mb4_unicode_ci)
  AND (u.email COLLATE utf8mb4_unicode_ci) = (@EMAIL_EXTERNO COLLATE utf8mb4_unicode_ci);
