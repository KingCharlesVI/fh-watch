CREATE TABLE "club_umpires" (
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"level" integer,
	"plays_for_team_id" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_umpires_club_id_user_id_pk" PRIMARY KEY("club_id","user_id"),
	CONSTRAINT "club_umpires_level" CHECK ("club_umpires"."level" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE "competition_umpire_levels" (
	"competition_id" uuid PRIMARY KEY NOT NULL,
	"min_level" integer NOT NULL,
	CONSTRAINT "competition_umpire_levels_level" CHECK ("competition_umpire_levels"."min_level" between 0 and 4)
);
--> statement-breakpoint
ALTER TABLE "club_umpires" ADD CONSTRAINT "club_umpires_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_umpires" ADD CONSTRAINT "club_umpires_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_umpires" ADD CONSTRAINT "club_umpires_plays_for_team_id_teams_id_fk" FOREIGN KEY ("plays_for_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_umpire_levels" ADD CONSTRAINT "competition_umpire_levels_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_umpires_user_id_index" ON "club_umpires" USING btree ("user_id");