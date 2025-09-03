-- Patrimonius – BD_PATRIMONIUS

CREATE DATABASE BD_PATRIMONIUS
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
USE BD_PATRIMONIUS;

CREATE TABLE Rol (
  id            INT AUTO_INCREMENT,
  nombre        VARCHAR(100) NOT NULL,
  descripcion   TEXT,
  CONSTRAINT PK_Rol PRIMARY KEY (id),
  CONSTRAINT UQ_Rol_nombre UNIQUE (nombre)
);

CREATE TABLE Unidad_Organizacional (
  id            INT AUTO_INCREMENT,
  nombre        VARCHAR(150) NOT NULL,
  descripcion   TEXT,
  CONSTRAINT PK_Unidad PRIMARY KEY (id),
  CONSTRAINT UQ_Unidad_nombre UNIQUE (nombre)
);

CREATE TABLE Usuario (
  id            INT AUTO_INCREMENT,
  nombre        VARCHAR(120)  NOT NULL,
  apellido1     VARCHAR(120)  NOT NULL,
  apellido2     VARCHAR(120),
  rol_id        INT           NOT NULL,
  unidad_id     INT           NOT NULL,
  CONSTRAINT PK_Usuario PRIMARY KEY (id),
  CONSTRAINT FK_Usuario_Rol
    FOREIGN KEY (rol_id) REFERENCES Rol(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_Usuario_Unidad
    FOREIGN KEY (unidad_id) REFERENCES Unidad_Organizacional(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE Categoria (
  id            INT AUTO_INCREMENT,
  nombre        VARCHAR(120) NOT NULL,
  descripcion   TEXT,
  CONSTRAINT PK_Categoria PRIMARY KEY (id),
  CONSTRAINT UQ_Categoria_nombre UNIQUE (nombre)
);

CREATE TABLE Catalogo (
  id            INT AUTO_INCREMENT,
  nombre        VARCHAR(120) NOT NULL,
  tipo          VARCHAR(60)  NOT NULL,
  descripcion   TEXT,
  CONSTRAINT PK_Catalogo PRIMARY KEY (id)
);

CREATE TABLE Plantilla (
  id            INT AUTO_INCREMENT,
  nombre        VARCHAR(150) NOT NULL,
  descripcion   TEXT,
  version       VARCHAR(30)  NOT NULL,
  ruta_archivo  VARCHAR(255) NOT NULL,
  CONSTRAINT PK_Plantilla PRIMARY KEY (id),
  CONSTRAINT UQ_Plantilla_nombre_version UNIQUE (nombre, version)
);

CREATE TABLE Imagen (
  id            INT AUTO_INCREMENT,
  nombre        VARCHAR(150) NOT NULL,
  ruta_archivo  VARCHAR(255) NOT NULL,
  tipo          VARCHAR(50),
  CONSTRAINT PK_Imagen PRIMARY KEY (id)
);

CREATE TABLE Documento (
  id            INT AUTO_INCREMENT,
  numero_serie  VARCHAR(60)  NOT NULL,
  titulo        VARCHAR(255) NOT NULL,
  contenido     LONGTEXT,
  estado        VARCHAR(40)  NOT NULL,
  fecha         DATETIME     NOT NULL,
  unidad_id     INT          NOT NULL,
  usuario_id    INT          NOT NULL,
  categoria_id  INT          NULL,
  CONSTRAINT PK_Documento PRIMARY KEY (id),
  CONSTRAINT UQ_Documento_numero UNIQUE (numero_serie),
  CONSTRAINT FK_Documento_Unidad
    FOREIGN KEY (unidad_id) REFERENCES Unidad_Organizacional(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_Documento_Usuario
    FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_Documento_Categoria
    FOREIGN KEY (categoria_id) REFERENCES Categoria(id)
    ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE Version_Documento (
  id            INT AUTO_INCREMENT,
  fecha         DATETIME     NOT NULL,
  contenido     LONGTEXT     NOT NULL,
  documento_id  INT          NOT NULL,
  CONSTRAINT PK_Version PRIMARY KEY (id),
  CONSTRAINT FK_Version_Documento
    FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE Metadato (
  id            INT AUTO_INCREMENT,
  tipo          VARCHAR(60)  NOT NULL,
  documento_id  INT          NOT NULL,
  valor         TEXT         NOT NULL,
  CONSTRAINT PK_Metadato PRIMARY KEY (id),
  CONSTRAINT FK_Metadato_Documento
    FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

-- Relaciones N:M -- AQUI VAMOS A TRATAR LAS TABLAS INTERMEDIAS --
CREATE TABLE Documento_Plantilla (
  documento_id  INT NOT NULL,
  plantilla_id  INT NOT NULL,
  CONSTRAINT PK_Documento_Plantilla PRIMARY KEY (documento_id, plantilla_id),
  CONSTRAINT FK_DocPlant_Documento
    FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_DocPlant_Plantilla
    FOREIGN KEY (plantilla_id) REFERENCES Plantilla(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE Documento_Catalogo (
  documento_id  INT NOT NULL,
  catalogo_id   INT NOT NULL,
  CONSTRAINT PK_Documento_Catalogo PRIMARY KEY (documento_id, catalogo_id),
  CONSTRAINT FK_DocCat_Documento
    FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_DocCat_Catalogo
    FOREIGN KEY (catalogo_id) REFERENCES Catalogo(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE Plantilla_Imagen (
  plantilla_id  INT NOT NULL,
  imagen_id     INT NOT NULL,
  CONSTRAINT PK_Plantilla_Imagen PRIMARY KEY (plantilla_id, imagen_id),
  CONSTRAINT FK_PlaImg_Plantilla
    FOREIGN KEY (plantilla_id) REFERENCES Plantilla(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_PlaImg_Imagen
    FOREIGN KEY (imagen_id) REFERENCES Imagen(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE Firma_Digital (
  id            INT AUTO_INCREMENT,
  fecha         DATETIME     NOT NULL,
  documento_id  INT          NOT NULL,
  usuario_id    INT          NOT NULL,
  CONSTRAINT PK_Firma PRIMARY KEY (id),
  CONSTRAINT FK_Firma_Documento
    FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT FK_Firma_Usuario
    FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE Indice_Electronico (
  id            INT AUTO_INCREMENT,
  hash          VARCHAR(128) NOT NULL,
  fecha         DATETIME     NOT NULL,
  firma_id      INT          NOT NULL,
  CONSTRAINT PK_Indice PRIMARY KEY (id),
  CONSTRAINT UQ_Indice_hash UNIQUE (hash),
  CONSTRAINT FK_Indice_Firma
    FOREIGN KEY (firma_id) REFERENCES Firma_Digital(id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE Bitacora_Base (
  id            INT AUTO_INCREMENT,
  fecha         DATETIME     NOT NULL,
  accion        VARCHAR(150) NOT NULL,
  resultado     VARCHAR(150),
  usuario_id    INT          NOT NULL,
  documento_id  INT          NOT NULL,
  CONSTRAINT PK_Bitacora_Base PRIMARY KEY (id),
  CONSTRAINT FK_BitacoraBase_Usuario
    FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_BitacoraBase_Documento
    FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE
);


CREATE TABLE Bitacora_Ciclo_Documental (
  id       INT,
  evento   ENUM('CREACION','EDICION','FIRMA','ARCHIVADO','ELIMINACION','TRANSFERENCIA') NOT NULL,
  detalle  JSON NULL,
  CONSTRAINT PK_BCD PRIMARY KEY (id),
  CONSTRAINT FK_BCD_Base FOREIGN KEY (id) REFERENCES Bitacora_Base(id)
    ON UPDATE CASCADE ON DELETE CASCADE
);


CREATE TABLE Bitacora_Seguridad (
  id          INT,
  tipo_evento ENUM('LOGIN','AUTENTICACION','FALLO_LOGIN','ACCESO_NO_AUTORIZADO','ACTIVIDAD_SEGURIDAD') NOT NULL,
  ip          VARCHAR(45),
  user_agent  VARCHAR(255),
  detalle     JSON NULL,
  CONSTRAINT PK_BS PRIMARY KEY (id),
  CONSTRAINT FK_BS_Base FOREIGN KEY (id) REFERENCES Bitacora_Base(id)
    ON UPDATE CASCADE ON DELETE CASCADE
);


CREATE TABLE Bitacora_Actividad_Usuario (
  id         INT,
  actividad  ENUM('VISTA','BUSQUEDA','DESCARGA','NAVEGACION','OTRA') NOT NULL,
  recurso    VARCHAR(255),
  parametros JSON NULL,
  CONSTRAINT PK_BAU PRIMARY KEY (id),
  CONSTRAINT FK_BAU_Base FOREIGN KEY (id) REFERENCES Bitacora_Base(id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

-- Vista de compatibilidad
CREATE VIEW Bitacora AS
  SELECT b.*, 'CICLO_DOCUMENTAL' AS sub_tipo, c.evento AS sub_evento
    FROM Bitacora_Base b JOIN Bitacora_Ciclo_Documental c ON c.id = b.id
  UNION ALL
  SELECT b.*, 'SEGURIDAD', s.tipo_evento
    FROM Bitacora_Base b JOIN Bitacora_Seguridad s ON s.id = b.id
  UNION ALL
  SELECT b.*, 'ACTIVIDAD_USUARIO', a.actividad
    FROM Bitacora_Base b JOIN Bitacora_Actividad_Usuario a ON a.id = b.id;


CREATE TABLE Notificacion (
  id            INT AUTO_INCREMENT,
  fecha         DATETIME     NOT NULL,
  tipo          VARCHAR(60)  NOT NULL,
  resultado     VARCHAR(150),
  usuario_id    INT          NOT NULL,
  documento_id  INT          NOT NULL,
  CONSTRAINT PK_Notificacion PRIMARY KEY (id),
  CONSTRAINT FK_Noti_Usuario
    FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_Noti_Documento
    FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE Comentario (
  id            INT AUTO_INCREMENT,
  descripcion   TEXT         NOT NULL,
  usuario_id    INT          NOT NULL,
  documento_id  INT          NOT NULL,
  CONSTRAINT PK_Comentario PRIMARY KEY (id),
  CONSTRAINT FK_Comentario_Usuario
    FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT FK_Comentario_Documento
    FOREIGN KEY (documento_id) REFERENCES Documento(id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

-- Email para cumplir entradas del HU-001
ALTER TABLE Usuario ADD COLUMN email VARCHAR(150) NOT NULL UNIQUE AFTER apellido2;

-- Permisos exclusivos para nuestro rol de "Editor"
CREATE TABLE Permiso_Usuario (
  usuario_id INT NOT NULL,
  permiso ENUM('EDIT','SIGN') NOT NULL,
  CONSTRAINT PK_Permiso_Usuario PRIMARY KEY (usuario_id, permiso),
  CONSTRAINT FK_PU_Usuario FOREIGN KEY (usuario_id) REFERENCES Usuario(id)
    ON UPDATE CASCADE ON DELETE CASCADE
);