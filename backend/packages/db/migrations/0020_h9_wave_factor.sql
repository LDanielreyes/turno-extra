ALTER TABLE "orgs" ADD COLUMN "wave_factor" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_wave_factor_range" CHECK ("wave_factor" BETWEEN 1 AND 10);
