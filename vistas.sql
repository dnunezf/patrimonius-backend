
CREATE OR REPLACE VIEW VW_Bitacora_Ciclo_Documental_Lista AS
SELECT
    b.id  AS id_evento,                          
    b.fecha AS fecha_hora,                       
    u.email AS usuario,                          
    COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_titulo')),
      d.titulo
    ) AS documento_titulo,
    COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_codigo_unico')),
      d.numero_serie
    ) AS documento_codigo_unico,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.accion_solicitada')) AS accion_solicitada, 
    COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_estado')),
      d.estado
    ) AS estado_documento,
    b.resultado AS resultado,                    
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.motivo')) AS razon   
FROM Bitacora_Base b
JOIN Bitacora_Ciclo_Documental c ON c.id = b.id
JOIN Usuario u  ON u.id = b.usuario_id
LEFT JOIN Documento d ON d.id = b.documento_id;



-- ============================================================
-- Vista simple (solo snapshot, sin COALESCE). Para el Servidor 
-- Ideal si querés que la app muestre únicamente el código único
-- y no dependa del estado/código actual del documento.
-- Nota: para eventos viejos (sin $.snapshot) puede devolver NULL.

-- ============================================================
CREATE OR REPLACE VIEW VW_Bitacora_Ciclo_Documental_Lista AS
SELECT
    b.id AS id_evento,
    b.fecha AS fecha_hora,
    u.email AS usuario,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_titulo')) AS documento_titulo,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_codigo_unico')) AS documento_codigo_unico,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_estado')) AS estado_documento,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.accion_solicitada')) AS accion_solicitada,
    b.resultado AS resultado,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.motivo')) AS razon,
    c.evento AS evento_ciclo
FROM Bitacora_Base b
JOIN Bitacora_Ciclo_Documental c ON c.id = b.id
JOIN Usuario u ON u.id = b.usuario_id;