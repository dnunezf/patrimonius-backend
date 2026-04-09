-- Verificación rápida antes de ingreso a conservación (FK_IC_Classification).
-- El error "FK_IC_Classification" indica que classification_code no existe en Clasificacion_Archivistica.

-- 1) Códigos de catálogo archivístico (debe existir el codigo que use el flujo)
SELECT codigo, etiqueta, activa FROM Clasificacion_Archivistica ORDER BY codigo;

-- 2) ¿Existe el código concreto que envía la UI? (sustituya :code)
-- SELECT * FROM Clasificacion_Archivistica WHERE codigo = '123';
-- SELECT * FROM Clasificacion_Archivistica WHERE codigo = '1.1.01';

-- 3) Unidad, serie, subserie, expediente (FKs del expediente / selección)
SELECT id, nombre FROM Unidad_Organizacional WHERE id = 1;
SELECT id, codigo, nombre FROM Serie WHERE id = 1;
SELECT id, codigo, nombre, serie_id FROM Subserie WHERE id = 1;
SELECT id, codigo, nombre, serie_id, subserie_id FROM Expediente WHERE id = 1;

-- 4) Usuario creador
SELECT id, nombre, email FROM Usuario WHERE id IN (1, 9);

-- 5) Último ingreso (si ya hay datos)
-- SELECT id, documento_id, official_code, classification_code FROM Ingreso_Conservacion ORDER BY id DESC LIMIT 5;
