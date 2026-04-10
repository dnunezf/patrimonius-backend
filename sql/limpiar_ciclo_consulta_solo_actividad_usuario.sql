-- Opcional: quitar de Bitacora_Ciclo_Documental filas de consulta aprobados que deben vivir
-- solo en Bitacora_Actividad_Usuario (misma id que Bitacora_Base).
-- Ejecutar una vez si ya existían registros con estos accion_solicitada en detalle JSON.

DELETE c
FROM Bitacora_Ciclo_Documental c
WHERE c.evento = 'CONSULTA'
  AND (
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.accion_solicitada')) = 'BUSQUEDA_CATALOGO_APROBADOS_EXTERNO'
    OR JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.accion_solicitada')) = 'DESCARGA_PDF_CONSULTA_INTERNO'
    OR JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.accion_solicitada')) = 'DESCARGA_PDF_CONSULTA_EXTERNO'
  );
