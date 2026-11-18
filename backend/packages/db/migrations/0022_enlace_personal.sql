CREATE TABLE "worker_invites" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"org_worker_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "worker_invites" ADD CONSTRAINT "worker_invites_org_worker_id_fk" FOREIGN KEY ("org_worker_id") REFERENCES "public"."org_workers"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "worker_invites_ow_idx" ON "worker_invites" USING btree ("org_worker_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON worker_invites TO turnoextra_app;
--> statement-breakpoint
-- Enlace de alta personal (dato de acceso): solo el proceso del sistema lo lee y escribe.
ALTER TABLE worker_invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY worker_invites_system ON worker_invites TO turnoextra_app USING (app_is_super()) WITH CHECK (app_is_super());
