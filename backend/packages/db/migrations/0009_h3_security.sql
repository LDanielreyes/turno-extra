-- Datos de contacto y consentimiento: visibles para la org vinculada o el contexto de sistema (super).
GRANT SELECT, INSERT, UPDATE, DELETE ON worker_channels, worker_consents, pending_confirmations, inbound_messages, outbox, demo_messages TO turnoextra_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE inbound_messages_id_seq, outbox_id_seq, demo_messages_id_seq TO turnoextra_app;
--> statement-breakpoint
ALTER TABLE worker_channels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY worker_channels_scope ON worker_channels TO turnoextra_app
  USING (app_is_super() OR EXISTS (SELECT 1 FROM org_workers ow WHERE ow.worker_id = worker_channels.worker_id AND ow.org_id = app_org_id()))
  WITH CHECK (app_is_super());
--> statement-breakpoint
ALTER TABLE worker_consents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY worker_consents_isolation ON worker_consents TO turnoextra_app
  USING (org_id = app_org_id() OR app_is_super()) WITH CHECK (org_id = app_org_id() OR app_is_super());
--> statement-breakpoint
-- Colas y estado de conversación: solo el proceso del sistema (webhook, worker, simulador), nunca el panel de una org.
ALTER TABLE pending_confirmations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pending_confirmations_system ON pending_confirmations TO turnoextra_app USING (app_is_super()) WITH CHECK (app_is_super());
--> statement-breakpoint
ALTER TABLE inbound_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY inbound_messages_system ON inbound_messages TO turnoextra_app USING (app_is_super()) WITH CHECK (app_is_super());
--> statement-breakpoint
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY outbox_system ON outbox TO turnoextra_app USING (app_is_super()) WITH CHECK (app_is_super());
--> statement-breakpoint
ALTER TABLE demo_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY demo_messages_system ON demo_messages TO turnoextra_app USING (app_is_super()) WITH CHECK (app_is_super());
