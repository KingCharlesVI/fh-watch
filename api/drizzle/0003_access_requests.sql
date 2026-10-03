CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"devices" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_note" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_requests_status" ON "access_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "access_requests_pending" ON "access_requests" USING btree ("email","kind") WHERE "access_requests"."status" = 'pending';