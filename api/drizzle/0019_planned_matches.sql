CREATE TABLE "planned_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"time" text,
	"home_name" text NOT NULL,
	"home_color" text NOT NULL,
	"home_captain" integer,
	"away_name" text NOT NULL,
	"away_color" text NOT NULL,
	"away_captain" integer,
	"venue" text,
	"competition" text,
	"format" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planned_matches_time" CHECK ("planned_matches"."time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
ALTER TABLE "planned_matches" ADD CONSTRAINT "planned_matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planned_matches_user_id_date_index" ON "planned_matches" USING btree ("user_id","date");