-- Rol de aplicación: sin BYPASSRLS, sin ser dueño de las tablas.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnoextra_app') THEN
    CREATE ROLE turnoextra_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO turnoextra_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON orgs, workers, org_workers TO turnoextra_app;
--> statement-breakpoint
-- audit_log: solo-insert para la app (T11).
GRANT SELECT, INSERT ON audit_log TO turnoextra_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE audit_log_id_seq TO turnoextra_app;
--> statement-breakpoint
-- La org activa viaja en `SET LOCAL app.org_id`; sin ella, cero filas (T21).
CREATE FUNCTION app_org_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_org_id() TO turnoextra_app;
--> statement-breakpoint
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY orgs_isolation ON orgs TO turnoextra_app
  USING (id = app_org_id()) WITH CHECK (id = app_org_id());
--> statement-breakpoint
ALTER TABLE org_workers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE org_workers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY org_workers_isolation ON org_workers TO turnoextra_app
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
-- workers es global: una org solo ve a quienes tienen vínculo con ella.
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY workers_via_org ON workers TO turnoextra_app
  USING (EXISTS (SELECT 1 FROM org_workers ow WHERE ow.worker_id = workers.id AND ow.org_id = app_org_id()));
--> statement-breakpoint
CREATE POLICY workers_insert ON workers FOR INSERT TO turnoextra_app WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_log_isolation ON audit_log TO turnoextra_app
  USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
