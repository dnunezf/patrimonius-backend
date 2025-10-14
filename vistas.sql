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
/* Regla 1: el creador siempre puede ver */
SELECT DISTINCT
  cu.id              AS viewer_usuario_id,
  d.id               AS documento_id,
  d.numero_serie,
  d.titulo,
  d.estado,
  d.fecha            AS fecha_creacion,
  d.unidad_id,
  un.nombre          AS unidad_nombre,
  d.usuario_id       AS creador_id,
  cu.nombre          AS creador_nombre,
  c.nombre           AS categoria_nombre,
  d.numero_firmas    AS firmas_requeridas,
  d.firmas_obtenidas
FROM Documento d
JOIN Unidad_Organizacional un ON un.id = d.unidad_id
LEFT JOIN Categoria c          ON c.id  = d.categoria_id
JOIN Usuario cu                ON cu.id = d.usuario_id
WHERE d.estado IN ('CREACION','EDICION','FIRMA_PARCIAL')
UNION
/* Regla 2: usuarios de la misma unidad organizacional */
SELECT DISTINCT
  u.id               AS viewer_usuario_id,
  d.id               AS documento_id,
  d.numero_serie,
  d.titulo,
  d.estado,
  d.fecha            AS fecha_creacion,
  d.unidad_id,
  un.nombre          AS unidad_nombre,
  d.usuario_id       AS creador_id,
  cu.nombre          AS creador_nombre,
  c.nombre           AS categoria_nombre,
  d.numero_firmas    AS firmas_requeridas,
  d.firmas_obtenidas
FROM Documento d
JOIN Unidad_Organizacional un ON un.id      = d.unidad_id
LEFT JOIN Categoria c          ON c.id       = d.categoria_id
JOIN Usuario cu                ON cu.id      = d.usuario_id
JOIN Usuario u                 ON u.unidad_id = d.unidad_id
WHERE d.estado IN ('CREACION','EDICION','FIRMA_PARCIAL')
UNION
/* Regla 3: permiso explícito EDIT o SIGN (sin importar la unidad) */
SELECT DISTINCT
  pu.usuario_id      AS viewer_usuario_id,
  d.id               AS documento_id,
  d.numero_serie,
  d.titulo,
  d.estado,
  d.fecha            AS fecha_creacion,
  d.unidad_id,
  un.nombre          AS unidad_nombre,
  d.usuario_id       AS creador_id,
  cu.nombre          AS creador_nombre,
  c.nombre           AS categoria_nombre,
  d.numero_firmas    AS firmas_requeridas,
  d.firmas_obtenidas
FROM Permiso_Usuario pu
JOIN Documento d              ON d.id        = pu.documento_id
JOIN Unidad_Organizacional un ON un.id       = d.unidad_id
LEFT JOIN Categoria c         ON c.id        = d.categoria_id
JOIN Usuario cu               ON cu.id       = d.usuario_id
JOIN Usuario u                ON u.id        = pu.usuario_id
JOIN Rol r                    ON r.id        = u.rol_id
WHERE pu.permiso IN ('EDIT','SIGN')
  AND d.estado IN ('CREACION','EDICION','FIRMA_PARCIAL');

SELECT *
FROM VW_Vista_Documentos
WHERE viewer_usuario_id = 17;

CREATE OR REPLACE VIEW VW_Documentos_Accesibles AS
SELECT DISTINCT
    u.id             AS viewer_usuario_id,
    d.id             AS documento_id,
    d.numero_serie,
    d.titulo,
    d.estado,
    d.fecha          AS fecha_creacion,
    d.unidad_id,
    un.nombre        AS unidad_nombre,
    d.usuario_id     AS creador_id,
    cu.nombre        AS creador_nombre,
    c.nombre         AS categoria_nombre,
    d.numero_firmas  AS firmas_requeridas,
    d.firmas_obtenidas
FROM Documento d
         JOIN Unidad_Organizacional un ON un.id = d.unidad_id
         JOIN Usuario cu ON cu.id = d.usuario_id
         LEFT JOIN Categoria c ON c.id = d.categoria_id
         JOIN Usuario u
              ON  u.id = d.usuario_id
                  OR u.unidad_id = d.unidad_id
WHERE d.estado IN ('CREACION','EDICION','FIRMA_PARCIAL');



-- Triggers --
DELIMITER $$

CREATE TRIGGER trg_insert_permission
    AFTER INSERT ON Permiso_Usuario
    FOR EACH ROW
BEGIN
    DECLARE Vaccion VARCHAR(150);
  DECLARE Vresultado VARCHAR(150);

  -- Definir la acción a registrar (puede ser 'Insertado' u otro mensaje según sea necesario)
  SET Vaccion = 'Asignación de permiso';
  SET Vresultado = CONCAT('Permiso ', NEW.permiso, ' asignado al usuario con ID ', NEW.usuario_id, ' para el documento con ID ', NEW.documento_id);

  -- Insertar el registro en la bitácora
    INSERT INTO Bitacora_Permisos (fecha, accion, resultado, usuario_id, documento_id, permiso)
    VALUES (NOW(), Vaccion, Vresultado, NEW.usuario_id, NEW.documento_id, NEW.permiso);
    END$$

    DELIMITER ;
