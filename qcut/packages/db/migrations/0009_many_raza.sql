CREATE TABLE "audio_track_downloads" (
	"track_key" text PRIMARY KEY NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audio_track_downloads" ENABLE ROW LEVEL SECURITY;