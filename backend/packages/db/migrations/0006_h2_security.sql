-- FK de org_workers.role_id (omitida en el esquema Drizzle por import circular).
ALTER TABLE org_workers ADD CONSTRAINT org_workers_role_id_fk FOREIGN KEY (role_id) REFERENCES roles(id);
--> statement-breakpoint
-- Parámetros legales iniciales (handoff §5). Todos por validar con contador/abogado laboralista.
INSERT INTO legal_params (clave, valor, vigente_desde, nota) VALUES
  ('smmlv', 1750905, '2026-01-01', 'Por validar con el decreto del salario mínimo'),
  ('divisor_horas', 210, '2026-01-01', 'Divisor mensual de horas; por validar'),
  ('recargo_nocturno', 0.35, '2026-01-01', 'Recargo nocturno desde las 19:00; por validar'),
  ('nocturno_desde_hora', 19, '2026-01-01', 'Hora local de inicio del trabajo nocturno'),
  ('nocturno_hasta_hora', 6, '2026-01-01', 'Hora local de fin del trabajo nocturno'),
  ('recargo_dominical', 0.90, '2026-07-01', 'ATENCIÓN: fecha de vigencia sin confirmar (1 vs 15 de julio); por validar')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON worker_documents, shifts, assignments TO turnoextra_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON legal_params TO turnoextra_app;
--> statement-breakpoint
ALTER TABLE legal_params ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY legal_params_read ON legal_params FOR SELECT TO turnoextra_app USING (true);
--> statement-breakpoint
CREATE POLICY legal_params_write ON legal_params FOR ALL TO turnoextra_app USING (app_is_super()) WITH CHECK (app_is_super());
--> statement-breakpoint
ALTER TABLE worker_documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY worker_documents_isolation ON worker_documents TO turnoextra_app
  USING (org_id = app_org_id() OR app_is_super()) WITH CHECK (org_id = app_org_id() OR app_is_super());
--> statement-breakpoint
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY shifts_isolation ON shifts TO turnoextra_app
  USING (org_id = app_org_id() OR app_is_super()) WITH CHECK (org_id = app_org_id() OR app_is_super());
--> statement-breakpoint
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY assignments_isolation ON assignments TO turnoextra_app
  USING (org_id = app_org_id() OR app_is_super()) WITH CHECK (org_id = app_org_id() OR app_is_super());
--> statement-breakpoint
-- `workers` es global y el rol de app no ve a quienes no tienen vínculo con su org.
-- ensure_worker devuelve solo el id (sin revelar nombre ni vínculos) para deduplicar por celular.
CREATE FUNCTION ensure_worker(p_celular text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO workers (celular) VALUES (p_celular) ON CONFLICT (celular) DO NOTHING;
  SELECT id INTO v_id FROM workers WHERE celular = p_celular;
  RETURN v_id;
END $$;
--> statement-breakpoint
-- Disponibilidad entre organizaciones: solo devuelve un booleano / horas, nunca datos de otras orgs.
-- Hay choque si el turno (más el descanso mínimo a cada lado) se traslapa con uno confirmado.
CREATE FUNCTION worker_is_busy(p_worker uuid, p_start timestamptz, p_end timestamptz, p_rest_hours int)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM assignments a JOIN shifts s ON s.id = a.shift_id
    WHERE a.worker_id = p_worker AND a.status = 'confirmed' AND s.estado IN ('abierto', 'cubierto')
      AND s.inicio < p_end + make_interval(hours => p_rest_hours)
      AND s.fin + make_interval(hours => p_rest_hours) > p_start)
$$;
--> statement-breakpoint
-- Horas confirmadas en la semana (lunes a domingo, hora de Bogotá) que contiene `p_start`.
CREATE FUNCTION worker_week_hours(p_worker uuid, p_start timestamptz)
  RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH w AS (SELECT date_trunc('week', p_start AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota' AS ini)
  SELECT coalesce(sum(extract(epoch FROM (s.fin - s.inicio)) / 3600), 0)
  FROM assignments a JOIN shifts s ON s.id = a.shift_id, w
  WHERE a.worker_id = p_worker AND a.status = 'confirmed' AND s.estado IN ('abierto', 'cubierto')
    AND s.inicio >= w.ini AND s.inicio < w.ini + interval '7 days'
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION ensure_worker(text), worker_is_busy(uuid, timestamptz, timestamptz, int), worker_week_hours(uuid, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION ensure_worker(text), worker_is_busy(uuid, timestamptz, timestamptz, int), worker_week_hours(uuid, timestamptz) TO turnoextra_app;
