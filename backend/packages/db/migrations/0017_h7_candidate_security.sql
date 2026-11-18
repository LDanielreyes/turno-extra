GRANT SELECT, INSERT, UPDATE, DELETE ON candidate_login_codes TO turnoextra_app;
--> statement-breakpoint
-- Códigos de acceso del candidato (dato de acceso): solo el proceso del sistema los lee y escribe.
ALTER TABLE candidate_login_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY candidate_login_codes_system ON candidate_login_codes TO turnoextra_app USING (app_is_super()) WITH CHECK (app_is_super());
