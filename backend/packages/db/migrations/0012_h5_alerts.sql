CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"urgente" boolean DEFAULT false NOT NULL,
	"shift_id" uuid,
	"worker_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"atendida_at" timestamp with time zone,
	"atendida_por" text,
	CONSTRAINT "alerts_tipo_ck" CHECK ("alerts"."tipo" in ('cancelacion_asistencia','baja_con_turnos','turno_vencido','disputa_abierta'))
);
--> statement-breakpoint
CREATE TABLE "manager_contacts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"celular" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"user_id" text NOT NULL,
	"evento" text NOT NULL,
	"panel" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"whatsapp" boolean DEFAULT false NOT NULL,
	CONSTRAINT "notification_prefs_user_id_evento_pk" PRIMARY KEY("user_id","evento"),
	CONSTRAINT "notification_prefs_evento_ck" CHECK ("notification_prefs"."evento" in ('cancelacion_asistencia','baja_con_turnos','turno_vencido','disputa_abierta'))
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_org_idx" ON "alerts" USING btree ("org_id","created_at");