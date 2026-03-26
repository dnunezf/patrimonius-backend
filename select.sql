-- Selección general para verificar contenido de todas las tablas principales

-- Roles
SELECT * FROM Rol;

-- Unidades Organizacionales
SELECT * FROM Unidad_Organizacional;

-- Usuarios
SELECT * FROM Bitacora_Permisos;


-- Categorías
SELECT * FROM Categoria;

-- Catálogos
SELECT * FROM Catalogo;

-- Plantillas
SELECT * FROM Plantilla;

-- Imágenes
SELECT * FROM Imagen;

-- Documentos
SELECT * FROM Documento;

-- Versiones de Documentos
SELECT * FROM Version_Documento;


--DELETE FROM permiso_usuario;
--DELETE FROM Version_Documento;

-- 2) Tabla padre
--DELETE FROM Documento;

-- Metadatos
SELECT * FROM Metadato;

-- Tablas intermedias
SELECT * FROM Documento_Plantilla;
SELECT * FROM Documento_Catalogo;
SELECT * FROM Plantilla_Imagen;

-- Firmas Digitales
SELECT * FROM Firma_Digital;

-- Índices Electrónicos
SELECT * FROM Indice_Electronico;

-- Bitácoras
SELECT * FROM Bitacora_Base;
SELECT * FROM Bitacora_Ciclo_Documental;
SELECT * FROM Bitacora_Seguridad;
SELECT * FROM VW_Bitacora_Ciclo_Documental_Detalle;
SELECT * FROM Bitacora; -- vista de compatibilidad

-- Notificaciones
SELECT * FROM Notificacion;

-- Comentarios
SELECT * FROM Comentario;

-- Permisos de usuario
SELECT * FROM Permiso_Usuario;

SHOW CREATE TABLE Bitacora_Base;

UPDATE Bitacora_Base
SET documento_id = NULL
WHERE documento_id = 0;

SHOW TRIGGERS LIKE 'Bitacora_Base';

-- ¿Hay excepciones para tu admin?
SELECT * FROM Permiso_Usuario WHERE usuario_id = 1;

-- ¿Hay overrides de usuario?
SELECT * FROM Documento_Allowed_User WHERE usuario_id = 1;

-- ¿Hay overrides de rol?
SELECT * FROM Documento_Allowed_Rol WHERE rol_id = (SELECT rol_id FROM Usuario WHERE id = 1);

SELECT id, email, mustChangePassword FROM Usuario WHERE email = 'mjca1523@gmail.com';


