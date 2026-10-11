CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"mentoring" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"cover_requested_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_fixture_id_index" ON "appointments" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "appointments_user_id_index" ON "appointments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_active_role" ON "appointments" USING btree ("fixture_id","role") WHERE status in ('offered', 'accepted');--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_active_user" ON "appointments" USING btree ("fixture_id","user_id") WHERE status in ('offered', 'accepted');