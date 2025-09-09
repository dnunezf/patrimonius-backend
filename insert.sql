-- Poblar la tabla Unidad_Organizacional con el organigrama del Museo Nacional
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
                                                                  
                                                                                           
                                                                                           
                                                                                           
