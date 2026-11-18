CREATE TYPE "public"."assign_status" AS ENUM('confirmed', 'standby', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."shift_estado" AS ENUM('abierto', 'cubierto', 'cancelado', 'vencido', 'completado');--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"status" "assign_status" DEFAULT 'confirmed' NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_params" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clave" text NOT NULL,
	"valor" numeric(18, 4) NOT NULL,
	"vigente_desde" date NOT NULL,
	"nota" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"cupos" integer NOT NULL,
	"pago_total" numeric(14, 0) NOT NULL,
	"piso_calculado" numeric(14, 0) NOT NULL,
	"estado" "shift_estado" DEFAULT 'abierto' NOT NULL,
	"relaunches" integer DEFAULT 0 NOT NULL,
	"visibilidad" text DEFAULT 'privada' NOT NULL,
	"notas" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_cupos_ck" CHECK ("shifts"."cupos" between 1 and 50),
	CONSTRAINT "shifts_horas_ck" CHECK ("shifts"."fin" > "shifts"."inicio"),
	CONSTRAINT "shifts_visibilidad_ck" CHECK ("shifts"."visibilidad" in ('privada','publica'))
);
--> statement-breakpoint
CREATE TABLE "worker_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"tipo_documento" text NOT NULL,
	"vence_at" date,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"revisado_por" text,
	"revisado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_documents_estado_ck" CHECK ("worker_documents"."estado" in ('pendiente','aprobado','rechazado'))
);
--> statement-breakpoint
ALTER TABLE "org_workers" ADD COLUMN "nombre" text NOT NULL;--> statement-breakpoint
ALTER TABLE "org_workers" ADD COLUMN "role_id" uuid;--> statement-breakpoint
ALTER TABLE "org_workers" ADD COLUMN "favorito" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "standby_max" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "relaunch_limit" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_documents" ADD CONSTRAINT "worker_documents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_documents" ADD CONSTRAINT "worker_documents_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_shift_worker_uq" ON "assignments" USING btree ("shift_id","worker_id");--> statement-breakpoint
CREATE INDEX "assignments_worker_idx" ON "assignments" USING btree ("worker_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_params_clave_desde_uq" ON "legal_params" USING btree ("clave","vigente_desde");--> statement-breakpoint
CREATE INDEX "shifts_org_inicio_idx" ON "shifts" USING btree ("org_id","inicio");--> statement-breakpoint
CREATE INDEX "worker_documents_lookup_idx" ON "worker_documents" USING btree ("org_id","worker_id","tipo_documento");--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_celular_unique" UNIQUE("celular");