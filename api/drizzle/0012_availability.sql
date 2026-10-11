CREATE TABLE "umpire_availability" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"available" boolean NOT NULL,
	"from_time" text,
	"to_time" text,
	CONSTRAINT "umpire_availability_user_id_date_pk" PRIMARY KEY("user_id","date"),
	CONSTRAINT "umpire_availability_times" CHECK (("umpire_availability"."from_time" is null or "umpire_availability"."from_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and ("umpire_availability"."to_time" is null or "umpire_availability"."to_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
);
--> statement-breakpoint
CREATE TABLE "umpire_unavailable_weekdays" (
	"user_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	CONSTRAINT "umpire_unavailable_weekdays_user_id_weekday_pk" PRIMARY KEY("user_id","weekday"),
	CONSTRAINT "umpire_unavailable_weekdays_weekday" CHECK ("umpire_unavailable_weekdays"."weekday" between 0 and 6)
);
--> statement-breakpoint
ALTER TABLE "umpire_availability" ADD CONSTRAINT "umpire_availability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "umpire_unavailable_weekdays" ADD CONSTRAINT "umpire_unavailable_weekdays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;