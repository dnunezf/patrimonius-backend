-- =============================================================================
-- Limpieza + códigos mínimos para FK Ingreso_Conservacion → Clasificacion_Archivistica
-- Ejecutar en STAGING primero; luego en PRODUCCIÓN en ventana controlada.
-- =============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- 1) Quitar filas inválidas (codigo NULL o vacío). No deberían existir; rompen listados y la PK.
--    Si algún hijo referenciara (no aplica a NULL en FK normalmente), este DELETE fallará y habrá que investigar.
DELETE FROM Clasificacion_Archivistica
WHERE codigo IS NULL
   OR TRIM(IFNULL(codigo, '')) = '';

-- 2) Asegurar códigos que el front puede enviar por Serie/Subserie/Expediente (ej. '123').
--    ON DUPLICATE KEY UPDATE solo refresca etiqueta si ya existía.
INSERT INTO Clasificacion_Archivistica (codigo, etiqueta, descripcion, activa)
VALUES (
  '123',
  'Código operativo de catálogo (serie/subserie/expediente)',
  'Fila técnica para cumplir FK cuando el flujo usa el código numérico de serie/expediente, distinto del esquema jerárquico 1.1.xx.',
  1
)
ON DUPLICATE KEY UPDATE
  etiqueta = VALUES(etiqueta),
  descripcion = VALUES(descripcion),
  activa = VALUES(activa);

-- 3) (Opcional) Semilla jerárquica si en algún entorno faltara el ejemplo institucional
INSERT INTO Clasificacion_Archivistica (codigo, etiqueta, descripcion, activa)
VALUES (
  '1.1.01',
  'Serie 1 — Actas',
  'Clasificación archivística institucional para actas.',
  1
)
ON DUPLICATE KEY UPDATE
  etiqueta = VALUES(etiqueta),
  descripcion = VALUES(descripcion),
  activa = VALUES(activa);

COMMIT;

-- Verificación
SELECT codigo, etiqueta, activa FROM Clasificacion_Archivistica ORDER BY codigo;
