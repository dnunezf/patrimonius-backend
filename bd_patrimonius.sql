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


ALTER TABLE Usuario ADD COLUMN password VARCHAR(255) NOT NULL AFTER email;

-- Poblar la tabla Unidad_Organizacional con el organigrama del Museo Nacional
-- Poblar la tabla Unidad_Organizacional siguiendo el Libro de Estándares
INSERT INTO Unidad_Organizacional (nombre, descripcion) VALUES
                                                            ('UO_JUNTA_ADMINISTRATIVA', 'Órgano de nivel político encargado de la supervisión y toma de decisiones institucionales.'),
                                                            ('UO_AUDITORIA_INTERNA', 'Instancia asesora responsable de fiscalizar la gestión y asegurar el control interno.'),
                                                            ('UO_DIRECCION_GENERAL', 'Nivel directivo que coordina y supervisa todas las áreas del Museo Nacional.'),
                                                            ('UO_ASESORIA_JURIDICA', 'Instancia asesora encargada de los asuntos legales y normativos de la institución.'),
                                                            ('UO_PLANIFICACION', 'Instancia asesora responsable de la planificación estratégica y operativa del Museo.'),
                                                            ('UO_HISTORIA_NATURAL', 'Departamento operativo dedicado al estudio, conservación y divulgación del patrimonio natural.'),
                                                            ('UO_PROTECCION_PATRIMONIO_CULTURAL', 'Departamento enfocado en la protección, investigación y gestión del patrimonio cultural.'),
                                                            ('UO_ANTROPOLOGIA_HISTORIA', 'Departamento encargado de la investigación, conservación y difusión de la antropología e historia de Costa Rica.'),
                                                            ('UO_PROYECCION_MUSEOLOGICA', 'Departamento que gestiona la museografía, exposiciones y relación con el público.'),
                                                            ('UO_ADMINISTRACION_FINANZAS', 'Departamento que gestiona recursos financieros, administrativos y de apoyo institucional.'),
                                                            ('UO_INFORMATICA', 'Unidad operativa encargada de la infraestructura tecnológica, sistemas de información y soporte digital.');



-- Inserción de roles básicos (si aún no están creados)
INSERT INTO Rol (nombre, descripcion) VALUES
                                          ('ADMINISTRADOR', 'Rol con control total del sistema'),
                                          ('EDITOR', 'Rol para creación y edición de documentos'),
                                          ('ARCHIVISTA', 'Rol encargado de conservación documental'),
                                          ('USUARIO', 'Rol con permisos de consulta interna'),
                                          ('USUARIO_EXTERNO', 'Rol con acceso restringido de consulta');

-- Inserción de usuarios de prueba
--  Hola_2025_Aa
INSERT INTO Usuario (nombre, apellido1, apellido2, email, rol_id, unidad_id, password) VALUES
                                                                                           ('Editor', 'Prueba', '', 'editor@gmail.com',
                                                                                            (SELECT id FROM Rol WHERE nombre = 'EDITOR'), 1,
                                                                                            '$2b$10$XtccuTipsAXdKwCPKFNcoeRkDX4oQNNpfkGl0JkBgr3GQ1zQn93Tu'
                                                                                           ),
                                                                                           ('Administrador', 'Prueba', '', 'admin@gmail.com',
                                                                                            (SELECT id FROM Rol WHERE nombre = 'ADMINISTRADOR'), 1,
                                                                                            '$2b$10$XtccuTipsAXdKwCPKFNcoeRkDX4oQNNpfkGl0JkBgr3GQ1zQn93Tu'
                                                                                           ),
                                                                                           ('Archivista', 'Prueba', '', 'archivista@gmail.com',
                                                                                            (SELECT id FROM Rol WHERE nombre = 'ARCHIVISTA'), 1,
                                                                                            '$2b$10$XtccuTipsAXdKwCPKFNcoeRkDX4oQNNpfkGl0JkBgr3GQ1zQn93Tu'
                                                                                           ),
                                                                                           ('Usuario', 'Prueba', '', 'usuario@gmail.com',
                                                                                            (SELECT id FROM Rol WHERE nombre = 'USUARIO'), 1,
                                                                                            '$2b$10$XtccuTipsAXdKwCPKFNcoeRkDX4oQNNpfkGl0JkBgr3GQ1zQn93Tu'
                                                                                           ),
                                                                                           ('UsuarioExterno', 'Prueba', '', 'externo@gmail.com',
                                                                                            (SELECT id FROM Rol WHERE nombre = 'USUARIO_EXTERNO'), 1,
                                                                                            '$2b$10$XtccuTipsAXdKwCPKFNcoeRkDX4oQNNpfkGl0JkBgr3GQ1zQn93Tu'
                                                                                           );


ALTER TABLE Bitacora_Base
    MODIFY documento_id INT NULL;

ALTER TABLE Bitacora_Base
    DROP FOREIGN KEY FK_BitacoraBase_Documento;

ALTER TABLE Bitacora_Base
    ADD CONSTRAINT FK_BitacoraBase_Documento
        FOREIGN KEY (documento_id) REFERENCES Documento(id)
            ON DELETE SET NULL
            ON UPDATE CASCADE;


-- Asegúrate de tener al menos 1 Rol y 1 Unidad_Organizacional (ya los tienes en tu seed).
-- Crea el usuario SYSTEM si no existe:
INSERT INTO Usuario (nombre, apellido1, apellido2, email, rol_id, unidad_id, password)
SELECT 'SYSTEM','SYSTEM','', 'system@internal',
       (SELECT id FROM Rol WHERE nombre = 'ADMINISTRADOR' LIMIT 1),
       (SELECT id FROM Unidad_Organizacional LIMIT 1),
       -- hash bcrypt válido cualquiera (no se usará para login normal)
       '$2b$10$QeP1Jbq8fVQHLYy0n0nPBe4wFkQf3E2s8t0i1H2b3y4Z5a6b7c8dW'
WHERE NOT EXISTS (SELECT 1 FROM Usuario WHERE email = 'system@internal');

-- Verifica:
SELECT id, email FROM Usuario WHERE email='system@internal';
