CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
DROP INDEX "matches_played_at_id_index";--> statement-breakpoint
CREATE INDEX "matches_published_played_at_id_index" ON "matches" USING btree ("played_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "matches"."status" = 'published' and "matches"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "matches_competition_trgm_index" ON "matches" USING gin ("competition" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "matches_venue_trgm_index" ON "matches" USING gin ("venue" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "matches_played_at_id_index" ON "matches" USING btree ("played_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);