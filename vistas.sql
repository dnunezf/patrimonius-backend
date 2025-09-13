CREATE OR REPLACE VIEW VW_Bitacora_Ciclo_Documental_Detalle AS
SELECT 
    b.id                        AS id_evento,
    b.fecha                     AS fecha_evento,
    b.accion                    AS accion,
    b.resultado                 AS resultado,
    u.email                     AS usuario_email,
    u.nombre                    AS usuario_nombre,
    u.apellido1                 AS usuario_apellido1,
    u.apellido2                 AS usuario_apellido2,
    r.nombre                    AS rol_usuario,
    d.titulo                    AS documento_titulo,
    d.numero_serie              AS documento_codigo,
    d.estado                    AS documento_estado,
    c.evento                    AS evento_ciclo,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.accion_solicitada')) AS accion_solicitada,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.motivo'))            AS motivo,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.descripcion'))       AS descripcion
FROM Bitacora_Base b
JOIN Bitacora_Ciclo_Documental c ON b.id = c.id
JOIN Usuario u  ON b.usuario_id = u.id
JOIN Rol r      ON u.rol_id = r.id
LEFT JOIN Documento d ON b.documento_id = d.id;


--
CREATE OR REPLACE VIEW VW_Bitacora_Ciclo_Documental_Lista AS
SELECT
    b.id  AS id_evento,                          
    b.fecha AS fecha_hora,                       
    u.email AS usuario,                          
    d.titulo AS documento_titulo,               
    d.numero_serie AS documento_codigo_unico,   
    (
      SELECT m.valor
      FROM Metadato m
      WHERE m.documento_id = d.id
        AND m.tipo = 'CODIGO_OFICIAL'
      LIMIT 1
    ) AS documento_codigo_oficial,               
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.accion_solicitada')) AS accion_solicitada, 
    d.estado AS estado_documento,
    b.resultado AS resultado,                    
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.motivo')) AS razon   -- Razón
FROM Bitacora_Base b
JOIN Bitacora_Ciclo_Documental c ON c.id = b.id
JOIN Usuario u  ON u.id = b.usuario_id
LEFT JOIN Documento d ON d.id = b.documento_id;


CREATE OR REPLACE VIEW VW_Vista_Documentos AS
SELECT
    d.titulo AS documento_nombre,
    d.estado AS documento_estado,
    u.nombre AS primer_usuario,
    d.fecha AS fecha_creacion,
    un.nombre AS unidad_nombre,
    c.nombre AS categoria_nombre,
    d.numero_firmas AS firmas_requeridas,
    d.firmas_obtenidas AS firmas_obtenidas
FROM
    Documento d
        JOIN
    Usuario u ON d.usuario_id = u.id
        JOIN
    Unidad_Organizacional un ON d.unidad_id = un.id
        LEFT JOIN
    Categoria c ON d.categoria_id = c.id
WHERE
    d.estado IN ('CREACION', 'EDICION', 'FIRMA_PARCIAL');
