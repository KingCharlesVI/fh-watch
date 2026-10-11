CREATE TABLE "umpiring_gap_notices" (
	"club_id" uuid PRIMARY KEY NOT NULL,
	"sent_on" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "umpiring_gap_notices" ADD CONSTRAINT "umpiring_gap_notices_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;