CREATE TABLE "telegram_alta_pending" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"invite_code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manager_telegram" (
	"user_id" text PRIMARY KEY NOT NULL,
	"chat_id" text,
	"linked_at" timestamp with time zone,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	CONSTRAINT "manager_telegram_chat_id_unique" UNIQUE("chat_id"),
	CONSTRAINT "manager_telegram_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD COLUMN "telegram" boolean DEFAULT false NOT NULL;