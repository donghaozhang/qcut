DELETE FROM "device_activations" AS stale
USING "device_activations" AS keeper
WHERE stale."license_id" = keeper."license_id"
	AND stale."device_fingerprint" = keeper."device_fingerprint"
	AND (
		stale."last_seen_at" < keeper."last_seen_at"
		OR (
			stale."last_seen_at" = keeper."last_seen_at"
			AND stale."id" < keeper."id"
		)
	);--> statement-breakpoint
CREATE UNIQUE INDEX "device_activations_license_fingerprint_unique" ON "device_activations" USING btree ("license_id","device_fingerprint");