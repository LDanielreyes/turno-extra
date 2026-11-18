-- La cédula se pide a todos los roles (requisito fijo, sin vencimiento).
INSERT INTO role_requirements (role_id, tipo_documento, obligatorio, vigencia_requerida)
SELECT id, 'cedula', true, false FROM roles
ON CONFLICT (role_id, tipo_documento) DO NOTHING;
