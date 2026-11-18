GRANT SELECT, INSERT, UPDATE, DELETE ON shift_offers, offer_deliveries, channel_link_codes TO turnoextra_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE offer_deliveries_id_seq TO turnoextra_app;
--> statement-breakpoint
ALTER TABLE shift_offers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY shift_offers_isolation ON shift_offers TO turnoextra_app
  USING (org_id = app_org_id() OR app_is_super()) WITH CHECK (org_id = app_org_id() OR app_is_super());
--> statement-breakpoint
ALTER TABLE offer_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY offer_deliveries_isolation ON offer_deliveries TO turnoextra_app
  USING (org_id = app_org_id() OR app_is_super()) WITH CHECK (org_id = app_org_id() OR app_is_super());
--> statement-breakpoint
-- Códigos de vinculación: solo el proceso del sistema.
ALTER TABLE channel_link_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY channel_link_codes_system ON channel_link_codes TO turnoextra_app USING (app_is_super()) WITH CHECK (app_is_super());
