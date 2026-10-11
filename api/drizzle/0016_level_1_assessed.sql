ALTER TABLE "club_umpires" DROP CONSTRAINT "club_umpires_level";--> statement-breakpoint
ALTER TABLE "competition_umpire_levels" DROP CONSTRAINT "competition_umpire_levels_level";--> statement-breakpoint
-- Level 1 (Assessed) goes in at 2, so Level 2 and above move up one. Level 1 stays as Level 1 (Unassessed).
UPDATE "club_umpires" SET "level" = "level" + 1 WHERE "level" >= 2;--> statement-breakpoint
UPDATE "competition_umpire_levels" SET "min_level" = "min_level" + 1 WHERE "min_level" >= 2;--> statement-breakpoint
ALTER TABLE "club_umpires" ADD CONSTRAINT "club_umpires_level" CHECK ("club_umpires"."level" between 0 and 5);--> statement-breakpoint
ALTER TABLE "competition_umpire_levels" ADD CONSTRAINT "competition_umpire_levels_level" CHECK ("competition_umpire_levels"."min_level" between 0 and 5);