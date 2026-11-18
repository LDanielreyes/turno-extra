CREATE TABLE "channel_link_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"worker_id" uuid NOT NULL,
	"canal" text NOT NULL,
	"identificador" text,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"canal" text NOT NULL,
	"external_id" text,
	"estado" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"wave" integer DEFAULT 1 NOT NULL,
	"canal_usado" text,
	"responded_at" timestamp with time zone,
	"responded_canal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_offers_status_ck" CHECK ("shift_offers"."status" in ('queued','sent','delivered','read','accepted','declined','cancelled','expired','undeliverable'))
);
--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "wave_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "last_wave_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "offer_id" uuid;--> statement-breakpoint
ALTER TABLE "channel_link_codes" ADD CONSTRAINT "channel_link_codes_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_deliveries" ADD CONSTRAINT "offer_deliveries_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_deliveries" ADD CONSTRAINT "offer_deliveries_offer_id_shift_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."shift_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_offers" ADD CONSTRAINT "shift_offers_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_offers" ADD CONSTRAINT "shift_offers_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_offers" ADD CONSTRAINT "shift_offers_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offer_deliveries_ext_uq" ON "offer_deliveries" USING btree ("canal","external_id");--> statement-breakpoint
CREATE INDEX "offer_deliveries_offer_idx" ON "offer_deliveries" USING btree ("offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_offers_shift_worker_uq" ON "shift_offers" USING btree ("shift_id","worker_id");--> statement-breakpoint
CREATE INDEX "shift_offers_worker_idx" ON "shift_offers" USING btree ("worker_id","status");