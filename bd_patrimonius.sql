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
  rol_id INT NOT NULL,
  unidad_id INT NOT NULL,
  CONSTRAINT PK_Usuario PRIMARY KEY (id),
  CONSTRAINT FK_Usuario_Rol FOREIGN KEY (rol_id) REFERENCES Rol(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_Usuario_Unidad FOREIGN KEY (unidad_id) REFERENCES Unidad_Organizacional(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

ALTER TABLE Usuario
ADD COLUMN last2FACode VARCHAR(6),
ADD COLUMN last2FAExpiry DATETIME;

ALTER TABLE Usuario
ADD COLUMN mustChangePassword BOOLEAN NOT NULL DEFAULT TRUE
AFTER password;

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
  estado ENUM('CREACION','EDICION','FIRMA','FIRMA_PARCIAL','ARCHIVADO','ELIMINACION','TRANSFERENCIA') NOT NULL,
  firmas_obtenidas INT DEFAULT 0,
  numero_firmas INT DEFAULT 0,
  confid_level ENUM('PUBLIC','INTERNAL','HIGH','RESTRICTED') NOT NULL DEFAULT 'PUBLIC',
  fecha DATETIME NOT NULL,
  unidad_id INT NOT NULL,
  usuario_id INT NOT NULL,
  categoria_id INT NULL,
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
  PRIMARY KEY (id),
  CONSTRAINT FK_Comentario_Usuario FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_Comentario_Documento FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

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
  evento ENUM('CREACION','EDICION','FIRMA','FIRMA_PARCIAL','ARCHIVADO','ELIMINACION','TRANSFERENCIA') NOT NULL,
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
  resultado VARCHAR(150),
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
    d.titulo AS documento_titulo,
    d.numero_serie AS documento_codigo,
    d.estado AS documento_estado,
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
     )
LEFT JOIN Categoria c ON c.id = d.categoria_id;

-- =========================
-- Trigger
-- =========================
DELIMITER $$
CREATE TRIGGER trg_insert_permission
AFTER INSERT ON Permiso_Usuario
FOR EACH ROW
BEGIN
  DECLARE Vaccion VARCHAR(150);
  DECLARE Vresultado VARCHAR(150);
  SET Vaccion = 'Asignación de permiso';
  SET Vresultado = CONCAT('Permiso ', NEW.permiso, ' asignado al usuario con ID ', NEW.usuario_id, ' para el documento con ID ', NEW.documento_id);
  INSERT INTO Bitacora_Permisos (fecha, accion, resultado, usuario_id, documento_id, permiso)
  VALUES (NOW(), Vaccion, Vresultado, NEW.usuario_id, NEW.documento_id, NEW.permiso);
END$$
DELIMITER ;



-- Tabla para sesiones de edición colaborativa
CREATE TABLE IF NOT EXISTS Documento_Edit_Session (
  documento_id INT NOT NULL,
  usuario_id   INT NOT NULL,
  last_seen    DATETIME NOT NULL,
  PRIMARY KEY (documento_id, usuario_id),
  CONSTRAINT FK_DES_Doc FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_DES_User FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE CASCADE
);
-- Fin del script.
-- Inserts 
USE BD_PATRIMONIUS;

-- =========================
-- Roles
-- =========================
INSERT INTO Rol (nombre, descripcion) VALUES
  ('ADMIN', 'Administrador general del sistema'),
  ('EDITOR', 'Usuario con permisos de edición de documentos'),
  ('ARCHIVISTA', 'Encargado de la gestión documental y archivo'),
  ('USUARIO', 'Usuario interno con acceso básico'),
  ('USUARIO_EXTERNO', 'Usuario externo con permisos limitados');

-- =========================
-- Unidades Organizacionales
-- =========================
INSERT INTO Unidad_Organizacional (nombre, descripcion) VALUES
  ('Dirección General', 'Órgano principal de dirección'),
  ('Archivo Central', 'Unidad encargada de la gestión archivística'),
  ('Tecnologías de Información', 'Área de soporte técnico y sistemas'),
  ('Recursos Humanos', 'Gestión del personal y talento humano');

-- =========================
-- Usuarios base
-- (password = 'changeme' por defecto, mustChangePassword = TRUE)
INSERT INTO Usuario (nombre, apellido1, apellido2, email, password, mustChangePassword, rol_id, unidad_id)
VALUES
  ('Ana', 'Admin', 'Base', 'admin@patrimonius.local', 'changeme', TRUE,
    (SELECT id FROM Rol WHERE nombre='ADMIN'),
    (SELECT id FROM Unidad_Organizacional WHERE nombre='Dirección General')),

  ('Carlos', 'Editor', 'Base', 'editor@patrimonius.local', 'changeme', TRUE,
    (SELECT id FROM Rol WHERE nombre='EDITOR'),
    (SELECT id FROM Unidad_Organizacional WHERE nombre='Archivo Central')),

  ('María', 'Archivista', 'Base', 'archivista@patrimonius.local', 'changeme', TRUE,
    (SELECT id FROM Rol WHERE nombre='ARCHIVISTA'),
    (SELECT id FROM Unidad_Organizacional WHERE nombre='Archivo Central')),

  ('José', 'Usuario', 'Interno', 'usuario@patrimonius.local', 'changeme', TRUE,
    (SELECT id FROM Rol WHERE nombre='USUARIO'),
    (SELECT id FROM Unidad_Organizacional WHERE nombre='Recursos Humanos')),

  ('Laura', 'Externa', 'Prueba', 'externo@patrimonius.local', 'changeme', TRUE,
    (SELECT id FROM Rol WHERE nombre='USUARIO_EXTERNO'),
    (SELECT id FROM Unidad_Organizacional WHERE nombre='Tecnologías de Información'));

-- =========================
-- Categorías de Documentos
-- =========================
INSERT INTO Categoria (nombre, descripcion) VALUES
  ('Oficios', 'Oficios y comunicaciones internas'),
  ('Resoluciones', 'Resoluciones y acuerdos oficiales'),
  ('Contratos', 'Contratos y convenios legales'),
  ('Informes', 'Informes técnicos y administrativos');

