CREATE TABLE "demo_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"destinatario" text NOT NULL,
	"texto" text NOT NULL,
	"botones" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"canal" text NOT NULL,
	"external_id" text NOT NULL,
	"worker_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"canal" text NOT NULL,
	"destinatario" text NOT NULL,
	"payload" jsonb NOT NULL,
	"worker_id" uuid,
	"org_id" uuid,
	"estado" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "outbox_estado_ck" CHECK ("outbox"."estado" in ('pending','sending','sent','failed'))
);
--> statement-breakpoint
CREATE TABLE "pending_confirmations" (
	"worker_id" uuid PRIMARY KEY NOT NULL,
	"accion" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_channels" (
	"worker_id" uuid NOT NULL,
	"canal" text NOT NULL,
	"identificador" text NOT NULL,
	"habilitado" boolean DEFAULT false NOT NULL,
	"prioridad" integer DEFAULT 100 NOT NULL,
	"verificado_at" timestamp with time zone,
	CONSTRAINT "worker_channels_worker_id_canal_pk" PRIMARY KEY("worker_id","canal"),
	CONSTRAINT "worker_channels_canal_ck" CHECK ("worker_channels"."canal" in ('whatsapp','telegram','email'))
);
--> statement-breakpoint
CREATE TABLE "worker_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"terms_version_id" uuid,
	"canal" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "invite_code" text DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_confirmations" ADD CONSTRAINT "pending_confirmations_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_channels" ADD CONSTRAINT "worker_channels_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_consents" ADD CONSTRAINT "worker_consents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_consents" ADD CONSTRAINT "worker_consents_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_consents" ADD CONSTRAINT "worker_consents_terms_version_id_terms_versions_id_fk" FOREIGN KEY ("terms_version_id") REFERENCES "public"."terms_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demo_messages_dest_idx" ON "demo_messages" USING btree ("destinatario","id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_messages_ext_uq" ON "inbound_messages" USING btree ("canal","external_id");--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "outbox" USING btree ("estado","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_channels_ident_uq" ON "worker_channels" USING btree ("canal","identificador");--> statement-breakpoint
CREATE INDEX "worker_consents_worker_idx" ON "worker_consents" USING btree ("worker_id");--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_invite_code_unique" UNIQUE("invite_code");