GRANT SELECT, INSERT, UPDATE, DELETE ON alerts, notification_prefs, manager_contacts TO turnoextra_app;
--> statement-breakpoint
-- Alertas: aisladas por org (la org activa o el contexto de sistema).
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY alerts_isolation ON alerts TO turnoextra_app
  USING (org_id = app_org_id() OR app_is_super()) WITH CHECK (org_id = app_org_id() OR app_is_super());
--> statement-breakpoint
-- Contacto de WhatsApp del gerente (dato personal): solo el proceso del sistema lo lee y escribe.
ALTER TABLE manager_contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY manager_contacts_system ON manager_contacts TO turnoextra_app USING (app_is_super()) WITH CHECK (app_is_super());
