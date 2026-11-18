-- 1) Catálogo inicial de roles y sus documentos obligatorios (doc v2 §5).
--    Se siembra antes de activar RLS en estas tablas.
INSERT INTO roles (slug, nombre) VALUES
  ('mesero', 'Mesero'), ('cocina', 'Cocina'), ('seguridad', 'Seguridad'), ('conductor', 'Conductor')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
INSERT INTO role_requirements (role_id, tipo_documento)
SELECT r.id, d.tipo FROM roles r JOIN (VALUES
  ('mesero', 'carnet_manipulacion_alimentos'),
  ('cocina', 'carnet_manipulacion_alimentos'),
  ('seguridad', 'curso_vigilancia'),
  ('conductor', 'licencia_conduccion')
) AS d(slug, tipo) ON d.slug = r.slug
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 2) Contexto de super admin (SET LOCAL app.is_super = 'on' desde withSuper()).
CREATE FUNCTION app_is_super() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('app.is_super', true), '') = 'on' $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_is_super() TO turnoextra_app;
--> statement-breakpoint
-- 3) Políticas de H0 con excepción de super admin.
DROP POLICY orgs_isolation ON orgs;
--> statement-breakpoint
CREATE POLICY orgs_isolation ON orgs TO turnoextra_app
  USING (id = app_org_id() OR app_is_super()) WITH CHECK (id = app_org_id() OR app_is_super());
--> statement-breakpoint
DROP POLICY org_workers_isolation ON org_workers;
--> statement-breakpoint
CREATE POLICY org_workers_isolation ON org_workers TO turnoextra_app
  USING (org_id = app_org_id() OR app_is_super()) WITH CHECK (org_id = app_org_id() OR app_is_super());
--> statement-breakpoint
DROP POLICY workers_via_org ON workers;
--> statement-breakpoint
CREATE POLICY workers_via_org ON workers TO turnoextra_app
  USING (app_is_super() OR EXISTS (SELECT 1 FROM org_workers ow WHERE ow.worker_id = workers.id AND ow.org_id = app_org_id()));
--> statement-breakpoint
DROP POLICY audit_log_isolation ON audit_log;
--> statement-breakpoint
CREATE POLICY audit_log_isolation ON audit_log TO turnoextra_app
  USING (org_id = app_org_id() OR app_is_super()) WITH CHECK (org_id = app_org_id() OR app_is_super());
--> statement-breakpoint
-- 4) Tablas de Better Auth: sin RLS (la sesión se resuelve antes de conocer la org); acceso solo del rol de app.
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", session, account, verification, two_factor, organization, member, invitation TO turnoextra_app;
--> statement-breakpoint
-- 5) Dominio por org: aislamiento por org_id.
GRANT SELECT, INSERT, UPDATE, DELETE ON org_terms, org_roles TO turnoextra_app;
--> statement-breakpoint
ALTER TABLE org_terms ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY org_terms_isolation ON org_terms TO turnoextra_app
  USING (org_id = app_org_id() OR app_is_super()) WITH CHECK (org_id = app_org_id() OR app_is_super());
--> statement-breakpoint
ALTER TABLE org_roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY org_roles_isolation ON org_roles TO turnoextra_app
  USING (org_id = app_org_id() OR app_is_super()) WITH CHECK (org_id = app_org_id() OR app_is_super());
--> statement-breakpoint
-- 6) Catálogos globales: todos leen, solo el super admin escribe.
GRANT SELECT, INSERT, UPDATE, DELETE ON terms_versions, roles, role_requirements TO turnoextra_app;
--> statement-breakpoint
ALTER TABLE terms_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY terms_versions_read ON terms_versions FOR SELECT TO turnoextra_app USING (true);
--> statement-breakpoint
CREATE POLICY terms_versions_write ON terms_versions FOR ALL TO turnoextra_app
  USING (app_is_super()) WITH CHECK (app_is_super());
--> statement-breakpoint
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY roles_read ON roles FOR SELECT TO turnoextra_app USING (true);
--> statement-breakpoint
CREATE POLICY roles_write ON roles FOR ALL TO turnoextra_app USING (app_is_super()) WITH CHECK (app_is_super());
--> statement-breakpoint
ALTER TABLE role_requirements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY role_requirements_read ON role_requirements FOR SELECT TO turnoextra_app USING (true);
--> statement-breakpoint
CREATE POLICY role_requirements_write ON role_requirements FOR ALL TO turnoextra_app
  USING (app_is_super()) WITH CHECK (app_is_super());
--> statement-breakpoint
-- 7) Máximo 3 administradores por organización (T20), también a nivel de BD.
CREATE FUNCTION enforce_max_org_admins() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role ~ '(^|,)admin(,|$)' THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.organization_id));
    IF (SELECT count(*) FROM member
        WHERE organization_id = NEW.organization_id AND id <> NEW.id AND role ~ '(^|,)admin(,|$)') >= 3 THEN
      RAISE EXCEPTION 'max_org_admins_exceeded' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER member_max_admins BEFORE INSERT OR UPDATE OF role, organization_id ON member
  FOR EACH ROW EXECUTE FUNCTION enforce_max_org_admins();
