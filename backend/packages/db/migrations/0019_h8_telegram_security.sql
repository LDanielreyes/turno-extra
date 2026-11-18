GRANT SELECT, INSERT, UPDATE, DELETE ON telegram_alta_pending, manager_telegram TO turnoextra_app;
--> statement-breakpoint
-- Alta por Telegram en curso (dato de acceso): solo el proceso del sistema la lee y escribe.
ALTER TABLE telegram_alta_pending ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY telegram_alta_pending_system ON telegram_alta_pending TO turnoextra_app USING (app_is_super()) WITH CHECK (app_is_super());
--> statement-breakpoint
-- Telegram del gerente: igual que manager_contacts, solo contexto de sistema.
ALTER TABLE manager_telegram ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY manager_telegram_system ON manager_telegram TO turnoextra_app USING (app_is_super()) WITH CHECK (app_is_super());
