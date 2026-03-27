-- Añade estado APROBADO al ciclo de vida del documento (HU-025: consulta interna/externa).
-- Ejecutar una vez sobre la BD existente antes de usar consultas que filtren por APROBADO.
-- MySQL 8: la lista ENUM debe incluir todos los valores.

USE bd_patrimonius;

ALTER TABLE Documento
MODIFY COLUMN estado ENUM(
  'CREACION',
  'EDICION',
  'FIRMA',
  'FIRMA_PARCIAL',
  'APROBADO',
  'ARCHIVADO',
  'ELIMINACION',
  'TRANSFERENCIA'
) NOT NULL;
