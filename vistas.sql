
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

-- =========================
-- Vistas Bitacora_Ciclo_Documental_Detalle
-- =========================
CREATE OR REPLACE VIEW VW_Bitacora_Ciclo_Documental_Detalle AS
SELECT
    b.id AS id_evento,
    b.fecha AS fecha_evento,
    b.accion AS accion,
    b.resultado AS resultado,
    u.email AS usuario_email,
    CONCAT_WS(' ', u.nombre, u.apellido1, NULLIF(TRIM(u.apellido2), '')) AS usuario_nombre_completo,
    d.titulo AS documento_titulo_actual,
    d.estado AS documento_estado_actual,
    d.numero_serie AS documento_nombre_actual,
    COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_titulo')),
            d.titulo
    ) AS documento_titulo,
    COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_codigo_unico')),
            d.numero_serie
    ) AS documento_nombre,
    COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_estado')),
            d.estado
    ) AS documento_estado,
    c.evento AS evento_ciclo,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.accion_solicitada')) AS accion_solicitada,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.motivo')) AS motivo,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.descripcion')) AS descripcion,
    c.detalle AS detalle_json
FROM Bitacora_Base b
         JOIN Bitacora_Ciclo_Documental c ON b.id = c.id
         JOIN Usuario u ON b.usuario_id = u.id
         JOIN Rol r ON u.rol_id = r.id
         LEFT JOIN Documento d ON b.documento_id = d.id;


-- =========================
-- Vistas Bitacora_Permisos
-- =========================

CREATE OR REPLACE VIEW VW_Bitacora_Seguridad_Lista AS
SELECT
    b.id           AS id_evento,
    b.fecha        AS fecha_hora,
    u.email        AS usuario,
    b.accion       AS accion,          -- aquí va el tipo (LOGIN, AUTENTICACION, etc.)
    b.resultado    AS resultado,
    s.tipo_evento  AS tipo_evento,     -- enum Bitacora_Seguridad
    s.ip           AS ip,
    s.user_agent   AS user_agent
FROM Bitacora_Base b
         JOIN Bitacora_Seguridad s ON s.id = b.id
         LEFT JOIN Usuario u ON u.id = b.usuario_id;


-- =========================
-- Vistas VW_Bitacora_Seguridad_Detalle
-- =========================

CREATE OR REPLACE VIEW VW_Bitacora_Seguridad_Detalle AS
SELECT
    b.id AS id_evento,
    b.fecha AS fecha_evento,
    b.accion AS accion,
    b.resultado AS resultado,
    b.usuario_id,
    u.email AS usuario_email,
    CONCAT_WS(' ', u.nombre, u.apellido1, NULLIF(TRIM(u.apellido2), '')) AS usuario_nombre_completo,
    s.ip,
    s.user_agent,
    s.detalle AS detalle_json

FROM Bitacora_Base b
         JOIN Bitacora_Seguridad s ON s.id = b.id
         LEFT JOIN Usuario u ON u.id = b.usuario_id
         LEFT JOIN Rol r ON r.id = u.rol_id;


-- =========================
-- Vistas Bitacora_Permisos
-- =========================
CREATE OR REPLACE VIEW VW_Bitacora_Permisos_Lista AS
SELECT
    bp.id AS id_registro,
    bp.fecha AS fecha_hora,
    bp.solicitud_id,
    COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(bp.detalle, '$.documento_titulo')),
            d.titulo
    ) AS titulo_documento,
    COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(bp.detalle, '$.documento_codigo_unico')),
            d.numero_serie
    ) AS numero_serie_documento,
    COALESCE(bp.responsable_id, bp.usuario_id) AS responsable_id,
    ur.email AS responsable_email,
    ut.email AS usuario_objetivo_email,
    bp.tipo_flujo,
    bp.estado_flujo,
    bp.accion,
    bp.fecha_inicio_acceso,
    bp.fecha_fin_acceso
FROM Bitacora_Permisos bp
         LEFT JOIN Usuario ur ON ur.id = COALESCE(bp.responsable_id, bp.usuario_id)
         LEFT JOIN Usuario ut ON ut.id = bp.target_usuario_id
         LEFT JOIN Documento d ON d.id = bp.documento_id;


-- =========================
-- Vistas Bitacora_Permisos_Detalle
-- =========================

CREATE OR REPLACE VIEW VW_Bitacora_Permisos_Detalle AS
SELECT
    bp.id AS id_registro,
    bp.solicitud_id,
    bp.documento_id,
    d.titulo AS documento_titulo_actual,
    COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(bp.detalle, '$.documento_titulo')),
            d.titulo
    ) AS documento_titulo_snapshot,
    d.numero_serie AS documento_numero_serie_actual,
    COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(bp.detalle, '$.documento_codigo_unico')),
            d.numero_serie
    ) AS documento_codigo_snapshot,
    bp.responsable_id,
    ur.email AS responsable_email,
    CONCAT_WS(' ', ur.nombre, ur.apellido1, NULLIF(TRIM(ur.apellido2), '')) AS responsable_nombre_completo,
    bp.target_usuario_id,
    ut.email AS usuario_objetivo_email,
    CONCAT_WS(' ', ut.nombre, ut.apellido1, NULLIF(TRIM(ut.apellido2), '')) AS usuario_objetivo_nombre_completo,
    bp.accion,
    bp.resultado,
    bp.permiso AS permisos,

    bp.tipo_flujo,
    bp.estado_flujo,
    bp.justificacion,
    bp.fecha_inicio_acceso,
    bp.fecha_fin_acceso,
    bp.user_agent,
    bp.detalle
FROM Bitacora_Permisos bp
         LEFT JOIN Usuario ur ON ur.id = COALESCE(bp.responsable_id, bp.usuario_id)
         LEFT JOIN Usuario ut ON ut.id = bp.target_usuario_id
         LEFT JOIN Documento d ON d.id = bp.documento_id;