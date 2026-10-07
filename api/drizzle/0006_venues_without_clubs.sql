ALTER TABLE "venues" DROP CONSTRAINT "venues_clubId_name_unique";--> statement-breakpoint
ALTER TABLE "venues" DROP CONSTRAINT "venues_club_id_clubs_id_fk";
--> statement-breakpoint
ALTER TABLE "venues" DROP COLUMN "club_id";--> statement-breakpoint
-- Venues were per club until now, so two clubs could share a name: keep the oldest of each.
DELETE FROM "venues" a USING "venues" b WHERE a."name" = b."name" AND (a."created_at", a."id") > (b."created_at", b."id");--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_name_unique" UNIQUE("name");
