-- Patrimonius – BD_PATRIMONIUS (unificado con nombres originales)

CREATE DATABASE IF NOT EXISTS BD_PATRIMONIUS
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE BD_PATRIMONIUS;


-- =========================
-- Tablas de mantenimiento
-- =========================
CREATE TABLE Rol (
  id INT AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  CONSTRAINT PK_Rol PRIMARY KEY (id),
  CONSTRAINT UQ_Rol_nombre UNIQUE (nombre)
) ENGINE=InnoDB;

CREATE TABLE Unidad_Organizacional (
  id INT AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT,
  CONSTRAINT PK_Unidad PRIMARY KEY (id),
  CONSTRAINT UQ_Unidad_nombre UNIQUE (nombre)
) ENGINE=InnoDB;

CREATE TABLE Categoria (
  id INT AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  CONSTRAINT PK_Categoria PRIMARY KEY (id),
  CONSTRAINT UQ_Categoria_nombre UNIQUE (nombre)
) ENGINE=InnoDB;

CREATE TABLE Catalogo (
  id INT AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  tipo VARCHAR(60) NOT NULL,
  descripcion TEXT,
  CONSTRAINT PK_Catalogo PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE Plantilla (
  id INT AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT,
  version VARCHAR(30) NOT NULL,
  ruta_archivo VARCHAR(255) NOT NULL,
  CONSTRAINT PK_Plantilla PRIMARY KEY (id),
  CONSTRAINT UQ_Plantilla_nombre_version UNIQUE (nombre, version)
) ENGINE=InnoDB;

CREATE TABLE Imagen (
  id INT AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  ruta_archivo VARCHAR(255) NOT NULL,
  tipo VARCHAR(50),
  CONSTRAINT PK_Imagen PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE Usuario (
  id INT AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL,
  apellido1 VARCHAR(120) NOT NULL,
  apellido2 VARCHAR(120),
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL DEFAULT 'changeme',
  mustChangePassword BOOLEAN NOT NULL DEFAULT TRUE,
  rol_id INT NOT NULL,
  unidad_id INT NOT NULL,
  last2FACode VARCHAR(6),
  last2FAExpiry DATETIME,
  CONSTRAINT PK_Usuario PRIMARY KEY (id),
  CONSTRAINT FK_Usuario_Rol FOREIGN KEY (rol_id) REFERENCES Rol(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_Usuario_Unidad FOREIGN KEY (unidad_id) REFERENCES Unidad_Organizacional(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

ALTER TABLE Usuario
ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1;

CREATE TABLE Usuario_Rol (
  usuario_id INT NOT NULL,
  rol_id INT NOT NULL,
  PRIMARY KEY (usuario_id, rol_id),
  CONSTRAINT FK_UR_User FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_UR_Rol FOREIGN KEY (rol_id) REFERENCES Rol(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- =========================
-- Tablas transaccionales
-- =========================
CREATE TABLE Documento (
  id INT AUTO_INCREMENT,
  numero_serie VARCHAR(60) NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  contenido LONGTEXT,
  estado ENUM('CREACION','EDICION','FIRMA','FIRMA_PARCIAL','APROBADO','ARCHIVADO','ELIMINACION','TRANSFERENCIA') NOT NULL,
  firmas_obtenidas INT DEFAULT 0,
  numero_firmas INT DEFAULT 0,
  confid_level ENUM('PUBLIC','INTERNAL','HIGH','RESTRICTED') NOT NULL DEFAULT 'PUBLIC',
  fecha DATETIME NOT NULL,
  unidad_id INT NOT NULL,
  usuario_id INT NOT NULL,
  categoria_id INT NULL,
  contenido_hash CHAR(64) NULL,
  CONSTRAINT PK_Documento PRIMARY KEY (id),
  CONSTRAINT UQ_Documento_numero UNIQUE (numero_serie),
  CONSTRAINT FK_Documento_Unidad FOREIGN KEY (unidad_id) REFERENCES Unidad_Organizacional(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_Documento_Usuario FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_Documento_Categoria FOREIGN KEY (categoria_id) REFERENCES Categoria(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE Permiso_Usuario (
  id INT AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  documento_id INT NOT NULL,
  permiso ENUM('EDIT','SIGN','VIEW') NOT NULL,
  motive VARCHAR(150) NULL,
  PRIMARY KEY (id),
  CONSTRAINT UQ_Permiso_Usuario UNIQUE (usuario_id, documento_id, permiso),
  CONSTRAINT FK_PU_Usuario FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_PU_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Version_Documento (
  id INT AUTO_INCREMENT,
  fecha DATETIME NOT NULL,
  contenido LONGTEXT NOT NULL,
  documento_id INT NOT NULL,
  nombre_versionado VARCHAR(255),
  CONSTRAINT PK_Version PRIMARY KEY (id),
  CONSTRAINT FK_Version_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Metadato (
  id INT AUTO_INCREMENT,
  tipo VARCHAR(60) NOT NULL,
  documento_id INT NOT NULL,
  valor TEXT NOT NULL,
  CONSTRAINT PK_Metadato PRIMARY KEY (id),
  CONSTRAINT FK_Metadato_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Documento_Plantilla (
  documento_id INT NOT NULL,
  plantilla_id INT NOT NULL,
  PRIMARY KEY (documento_id, plantilla_id),
  CONSTRAINT FK_DocPlant_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_DocPlant_Plantilla FOREIGN KEY (plantilla_id) REFERENCES Plantilla(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE Documento_Catalogo (
  documento_id INT NOT NULL,
  catalogo_id INT NOT NULL,
  PRIMARY KEY (documento_id, catalogo_id),
  CONSTRAINT FK_DocCat_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_DocCat_Catalogo FOREIGN KEY (catalogo_id) REFERENCES Catalogo(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE Plantilla_Imagen (
  plantilla_id INT NOT NULL,
  imagen_id INT NOT NULL,
  PRIMARY KEY (plantilla_id, imagen_id),
  CONSTRAINT FK_PlaImg_Plantilla FOREIGN KEY (plantilla_id) REFERENCES Plantilla(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_PlaImg_Imagen FOREIGN KEY (imagen_id) REFERENCES Imagen(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE Firma_Digital (
  id INT AUTO_INCREMENT,
  fecha DATETIME NOT NULL,
  documento_id INT NOT NULL,
  usuario_id INT NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT FK_Firma_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_Firma_Usuario FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE Indice_Electronico (
  id INT AUTO_INCREMENT,
  hash VARCHAR(128) NOT NULL,
  fecha DATETIME NOT NULL,
  firma_id INT NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT UQ_Indice_hash UNIQUE (hash),
  CONSTRAINT FK_Indice_Firma FOREIGN KEY (firma_id) REFERENCES Firma_Digital(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Documento_Allowed_User (
  documento_id INT NOT NULL,
  usuario_id INT NOT NULL,
  actions SET('VIEW','EDIT','SIGN') NOT NULL DEFAULT 'VIEW,EDIT,SIGN',
  PRIMARY KEY (documento_id, usuario_id),
  CONSTRAINT FK_DAU_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_DAU_Usuario FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Documento_Allowed_Rol (
  documento_id INT NOT NULL,
  rol_id INT NOT NULL,
  actions SET('VIEW','EDIT','SIGN') NOT NULL DEFAULT 'VIEW,EDIT,SIGN',
  PRIMARY KEY (documento_id, rol_id),
  CONSTRAINT FK_DAR_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_DAR_Rol FOREIGN KEY (rol_id) REFERENCES Rol(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Notificacion (
  id INT AUTO_INCREMENT,
  fecha DATETIME NOT NULL,
  tipo VARCHAR(60) NOT NULL,
  resultado VARCHAR(150),
  usuario_id INT NOT NULL,
  documento_id INT NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT FK_Noti_Usuario FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_Noti_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Comentario (
  id INT AUTO_INCREMENT,
  descripcion TEXT NOT NULL,
  usuario_id INT NOT NULL,
  documento_id INT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resuelto TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT FK_Comentario_Usuario FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_Comentario_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX IX_Comentario_doc_fecha ON Comentario (documento_id, fecha);

-- =========================
-- Bitácoras
-- =========================
CREATE TABLE Bitacora_Base (
  id INT AUTO_INCREMENT,
  fecha DATETIME NOT NULL,
  accion VARCHAR(150) NOT NULL,
  resultado VARCHAR(150),
  usuario_id INT NOT NULL,
  documento_id INT NULL,
  PRIMARY KEY (id),
  CONSTRAINT FK_BitacoraBase_Usuario FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_BitacoraBase_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE Bitacora_Ciclo_Documental (
  id INT,
  evento ENUM('CREACION','EDICION','FIRMA','FIRMA_PARCIAL','ARCHIVADO','ELIMINACION','TRANSFERENCIA','CONSERVACION','CONSULTA') NOT NULL,
  detalle JSON NULL,
  PRIMARY KEY (id),
  CONSTRAINT FK_BCD_Base FOREIGN KEY (id) REFERENCES Bitacora_Base(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Bitacora_Seguridad (
  id INT,
  tipo_evento ENUM('LOGIN','AUTENTICACION','FALLO_LOGIN','ACCESO_NO_AUTORIZADO','ACTIVIDAD_SEGURIDAD') NOT NULL,
  ip VARCHAR(45),
  user_agent VARCHAR(255),
  detalle JSON NULL,
  PRIMARY KEY (id),
  CONSTRAINT FK_BS_Base FOREIGN KEY (id) REFERENCES Bitacora_Base(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Bitacora_Actividad_Usuario (
  id INT,
  actividad ENUM('VISTA','BUSQUEDA','DESCARGA','NAVEGACION','OTRA') NOT NULL,
  recurso VARCHAR(255),
  parametros JSON NULL,
  PRIMARY KEY (id),
  CONSTRAINT FK_BAU_Base FOREIGN KEY (id) REFERENCES Bitacora_Base(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Bitacora_Permisos (
  id INT AUTO_INCREMENT,
  fecha DATETIME NOT NULL,
  accion VARCHAR(150) NOT NULL,
  resultado VARCHAR(500),
  usuario_id INT NOT NULL,
  documento_id INT NOT NULL,
  permiso VARCHAR(50) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT FK_BitacoraPermisos_Usuario FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_BitacoraPermisos_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================
-- Vistas
-- =========================
CREATE OR REPLACE VIEW VW_Bitacora_Ciclo_Documental_Detalle AS
SELECT
    b.id AS id_evento,
    b.fecha AS fecha_evento,
    b.accion AS accion,
    b.resultado AS resultado,
    u.email AS usuario_email,
    u.nombre AS usuario_nombre,
    u.apellido1 AS usuario_apellido1,
    u.apellido2 AS usuario_apellido2,
    r.nombre AS rol_usuario,
    COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_titulo')),
      d.titulo
    ) AS documento_titulo,
    COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_codigo_unico')),
      d.numero_serie
    ) AS documento_codigo,
    COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_estado')),
      d.estado
    ) AS documento_estado,
    c.evento AS evento_ciclo,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.accion_solicitada')) AS accion_solicitada,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.motivo')) AS motivo,
    JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.descripcion')) AS descripcion
FROM Bitacora_Base b
JOIN Bitacora_Ciclo_Documental c ON b.id = c.id
JOIN Usuario u  ON b.usuario_id = u.id
JOIN Rol r      ON u.rol_id = r.id
LEFT JOIN Documento d ON b.documento_id = d.id;

CREATE OR REPLACE VIEW VW_Bitacora_Ciclo_Documental_Lista AS
SELECT
    b.id AS id_evento,
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
    COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_codigo_oficial')),
      (
        SELECT m.valor
        FROM Metadato m
        WHERE m.documento_id = d.id
          AND m.tipo = 'CODIGO_OFICIAL'
        LIMIT 1
      ),
      COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(c.detalle, '$.snapshot.documento_codigo_unico')),
        d.numero_serie
      )
    ) AS documento_codigo_oficial,
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
FROM Documento d
JOIN Usuario u ON d.usuario_id = u.id
JOIN Unidad_Organizacional un ON d.unidad_id = un.id
LEFT JOIN Categoria c ON d.categoria_id = c.id
WHERE d.estado IN ('CREACION','EDICION','FIRMA_PARCIAL');

CREATE OR REPLACE VIEW VW_Documentos_Accesibles AS
SELECT DISTINCT
    u.id AS viewer_usuario_id,
    d.id AS documento_id,
    d.numero_serie,
    d.titulo,
    d.estado,
    d.fecha AS fecha_creacion,
    d.unidad_id,
    un.nombre AS unidad_nombre,
    d.usuario_id AS creador_id,
    cu.nombre AS creador_nombre,
    c.nombre AS categoria_nombre,
    d.numero_firmas AS firmas_requeridas,
    d.firmas_obtenidas
FROM Documento d
JOIN Unidad_Organizacional un ON un.id = d.unidad_id
JOIN Usuario cu ON cu.id = d.usuario_id
JOIN Usuario u
  ON (
       u.id = d.usuario_id
       OR d.confid_level = 'PUBLIC'
       OR (d.confid_level = 'INTERNAL' AND u.unidad_id = d.unidad_id)
       OR EXISTS (
            SELECT 1 FROM Documento_Allowed_User dau
            WHERE dau.documento_id = d.id AND dau.usuario_id = u.id
         )
       OR EXISTS (
            SELECT 1 FROM Documento_Allowed_Rol dar
            WHERE dar.documento_id = d.id
              AND (dar.rol_id = u.rol_id OR EXISTS (
                     SELECT 1 FROM Usuario_Rol ur
                     WHERE ur.usuario_id = u.id AND ur.rol_id = dar.rol_id
                  ))
         )
       OR EXISTS (
            SELECT 1 FROM Permiso_Usuario pu_hu005
            WHERE pu_hu005.documento_id = d.id AND pu_hu005.usuario_id = u.id
         )
     )
LEFT JOIN Categoria c ON c.id = d.categoria_id
WHERE (
    d.estado IN ('CREACION', 'EDICION', 'FIRMA_PARCIAL')
    OR EXISTS (
        SELECT 1 FROM Permiso_Usuario pu_vis
        WHERE pu_vis.documento_id = d.id AND pu_vis.usuario_id = u.id
    )
);

-- =========================
-- Trigger Permiso_Usuario -> Bitacora_Permisos (ELIMINADO)
-- La bitácora por excepción HU-005 se registra en aplicación (accessException.service)
-- con una sola fila EXCEPTION_APPLY y resultado agregado por permisos.
-- Si existía en BD antigua: DROP TRIGGER IF EXISTS trg_insert_permission;
-- =========================

-- =========================
-- Sesiones de edición colaborativa
-- =========================
CREATE TABLE IF NOT EXISTS Documento_Edit_Session (
  documento_id INT NOT NULL,
  usuario_id   INT NOT NULL,
  last_seen    DATETIME NOT NULL,
  PRIMARY KEY (documento_id, usuario_id),
  CONSTRAINT FK_DES_Doc FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_DES_User FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- =========================
-- Índices y constraints para Metadato
-- =========================
ALTER TABLE Metadato
  ADD CONSTRAINT UQ_Metadato_doc_tipo UNIQUE (documento_id, tipo);

CREATE INDEX IX_Metadato_doc_tipo ON Metadato (documento_id, tipo);


-- Editor-level permissions (global, not per document)
CREATE TABLE IF NOT EXISTS Editor_Permission (
  user_id INT NOT NULL,
  perm ENUM('EDIT','SIGN') NOT NULL,
  PRIMARY KEY (user_id, perm),
  CONSTRAINT FK_EditorPerm_User FOREIGN KEY (user_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- Roles requeridos por el código (ADMIN=1, EDITOR=2, etc.)
INSERT INTO Rol (id,nombre,descripcion) VALUES
  (1,'ADMINISTRADOR','Full admin'),
  (2,'EDITOR','Editor'),
  (3,'ARCHIVADOR','Archivo'),
  (4,'USUARIO','Usuario interno'),
  (5,'USUARIO_EXTERNO','Externo')
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), descripcion=VALUES(descripcion);

INSERT INTO Unidad_Organizacional (nombre, descripcion) VALUES
('Junta Administrativa','Órgano de nivel político encargado de la supervisión y toma de decisiones institucionales.'),
('Auditoría Interna','Instancia asesora responsable de fiscalizar la gestión y asegurar el control interno.'),
('Dirección General','Nivel directivo que coordina y supervisa todas las áreas del Museo Nacional.'),
('Asesoría Jurídica','Instancia asesora encargada de los asuntos legales y normativos de la institución.'),
('Planificación','Instancia asesora responsable de la planificación estratégica y operativa del Museo.'),
('Historia Natural','Departamento operativo dedicado al estudio, conservación y divulgación del patrimonio natural.'),
('Protección Patrimonio Cultural','Departamento enfocado en la protección, investigación y gestión del patrimonio cultural.'),
('Antropología e Historia','Departamento encargado de la investigación, conservación y difusión de la antropología e historia de Costa Rica.'),
('Proyección Museológica','Departamento que gestiona la museografía, exposiciones y relación con el público.'),
('Administración y Finanzas','Departamento que gestiona recursos financieros, administrativos y de apoyo institucional.'),
('Informática','Unidad operativa encargada de la infraestructura tecnológica, sistemas de información y soporte digital.')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

CREATE OR REPLACE VIEW VW_Vista_Documentos AS
SELECT
    d.id AS documento_id,
    d.titulo AS documento_nombre,
    d.estado AS documento_estado,
    u.nombre AS primer_usuario,
    d.fecha AS fecha_creacion,
    un.nombre AS unidad_nombre,
    c.nombre AS categoria_nombre,
    d.numero_firmas AS firmas_requeridas,
    d.firmas_obtenidas AS firmas_obtenidas
FROM Documento d
JOIN Usuario u ON d.usuario_id = u.id
JOIN Unidad_Organizacional un ON d.unidad_id = un.id
LEFT JOIN Categoria c ON d.categoria_id = c.id
WHERE d.estado IN ('CREACION','EDICION','FIRMA_PARCIAL');

ALTER TABLE Documento
  ADD COLUMN verificacion_firma_estado
    ENUM('PENDIENTE','VALIDA','INVALIDA','CADUCADA','REVOCADA')
    NOT NULL DEFAULT 'PENDIENTE';

ALTER TABLE Documento
  ADD COLUMN verificacion_firma_fecha DATETIME NULL;


-- NO SE QUIEN HIZO ESTO PERO CREO QUE VA
ALTER TABLE Bitacora_Permisos
    MODIFY fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE Permiso_Usuario
  ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE Permiso_Usuario
DROP COLUMN updated_at;


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
FROM Documento d
         JOIN Usuario u ON d.usuario_id = u.id
         JOIN Unidad_Organizacional un ON d.unidad_id = un.id
         LEFT JOIN Categoria c ON d.categoria_id = c.id
WHERE d.estado IN ('CREACION','EDICION','FIRMA_PARCIAL');

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
-- Vista VW_Bitacora_Seguridad_Detalle
-- =========================
CREATE OR REPLACE VIEW VW_Bitacora_Seguridad_Detalle AS
SELECT
    b.id AS id_evento,
    b.fecha AS fecha_evento,
    b.accion AS accion,
    b.resultado AS resultado,
    b.usuario_id,
    u.email AS usuario_email,
    CONCAT_WS(' ', u.nombre, u.apellido1, 
              NULLIF(TRIM(u.apellido2), '')) AS usuario_nombre_completo,
    s.ip,
    s.user_agent,
    s.detalle AS detalle_json
FROM Bitacora_Base b
JOIN Bitacora_Seguridad s  ON s.id = b.id
LEFT JOIN Usuario u        ON u.id = b.usuario_id
LEFT JOIN Rol r            ON r.id = u.rol_id;

ALTER TABLE Notificacion
    ADD COLUMN accion_requerida ENUM('EDITAR','FIRMAR','ARCHIVAR','ELIMINAR') NOT NULL AFTER tipo,
    ADD COLUMN fecha_limite DATETIME NULL AFTER fecha,
    ADD COLUMN enlace_directo VARCHAR(255) NULL AFTER fecha_limite,
    ADD COLUMN leida TINYINT(1) NOT NULL DEFAULT 0 AFTER enlace_directo,
    ADD COLUMN leida_en DATETIME NULL AFTER leida;

CREATE TABLE Notificacion_Entrega (
                                      id INT AUTO_INCREMENT,
                                      notificacion_id INT NOT NULL,
                                      canal ENUM('IN_APP','EMAIL') NOT NULL,

                                      estado ENUM('PENDIENTE','ENVIADA','FALLIDA') NOT NULL DEFAULT 'PENDIENTE',
                                      intentos INT NOT NULL DEFAULT 0,
                                      ultimo_intento DATETIME NULL,

                                      enviado_en DATETIME NULL,
                                      error_msg VARCHAR(300) NULL,

    -- opcional para email: id del proveedor (SendGrid, SMTP queue id, etc.)
                                      proveedor_msg_id VARCHAR(120) NULL,

                                      PRIMARY KEY (id),
                                      CONSTRAINT FK_NE_Notificacion FOREIGN KEY (notificacion_id) REFERENCES Notificacion(id)
                                          ON UPDATE CASCADE ON DELETE CASCADE,

    -- evita duplicados por canal
                                      CONSTRAINT UQ_NE_Noti_Canal UNIQUE (notificacion_id, canal)
) ENGINE=InnoDB;

CREATE INDEX IX_NE_Estado ON Notificacion_Entrega (estado, canal);


CREATE INDEX IX_Notificacion_user_leida_fecha ON Notificacion (usuario_id, leida, fecha);



-- NUEVO
ALTER TABLE Usuario
    ADD COLUMN can_edit TINYINT(1) NOT NULL DEFAULT 1,
    ADD COLUMN can_sign TINYINT(1) NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS Firma_Externa_Verificacion (
  id INT AUTO_INCREMENT,
  documento_id INT NOT NULL,
  verificado_por_usuario_id INT NOT NULL,

  -- resultado final de la verificación
  estado ENUM('VALIDA','INVALIDA','CADUCADA','REVOCADA') NOT NULL,

  -- info útil del certificado (no guardés el .cer completo en la BD si no querés)
  certificado_serial VARCHAR(128) NULL,
  certificado_issuer VARCHAR(255) NULL,
  certificado_subject VARCHAR(255) NULL,
  certificado_not_before DATETIME NULL,
  certificado_not_after DATETIME NULL,

  -- detalles extra (motivo técnico / mensaje del validador)
  detalle JSON NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  CONSTRAINT FK_FEV_Documento
    FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE,

  CONSTRAINT FK_FEV_Usuario
    FOREIGN KEY (verificado_por_usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  INDEX IX_FEV_doc_fecha (documento_id, created_at),
  INDEX IX_FEV_estado (estado, created_at)
) ENGINE=InnoDB;

ALTER TABLE Usuario
  ADD COLUMN can_edit TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN can_sign TINYINT(1) NOT NULL DEFAULT 0;


-- Correcion vista

CREATE OR REPLACE VIEW VW_Documentos_Accesibles AS
SELECT DISTINCT
    u.id AS viewer_usuario_id,
    d.id AS documento_id,
    d.numero_serie,
    d.titulo,
    d.estado,
    d.fecha AS fecha_creacion,
    d.unidad_id,
    un.nombre AS unidad_nombre,
    d.usuario_id AS creador_id,
    TRIM(CONCAT(cu.nombre, ' ', cu.apellido1, ' ', IFNULL(cu.apellido2, ''))) AS creador_nombre,
    c.nombre AS categoria_nombre,
    d.numero_firmas AS firmas_requeridas,
    d.firmas_obtenidas
FROM Documento d
         JOIN Unidad_Organizacional un
              ON un.id = d.unidad_id
         JOIN Usuario cu
              ON cu.id = d.usuario_id
         JOIN Usuario u
              ON (
                  u.id = d.usuario_id
                      OR d.confid_level = 'PUBLIC'
                      OR (d.confid_level = 'INTERNAL' AND u.unidad_id = d.unidad_id)
                      OR EXISTS (
                      SELECT 1
                      FROM Documento_Allowed_User dau
                      WHERE dau.documento_id = d.id
                        AND dau.usuario_id = u.id
                  )
                      OR EXISTS (
                      SELECT 1
                      FROM Documento_Allowed_Rol dar
                      WHERE dar.documento_id = d.id
                        AND (
                          dar.rol_id = u.rol_id
                              OR EXISTS (
                              SELECT 1
                              FROM Usuario_Rol ur
                              WHERE ur.usuario_id = u.id
                                AND ur.rol_id = dar.rol_id
                          )
                          )
                  )
                      OR EXISTS (
                      SELECT 1
                      FROM Permiso_Usuario pu_hu005
                      WHERE pu_hu005.documento_id = d.id
                        AND pu_hu005.usuario_id = u.id
                  )
                  )
         LEFT JOIN Categoria c
                   ON c.id = d.categoria_id
WHERE (
    d.estado IN ('CREACION', 'EDICION', 'FIRMA_PARCIAL')
    OR EXISTS (
        SELECT 1
        FROM Permiso_Usuario pu_vis
        WHERE pu_vis.documento_id = d.id
          AND pu_vis.usuario_id = u.id
    )
);

-- =========================
-- Anexos de documento
-- =========================
  CREATE TABLE Documento_Anexo (
                                   id INT AUTO_INCREMENT,
                                   documento_id INT NOT NULL,
                                   usuario_id INT NOT NULL,
                                   nombre_original VARCHAR(255) NOT NULL,
                                   nombre_guardado VARCHAR(255) NOT NULL,
                                   ruta_archivo VARCHAR(500) NOT NULL,
                                   mime_type VARCHAR(120) NOT NULL,
                                   tamano_bytes BIGINT NOT NULL,
                                   descripcion VARCHAR(255) NULL,
                                   fecha_subida DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                   orden_visual INT NOT NULL DEFAULT 1,

                                   PRIMARY KEY (id),

                                   CONSTRAINT FK_DocAnexo_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
                                       ON UPDATE CASCADE ON DELETE CASCADE,

                                   CONSTRAINT FK_DocAnexo_Usuario FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
                                       ON UPDATE CASCADE ON DELETE RESTRICT
  ) ENGINE=InnoDB;

  CREATE INDEX IX_Documento_Anexo_Doc
      ON Documento_Anexo (documento_id, fecha_subida);

  CREATE INDEX IX_Documento_Anexo_Usuario
      ON Documento_Anexo (usuario_id);

-- THIS BELONGS TO HU-019


-- Institutional archival classification catalog
CREATE TABLE IF NOT EXISTS Clasificacion_Archivistica (
  codigo VARCHAR(60) NOT NULL,
  etiqueta VARCHAR(180) NOT NULL,
  descripcion TEXT NULL,
  activa TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (codigo)
) ENGINE=InnoDB;

-- Retention rules catalog
CREATE TABLE IF NOT EXISTS Regla_Retencion (
  id INT AUTO_INCREMENT,
  etiqueta VARCHAR(180) NOT NULL,
  anos INT NOT NULL,
  activa TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- Formal intake registration in archival conservation
CREATE TABLE IF NOT EXISTS Ingreso_Conservacion (
  id INT AUTO_INCREMENT,
  documento_id INT NOT NULL,
  official_code VARCHAR(60) NOT NULL,
  classification_code VARCHAR(60) NOT NULL,
  classification_label VARCHAR(180) NOT NULL,
  access_level ENUM('PUBLIC','INTERNAL','HIGH','RESTRICTED') NOT NULL,
  retention_rule_id INT NOT NULL,
  retention_years INT NOT NULL,
  retention_start_date DATE NOT NULL,
  retention_end_date DATE NOT NULL,
  tracking_enabled TINYINT(1) NOT NULL DEFAULT 1,
  payload_snapshot JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INT NOT NULL,

  PRIMARY KEY (id),
  CONSTRAINT UQ_IngresoConservacion_Documento UNIQUE (documento_id),
  CONSTRAINT UQ_IngresoConservacion_OfficialCode UNIQUE (official_code),

  CONSTRAINT FK_IC_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE,

  CONSTRAINT FK_IC_RetentionRule FOREIGN KEY (retention_rule_id) REFERENCES Regla_Retencion(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT FK_IC_User FOREIGN KEY (created_by) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT FK_IC_Classification FOREIGN KEY (classification_code) REFERENCES Clasificacion_Archivistica(codigo)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX IX_IC_RetentionDates
  ON Ingreso_Conservacion (retention_start_date, retention_end_date);

CREATE INDEX IX_IC_CreatedAt
  ON Ingreso_Conservacion (created_at);

-- frontend placeholders
INSERT INTO Clasificacion_Archivistica (codigo, etiqueta, descripcion, activa) VALUES
  ('1.1.01', 'Serie 1 — Actas', 'Clasificación archivística institucional para actas.', 1),
  ('1.1.02', 'Serie 1 — Informes', 'Clasificación archivística institucional para informes.', 1),
  ('2.3.10', 'Serie 2 — Correspondencia', 'Clasificación archivística institucional para correspondencia.', 1)
ON DUPLICATE KEY UPDATE
  etiqueta = VALUES(etiqueta),
  descripcion = VALUES(descripcion),
  activa = VALUES(activa);

INSERT INTO Regla_Retencion (id, etiqueta, anos, activa) VALUES
  (1, '10 años', 10, 1),
  (2, '5 años', 5, 1),
  (3, '2 años', 2, 1)
ON DUPLICATE KEY UPDATE
  etiqueta = VALUES(etiqueta),
  anos = VALUES(anos),
  activa = VALUES(activa);


-- Carga de documentos
ALTER TABLE Editor_Permission
    MODIFY perm ENUM('EDIT','SIGN','UPLOAD') NOT NULL;

INSERT IGNORE INTO Editor_Permission (user_id, perm)
SELECT DISTINCT ur.usuario_id, 'UPLOAD'
FROM Usuario_Rol ur
         JOIN Rol r ON r.id = ur.rol_id
WHERE UPPER(REPLACE(r.nombre,' ', '_')) IN ('EDITOR','ARCHIVISTA','ARCHIVADOR');

DELETE ep
FROM Editor_Permission ep
WHERE ep.perm = 'UPLOAD'
  AND NOT EXISTS (
    SELECT 1
    FROM Usuario_Rol ur
             JOIN Rol r ON r.id = ur.rol_id
    WHERE ur.usuario_id = ep.user_id
      AND UPPER(REPLACE(r.nombre,' ', '_')) IN ('EDITOR','ARCHIVISTA','ARCHIVADOR')
);

-- =========================
-- Correcciones Vista VW_Bitacora_Ciclo_Documental_Lista
-- =========================

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




  USE BD_PATRIMONIUS;

-- =========================
-- Catálogos archivísticos
-- =========================
  CREATE TABLE Expediente (
                              id INT AUTO_INCREMENT PRIMARY KEY,
                              codigo VARCHAR(100) NOT NULL UNIQUE,
                              nombre VARCHAR(255) NOT NULL,
                              fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS Serie (
                                       id INT AUTO_INCREMENT,
                                       codigo VARCHAR(60) NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      descripcion TEXT NULL,
      unidad_id INT NOT NULL,
      activa TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ON UPDATE CURRENT_TIMESTAMP,

      CONSTRAINT PK_Serie PRIMARY KEY (id),

      -- evita repetir el mismo código en la misma unidad
      CONSTRAINT UQ_Serie_unidad_codigo UNIQUE (unidad_id, codigo),

      -- evita repetir el mismo nombre en la misma unidad
      CONSTRAINT UQ_Serie_unidad_nombre UNIQUE (unidad_id, nombre),

      CONSTRAINT FK_Serie_Unidad FOREIGN KEY (unidad_id)
      REFERENCES Unidad_Organizacional(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT
      ) ENGINE=InnoDB;


  CREATE TABLE IF NOT EXISTS Subserie (
                                          id INT AUTO_INCREMENT,
                                          codigo VARCHAR(60) NOT NULL,
      nombre VARCHAR(150) NOT NULL,
      descripcion TEXT NULL,
      serie_id INT NOT NULL,
      activa TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ON UPDATE CURRENT_TIMESTAMP,

      CONSTRAINT PK_Subserie PRIMARY KEY (id),

      -- evita repetir código dentro de la misma serie
      CONSTRAINT UQ_Subserie_serie_codigo UNIQUE (serie_id, codigo),

      -- evita repetir nombre dentro de la misma serie
      CONSTRAINT UQ_Subserie_serie_nombre UNIQUE (serie_id, nombre),

      CONSTRAINT FK_Subserie_Serie FOREIGN KEY (serie_id)
      REFERENCES Serie(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT
      ) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Expediente (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(60) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    unidad_id INT NOT NULL,
    serie_id INT NOT NULL,
    subserie_id INT NULL,
    descripcion TEXT NULL,
    estado ENUM('ACTIVO', 'CERRADO', 'TRANSFERIDO', 'ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre DATETIME NULL,
    created_by INT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Relaciones con otras tablas
    CONSTRAINT FK_expediente_unidad FOREIGN KEY (unidad_id) REFERENCES Unidad_Organizacional(id),
    CONSTRAINT FK_expediente_serie FOREIGN KEY (serie_id) REFERENCES Serie(id),
    CONSTRAINT FK_expediente_subserie FOREIGN KEY (subserie_id) REFERENCES Subserie(id),
    CONSTRAINT FK_expediente_usuario FOREIGN KEY (created_by) REFERENCES Usuario(id),

    -- Índices
    INDEX IX_expediente_unidad (unidad_id),
    INDEX IX_expediente_serie (serie_id),
    INDEX IX_expediente_subserie (subserie_id),
    INDEX IX_expediente_estado (estado)
) ENGINE=InnoDB;

SHOW COLUMNS FROM Expediente;
SHOW CREATE TABLE Expediente;

  ALTER TABLE Expediente
      ADD COLUMN unidad_id INT NOT NULL AFTER nombre,
  ADD COLUMN serie_id INT NOT NULL AFTER unidad_id,
  ADD COLUMN subserie_id INT NULL AFTER serie_id,
  ADD COLUMN descripcion TEXT NULL AFTER subserie_id,
  ADD COLUMN estado ENUM('ACTIVO','CERRADO','TRANSFERIDO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO' AFTER descripcion,
  ADD COLUMN fecha_cierre DATETIME NULL AFTER fecha_creacion,
  ADD COLUMN created_by INT NULL AFTER fecha_cierre,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_by,
    ADD CONSTRAINT FK_expediente_unidad FOREIGN KEY (unidad_id) REFERENCES Unidad_Organizacional(id),
     ADD CONSTRAINT FK_expediente_serie FOREIGN KEY (serie_id) REFERENCES Serie(id),
      ADD CONSTRAINT FK_expediente_subserie FOREIGN KEY (subserie_id) REFERENCES Subserie(id),
     ADD CONSTRAINT FK_expediente_usuario FOREIGN KEY (created_by) REFERENCES Usuario(id);


  ALTER TABLE Documento
      ADD COLUMN expediente_id INT NULL AFTER categoria_id,
  ADD CONSTRAINT FK_documento_expediente FOREIGN KEY (expediente_id) REFERENCES Expediente(id);

  ALTER TABLE Expediente
      ADD INDEX IX_expediente_unidad (unidad_id),
  ADD INDEX IX_expediente_serie (serie_id),
  ADD INDEX IX_expediente_subserie (subserie_id),
  ADD INDEX IX_expediente_estado (estado);

  -- =========================
-- Relación obligatoria Documento -> Expediente
-- =========================

  ALTER TABLE Documento
      ADD COLUMN expediente_id INT NULL AFTER categoria_id;

  ALTER TABLE Documento
      ADD CONSTRAINT FK_Documento_Expediente
          FOREIGN KEY (expediente_id)
              REFERENCES Expediente(id)
              ON UPDATE CASCADE
              ON DELETE RESTRICT;


  -- =========================
-- Índices útiles
-- =========================

  CREATE INDEX IX_Serie_Unidad
      ON Serie (unidad_id, nombre);

  CREATE INDEX IX_Subserie_Serie
      ON Subserie (serie_id, nombre);

  CREATE INDEX IX_Expediente_Filtros
      ON Expediente (unidad_id, serie_id, subserie_id, estado);

  CREATE INDEX IX_Documento_Expediente
      ON Documento (expediente_id);


ALTER TABLE Bitacora_Permisos
 -- solicitud_id = “id del trámite” para enlazar todos los registros de bitácora de ese trámite.
 -- Opcional pero útil para HU-024 / flujos con varios pasos.
  ADD COLUMN solicitud_id VARCHAR(64) NULL AFTER id,
  ADD COLUMN target_usuario_id INT NULL AFTER usuario_id,
  ADD COLUMN responsable_id INT NULL AFTER target_usuario_id,

  ADD COLUMN tipo_flujo ENUM(
    'EXCEPCION_ACCESO',
    'SOLICITUD_ACCESO_EXTERNO',
    'DESCARGA_DOCUMENTO_APROBADO'
  ) NULL AFTER permiso,

  ADD COLUMN estado_flujo ENUM(
    'PENDIENTE',
    'APROBADA',
    'DENEGADA',
    'REVOCADA',
    'EXPIRADA',
    'PERMITIDO',
    'DENEGADO'
  ) NULL AFTER tipo_flujo,

  ADD COLUMN justificacion TEXT NULL AFTER estado_flujo,
  ADD COLUMN fecha_inicio_acceso DATETIME NULL AFTER justificacion,
  ADD COLUMN fecha_fin_acceso DATETIME NULL AFTER fecha_inicio_acceso,
  ADD COLUMN user_agent VARCHAR(255) NULL AFTER fecha_fin_acceso,
ADD COLUMN detalle JSON NULL AFTER user_agent,

  ADD CONSTRAINT FK_BitacoraPermisos_TargetUsuario
    FOREIGN KEY (target_usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT FK_BitacoraPermisos_Responsable
    FOREIGN KEY (responsable_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

-- Ampliar resultado para textos agregados (varios permisos en una fila)
ALTER TABLE Bitacora_Permisos
  MODIFY COLUMN resultado VARCHAR(500) NULL;

-- Quitar trigger duplicado si la BD ya existía (una fila por INSERT en Permiso_Usuario)
DROP TRIGGER IF EXISTS trg_insert_permission;

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

-- =========================
-- Tabla de Solicitud para acceso a documentos
-- =========================
CREATE TABLE Solicitud_Acceso (
                                  id INT AUTO_INCREMENT,
                                  justificacion TEXT NOT NULL,
                                  estado_solicitud ENUM('PENDIENTE','APROBADA','RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
                                  motivo_resolucion TEXT NULL,

                                  usuario_solicitante_id INT NOT NULL,
                                  admin_responsable_id INT NULL,
                                  documento_id INT NOT NULL,

                                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                                  CONSTRAINT PK_Solicitud_Acceso PRIMARY KEY (id),

                                  CONSTRAINT FK_SolicitudAcceso_UsuarioSolicitante FOREIGN KEY (usuario_solicitante_id)
                                      REFERENCES Usuario(id)
                                      ON UPDATE CASCADE
                                      ON DELETE RESTRICT,

                                  CONSTRAINT FK_SolicitudAcceso_AdminResponsable FOREIGN KEY (admin_responsable_id)
                                      REFERENCES Usuario(id)
                                      ON UPDATE CASCADE
                                      ON DELETE RESTRICT,

                                  CONSTRAINT FK_SolicitudAcceso_Documento FOREIGN KEY (documento_id)
                                      REFERENCES Documento(id)
                                      ON UPDATE CASCADE
                                      ON DELETE RESTRICT
) ENGINE=InnoDB;
-- =========================
-- Columna expediente id en la tabla índice
-- =========================
ALTER TABLE Indice_Electronico
    ADD COLUMN expediente_id INT NULL AFTER firma_id,
  ADD CONSTRAINT FK_Indice_Expediente
    FOREIGN KEY (expediente_id) REFERENCES Expediente(id)
    ON UPDATE CASCADE
       ON DELETE RESTRICT;

CREATE INDEX IX_Indice_Expediente
    ON Indice_Electronico (expediente_id);

ALTER TABLE Indice_Electronico
    MODIFY COLUMN firma_id INT NULL;

ALTER TABLE Bitacora_Permisos
MODIFY COLUMN tipo_flujo ENUM(
  'EXCEPCION_ACCESO',
  'SOLICITUD_ACCESO_EXTERNO'
) NULL AFTER permiso;

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

-- ------------Plazos-----------------

ALTER TABLE Documento
    ADD COLUMN plazo_valor INT NULL AFTER categoria_id,
ADD COLUMN plazo_unidad ENUM('DIAS','MESES','ANIOS') NULL AFTER plazo_valor,
ADD COLUMN plazo_tipo ENUM('ADMINISTRATIVO','LEGAL','HISTORICO') NULL AFTER plazo_unidad,
ADD COLUMN fecha_inicio_conservacion DATETIME NULL AFTER plazo_tipo,
ADD COLUMN fecha_vencimiento DATETIME NULL AFTER fecha_inicio_conservacion,
ADD COLUMN estado_conservacion ENUM('VIGENTE','PROXIMO_A_VENCER','VENCIDO') NULL AFTER fecha_vencimiento,
ADD COLUMN plazo_asignado_por INT NULL AFTER estado_conservacion,
ADD COLUMN plazo_asignado_en DATETIME NULL AFTER plazo_asignado_por,
ADD CONSTRAINT FK_Documento_Plazo_Asignado_Por
    FOREIGN KEY (plazo_asignado_por)
    REFERENCES Usuario(id)
    ON UPDATE CASCADE
       ON DELETE RESTRICT;

CREATE INDEX IX_Documento_Conservacion
    ON Documento (estado, estado_conservacion, fecha_vencimiento);

-- Arreglo quitando ese atributo innecesario
ALTER TABLE Documento
DROP COLUMN plazo_tipo;


-- Nuevas columnas en indice_electronico
ALTER TABLE Indice_Electronico
    ADD COLUMN json_path VARCHAR(500) NULL AFTER expediente_id,
ADD COLUMN acta_pdf_path VARCHAR(500) NULL AFTER json_path;

-- Nueva Tabla Solicitud de expedientes
CREATE TABLE Solicitud_Acceso_Expediente (
    id INT AUTO_INCREMENT PRIMARY KEY,
    justificacion VARCHAR(1000) NOT NULL,
    estado_solicitud ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
    motivo_resolucion VARCHAR(1000) NULL,

    usuario_solicitante_id INT NOT NULL,
    expediente_id INT NOT NULL,
    admin_responsable_id INT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_sae_usuario_solicitante
        FOREIGN KEY (usuario_solicitante_id) REFERENCES Usuario(id),

    CONSTRAINT fk_sae_expediente
        FOREIGN KEY (expediente_id) REFERENCES Expediente(id),

    CONSTRAINT fk_sae_admin_responsable
        FOREIGN KEY (admin_responsable_id) REFERENCES Usuario(id),

    CONSTRAINT chk_sae_justificacion
        CHECK (CHAR_LENGTH(TRIM(justificacion)) > 0),

    CONSTRAINT chk_sae_motivo_resolucion
        CHECK (
            motivo_resolucion IS NULL
            OR CHAR_LENGTH(TRIM(motivo_resolucion)) > 0
        )
);
CREATE TABLE Permiso_Usuario_Expediente (
                                            id INT AUTO_INCREMENT PRIMARY KEY,
                                            usuario_id INT NOT NULL,
                                            expediente_id INT NOT NULL,
                                            permiso ENUM('VIEW') NOT NULL DEFAULT 'VIEW',
                                            motive VARCHAR(500) NULL,
                                            granted_by INT NULL,

                                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                                            CONSTRAINT fk_pue_usuario
                                                FOREIGN KEY (usuario_id) REFERENCES Usuario(id),

                                            CONSTRAINT fk_pue_expediente
                                                FOREIGN KEY (expediente_id) REFERENCES Expediente(id),

                                            CONSTRAINT fk_pue_granted_by
                                                FOREIGN KEY (granted_by) REFERENCES Usuario(id),

                                            CONSTRAINT uq_pue_usuario_expediente_permiso
                                                UNIQUE (usuario_id, expediente_id, permiso)
);
CREATE INDEX idx_sae_usuario ON Solicitud_Acceso_Expediente(usuario_solicitante_id);
CREATE INDEX idx_sae_expediente ON Solicitud_Acceso_Expediente(expediente_id);
CREATE INDEX idx_sae_estado ON Solicitud_Acceso_Expediente(estado_solicitud);
CREATE INDEX idx_sae_admin ON Solicitud_Acceso_Expediente(admin_responsable_id);
CREATE INDEX idx_sae_created_at ON Solicitud_Acceso_Expediente(created_at);

CREATE INDEX idx_pue_usuario ON Permiso_Usuario_Expediente(usuario_id);
CREATE INDEX idx_pue_expediente ON Permiso_Usuario_Expediente(expediente_id);


-- Agregar corrigiendo la HU-029

ALTER TABLE Serie
    ADD COLUMN plazo_conservacion_anios INT NULL;


ALTER TABLE Ingreso_Conservacion
    MODIFY retention_rule_id INT NULL;



-- =========================
-- Bitácora de ciclo de vida del expediente (creación → cierre / transferencia / etc.)
-- Misma idea que Bitacora_Base + Bitacora_Ciclo_Documental, pero por expediente.
-- =========================
CREATE TABLE IF NOT EXISTS Bitacora_Expediente (
                                                   id INT AUTO_INCREMENT,
                                                   fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                                   expediente_id INT NOT NULL,
                                                   usuario_id INT NOT NULL,
                                                   evento ENUM(
                                                       'CREACION',
                                                       'ACTUALIZACION',
                                                       'ABRIR',
                                                       'CIERRE',
                                                       'TRANSFERENCIA',
                                                       'ELIMINACION',
                                                       'DOCUMENTO_VINCULADO',
                                                       'SOLICITUD_ACCESO',
                                                       'PERMISO_OTORGADO',
                                                       'PERMISO_REVOCADO',
                                                       'VISITA_PREVIA',
                                                       'DESCARGA'
                                                       ) NOT NULL,
                                                   resultado ENUM(
                                                       'PERMITIDO',
                                                       'DENEGADO'
                                                       ) NOT NULL DEFAULT 'PERMITIDO',
                                                   estado_anterior ENUM('ACTIVO', 'CERRADO', 'TRANSFERIDO', 'ELIMINADO') NULL,
                                                   estado_nuevo ENUM('ACTIVO', 'CERRADO', 'TRANSFERIDO', 'ELIMINADO') NULL,
                                                   detalle JSON NULL,
                                                   PRIMARY KEY (id),
                                                   CONSTRAINT FK_BitacoraExpediente_Expediente
                                                       FOREIGN KEY (expediente_id) REFERENCES Expediente(id)
                                                           ON UPDATE CASCADE ON DELETE RESTRICT,
                                                   CONSTRAINT FK_BitacoraExpediente_Usuario
                                                       FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
                                                           ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE INDEX IX_BitacoraExpediente_expediente_fecha
    ON Bitacora_Expediente (expediente_id, fecha);
CREATE INDEX IX_BitacoraExpediente_evento
    ON Bitacora_Expediente (evento);
CREATE INDEX IX_BitacoraExpediente_usuario
    ON Bitacora_Expediente (usuario_id);

-- =========================
-- Vistas Bitacora_Expediente (consultas / UI auditoría, mismo criterio que VW_Bitacora_Permisos_*)
-- =========================
CREATE OR REPLACE VIEW VW_Bitacora_Expediente_Lista AS
SELECT
    be.id AS id_registro,
    be.fecha AS fecha_hora,
    be.expediente_id,
    e.codigo AS expediente_codigo,
    e.nombre AS expediente_nombre,
    e.estado AS expediente_estado_actual,
    be.usuario_id,
    u.email AS usuario_email,
    CONCAT_WS(' ', u.nombre, u.apellido1, NULLIF(TRIM(u.apellido2), '')) AS usuario_nombre_completo,
    be.evento,
    be.resultado,
    be.estado_anterior,
    be.estado_nuevo
FROM Bitacora_Expediente be
         INNER JOIN Expediente e ON e.id = be.expediente_id
         INNER JOIN Usuario u ON u.id = be.usuario_id;

CREATE OR REPLACE VIEW VW_Bitacora_Expediente_Detalle AS
SELECT
    be.id AS id_registro,
    be.fecha AS fecha_hora,
    be.expediente_id,
    e.codigo AS expediente_codigo,
    e.nombre AS expediente_nombre,
    e.estado AS expediente_estado_actual,
    e.unidad_id AS expediente_unidad_id,
    un.nombre AS unidad_nombre,
    be.usuario_id,
    u.email AS usuario_email,
    CONCAT_WS(' ', u.nombre, u.apellido1, NULLIF(TRIM(u.apellido2), '')) AS usuario_nombre_completo,
    r.nombre AS usuario_rol_nombre,
    be.evento,
    be.resultado,
    be.estado_anterior,
    be.estado_nuevo,
    be.detalle
FROM Bitacora_Expediente be
         INNER JOIN Expediente e ON e.id = be.expediente_id
         INNER JOIN Usuario u ON u.id = be.usuario_id
         LEFT JOIN Rol r ON r.id = u.rol_id
         LEFT JOIN Unidad_Organizacional un ON un.id = e.unidad_id;


-- HU29 EXPEDIENTES
ALTER TABLE Expediente
    ADD COLUMN fecha_inicio_vigencia DATETIME NULL,
    ADD COLUMN fecha_vencimiento DATETIME NULL;

-- =========================
-- HU-032: disposición documental por expediente (sin SIP; ZIP para transferencia)
-- Aplicar en bases ya creadas. Si Workbench falla con el archivo entero, ejecute solo
-- este bloque o el archivo migrations/20260421_hu032_disposicion_expediente.sql
-- =========================
ALTER TABLE Serie
    ADD COLUMN politica_disposicion ENUM('ELIMINACION', 'TRANSFERENCIA', 'CONSERVACION_PERMANENTE') NULL
        COMMENT 'Política archivística sugerida/restringida para disposición final'
        AFTER plazo_conservacion_anios;

ALTER TABLE Expediente
    ADD COLUMN disposicion_estado VARCHAR(64) NULL COMMENT 'Estado del flujo HU-032' AFTER fecha_vencimiento,
    ADD COLUMN disposicion_tipo VARCHAR(40) NULL COMMENT 'ELIMINACION | TRANSFERENCIA | CONSERVACION_PERMANENTE',
    ADD COLUMN disposicion_justificacion_inicio TEXT NULL,
    ADD COLUMN disposicion_revision_json JSON NULL,
    ADD COLUMN disposicion_justificacion_aprobacion TEXT NULL,
    ADD COLUMN disposicion_motivo_rechazo TEXT NULL,
    ADD COLUMN acta_eliminacion_codigo VARCHAR(120) NULL,
    ADD COLUMN acta_eliminacion_pdf_path VARCHAR(512) NULL,
    ADD COLUMN paquete_transferencia_zip_path VARCHAR(512) NULL,
    ADD COLUMN disposicion_metadatos_resumen JSON NULL;



-- =====================================================
-- Refresh tokens para renovación de sesión
-- =====================================================
CREATE TABLE IF NOT EXISTS Refresh_Token (
                                             id INT AUTO_INCREMENT,
                                             usuario_id INT NOT NULL,
                                             token_hash CHAR(64) NOT NULL,
                                             expires_at DATETIME NOT NULL,
                                             revoked_at DATETIME NULL,
                                             created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                             user_agent VARCHAR(255) NULL,
                                             ip VARCHAR(45) NULL,
                                             PRIMARY KEY (id),

                                             CONSTRAINT FK_RefreshToken_Usuario
                                                 FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
                                                     ON UPDATE CASCADE
                                                     ON DELETE CASCADE,

                                             CONSTRAINT UQ_RefreshToken_TokenHash UNIQUE (token_hash)
) ENGINE=InnoDB;

CREATE INDEX IX_RefreshToken_Usuario
    ON Refresh_Token (usuario_id);

CREATE INDEX IX_RefreshToken_Expires
    ON Refresh_Token (expires_at);

CREATE INDEX IX_RefreshToken_Revoked
    ON Refresh_Token (revoked_at);

-- Despacho de documentos por correo
CREATE TABLE IF NOT EXISTS Despacho_Correo_Documento (
                                                         id INT AUTO_INCREMENT PRIMARY KEY,
                                                         documento_id INT NOT NULL,
                                                         enviado_por INT NOT NULL,
                                                         para_json JSON NOT NULL,
                                                         cc_json JSON NULL,
                                                         asunto VARCHAR(255) NOT NULL,
                                                         mensaje TEXT NOT NULL,
                                                         adjuntos_json JSON NULL,
                                                         message_id VARCHAR(255) NULL,
                                                         estado ENUM('ENVIADO', 'FALLIDO') NOT NULL DEFAULT 'ENVIADO',
                                                         error TEXT NULL,
                                                         fecha_envio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                                         CONSTRAINT fk_despacho_correo_documento
                                                             FOREIGN KEY (documento_id) REFERENCES Documento(id),

                                                         CONSTRAINT fk_despacho_correo_usuario
                                                             FOREIGN KEY (enviado_por) REFERENCES Usuario(id)
);

-- Tabla Hitorial Busqueda HU-028
CREATE TABLE Historial_Busqueda (
                                    id INT NOT NULL AUTO_INCREMENT,
                                    usuario_id INT NOT NULL,
                                    texto_busqueda VARCHAR(255) NOT NULL,
                                    filtros JSON NULL,
                                    fecha_consulta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                    PRIMARY KEY (id),

                                    INDEX idx_historial_busqueda_usuario (usuario_id),
                                    INDEX idx_historial_busqueda_fecha (fecha_consulta),
                                    INDEX idx_historial_busqueda_usuario_fecha (usuario_id, fecha_consulta),

                                    CONSTRAINT fk_historial_busqueda_usuario
                                        FOREIGN KEY (usuario_id)
                                            REFERENCES Usuario (id)
                                            ON DELETE CASCADE
                                            ON UPDATE CASCADE
);

-- Tabla Historial Busqueda SOLO SI LE HACE FALTA LA COLUMNA DE FILTROS
ALTER TABLE Historial_Busqueda
    ADD COLUMN filtros JSON NULL;

-- Fin del script.