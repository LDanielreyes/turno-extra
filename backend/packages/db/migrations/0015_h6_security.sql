GRANT SELECT, INSERT, UPDATE ON disputes TO turnoextra_app;
--> statement-breakpoint
-- Disputas: aisladas por org (la org activa o el contexto de sistema). Sin DELETE: quedan como evidencia.
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY disputes_isolation ON disputes TO turnoextra_app
  USING (org_id = app_org_id() OR app_is_super()) WITH CHECK (org_id = app_org_id() OR app_is_super());
