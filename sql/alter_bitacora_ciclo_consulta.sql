-- HU-025 / HU-027: registrar consulta (búsqueda, vista previa, descarga) en Bitacora_Ciclo_Documental.
-- Ejecutar una vez en bases ya desplegadas antes de usar el backend actualizado.

ALTER TABLE Bitacora_Ciclo_Documental
  MODIFY COLUMN evento ENUM(
    'CREACION',
    'EDICION',
    'FIRMA',
    'FIRMA_PARCIAL',
    'ARCHIVADO',
    'ELIMINACION',
    'TRANSFERENCIA',
    'CONSERVACION',
    'CONSULTA'
  ) NOT NULL;
