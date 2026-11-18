ALTER TYPE "public"."assign_status" ADD VALUE 'disputed';--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"motivo" text NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"resuelto_por" text,
	"nota" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "disputes_estado_ck" CHECK ("disputes"."estado" in ('abierta','upheld','reversed'))
);
--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_assignment_uq" ON "disputes" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "disputes_org_idx" ON "disputes" USING btree ("org_id","estado");