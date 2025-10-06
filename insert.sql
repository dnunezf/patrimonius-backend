-- Inserción de unidades organizacionales
INSERT INTO unidad_organizacional (nombre, descripcion) VALUES
('Junta Administrativa', 'Órgano de nivel político encargado de la supervisión y toma de decisiones institucionales.'),
('Auditoría Interna', 'Instancia asesora responsable de fiscalizar la gestión y asegurar el control interno.'),
('Dirección General', 'Nivel directivo que coordina y supervisa todas las áreas del Museo Nacional.'),
('Asesoría Jurídica', 'Instancia asesora encargada de los asuntos legales y normativos de la institución.'),
('Planificación', 'Instancia asesora responsable de la planificación estratégica y operativa del Museo.'),
('Historia Natural', 'Departamento operativo dedicado al estudio, conservación y divulgación del patrimonio natural.'),
('Protección Patrimonio Cultural', 'Departamento enfocado en la protección, investigación y gestión del patrimonio cultural.'),
('Antropología e Historia', 'Departamento encargado de la investigación, conservación y difusión de la antropología e historia de Costa Rica.'),
('Proyección Museológica', 'Departamento que gestiona la museografía, exposiciones y relación con el público.'),
('Administración y Finanzas', 'Departamento que gestiona recursos financieros, administrativos y de apoyo institucional.'),
('Informática', 'Unidad operativa encargada de la infraestructura tecnológica, sistemas de información y soporte digital.');

-- Inserción de roles básicos
INSERT INTO rol (nombre, descripcion) VALUES
('Administrador', 'Rol con control total del sistema.'),
('Editor', 'Rol para creación y edición de documentos.'),
('Archivista', 'Rol encargado de conservación documental.'),
('Usuario', 'Rol con permisos de consulta interna.'),
('Usuario Externo', 'Rol con acceso restringido de consulta.');



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
                                                                                           
                                                                                           
                                                                                           
 -- Asegúrate de tener al menos 1 Rol y 1 Unidad_Organizacional (ya los tienes en tu seed).
-- Crea el usuario SYSTEM si no existe:
INSERT INTO Usuario (nombre, apellido1, apellido2, email, rol_id, unidad_id, password)
SELECT 'SYSTEM','SYSTEM','', 'system@internal',
       (SELECT id FROM Rol WHERE nombre = 'ADMINISTRADOR' LIMIT 1),
       (SELECT id FROM Unidad_Organizacional LIMIT 1),
       -- hash bcrypt válido cualquiera (no se usará para login normal)
       '$2b$10$QeP1Jbq8fVQHLYy0n0nPBe4wFkQf3E2s8t0i1H2b3y4Z5a6b7c8dW'
WHERE NOT EXISTS (SELECT 1 FROM Usuario WHERE email = 'system@internal');                                                                                          
                                                                                           
                                                                                           
 -- Bitácora base: fecha, resultado, usuario, documento
CREATE INDEX idx_bbitacora_fecha       ON Bitacora_Base (fecha);
CREATE INDEX idx_bbitacora_resultado   ON Bitacora_Base (resultado);
CREATE INDEX idx_bbitacora_usuario     ON Bitacora_Base (usuario_id);
CREATE INDEX idx_bbitacora_documento   ON Bitacora_Base (documento_id);

-- Documento: estado y campos de búsqueda frecuentes
CREATE INDEX idx_documento_estado      ON Documento (estado);
CREATE INDEX idx_documento_titulo      ON Documento (titulo);
CREATE INDEX idx_documento_num_serie   ON Documento (numero_serie);

-- Metadato: para CODIGO_OFICIAL usado en la subconsulta
CREATE INDEX idx_metadato_doc_tipo     ON Metadato (documento_id, tipo, valor);


-- Inserción de categorías de prueba para el sistema Patrimonius
INSERT INTO Categoria (nombre, descripcion) VALUES
                                                ('Acta', 'Categoría que incluye todos los documentos relacionados con actas de reuniones, decisiones y acuerdos institucionales.'),
                                                ('Informe', 'Categoría que agrupa todos los documentos relacionados con informes y reportes de actividades, proyectos y eventos.'),
                                                ('Protocolo', 'Categoría que cubre los documentos relacionados con los procedimientos y normativas institucionales.');

-- Inserción de documentos de prueba
INSERT INTO Documento (numero_serie, titulo, contenido, estado, fecha, unidad_id, usuario_id, categoria_id)
VALUES
    ('2023001', 'Informe de actividad de enero', 'Contenido del informe...', 'EDICION', '2023-01-01', 1, 1, 1),
    ('2023002', 'Acta de reunión de febrero', 'Contenido del acta...', 'EDICION', '2023-02-01', 1, 1, 2),
    ('2023003', 'Protocolo de seguridad', 'Contenido del protocolo...', 'EDICION', '2023-03-01', 1, 1, 3);


INSERT INTO Documento (numero_serie, titulo, contenido, estado, fecha, unidad_id, usuario_id, categoria_id)
VALUES
    ('2023004', 'Informe de actividad de enero2', 'Contenido del informe...', 'FIRMA_PARCIAL', '2023-01-01', 1, 1, 1),
    ('2023005', 'Acta de reunión de febrero2', 'Contenido del acta...', 'FIRMA', '2023-02-01', 1, 1, 2),
    ('2023006', 'Protocolo de seguridad2', 'Contenido del protocolo...', 'ELIMINACION', '2023-03-01', 1, 1, 3);

-- Actualizar firmas_obtenidas a 1 cuando el estado es 'FIRMA_PARCIAL'
UPDATE Documento
SET firmas_obtenidas = 1
WHERE estado = 'FIRMA_PARCIAL';

-- Actualizar firmas_obtenidas a 2 cuando el estado es 'FIRMA'
UPDATE Documento
SET numero_firmas = 2
WHERE estado = 'FIRMA_PARCIAL';;

    ('2023001', 'Informe de actividad de enero', 'Contenido del informe...', 'CREACION', '2023-01-01', 1, 1, 2),
    ('2023002', 'Acta de reunión de febrero', 'Contenido del acta...', 'EDICION', '2023-02-01', 1, 1, 1),
    ('2023003', 'Protocolo de seguridad', 'Contenido del protocolo...', 'ARCHIVADO', '2023-03-01', 1, 1, 3);

INSERT INTO Plantilla (nombre, descripcion, version, ruta_archivo)
VALUES ('Plantilla Base', 'Plantilla inicial para pruebas', '1.0', '/plantillas/base.docx');

