/**
 * Build and publish the audio CDN catalog.
 *
 * Reads a source catalog directory:
 *   <source-dir>/tracks.json   — array of track entries whose `file` /
 *                                `artworkFile` fields are paths relative to
 *                                <source-dir>
 *   <source-dir>/<files>       — the audio + artwork payloads
 *
 * Produces <source-dir>/dist/manifest.json with absolute CDN URLs, verifies
 * it against the runtime schema, and uploads payloads + manifest to the
 * bucket (skipped with --dry-run, the default when credentials are absent).
 *
 * Usage:
 *   bun apps/web/scripts/release-audio-cdn.ts \
 *     --source-dir apps/web/audio-cdn \
 *     --base-url https://assets.qcut.app/audio \
 *     --bucket qcut-assets [--prefix audio] [--dry-run]
 *
 * Credentials follow the text-assets release conventions: standard AWS SDK
 * env vars plus QCUT_AUDIO_ASSET_S3_ENDPOINT (falls back to
 * QCUT_TEXT_ASSET_S3_ENDPOINT) for R2-style endpoints.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
	AUDIO_CDN_MANIFEST_VERSION,
	AUDIO_CDN_TRACK_ID_MAX,
	parseAudioCdnManifest,
	type AudioCdnManifest,
	type AudioCdnTrack,
} from "../src/lib/audio/audio-cdn-catalog";
import { verifyAudioCdnManifestValue } from "./verify-audio-cdn-manifest";

interface SourceTrack extends Omit<AudioCdnTrack, "previewUrl" | "artworkUrl"> {
	file: string;
	artworkFile?: string;
}

function flagValue({ flag }: { flag: string }): string | undefined {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

const sourceDir = path.resolve(
	flagValue({ flag: "--source-dir" }) ??
		path.join(import.meta.dir, "../audio-cdn")
);
const baseUrl = (
	flagValue({ flag: "--base-url" }) ?? "https://assets.qcut.app/audio"
).replace(/\/$/, "");
const bucket = flagValue({ flag: "--bucket" });
const prefix = (flagValue({ flag: "--prefix" }) ?? "audio").replace(/\/$/, "");
const dryRun = process.argv.includes("--dry-run") || !bucket;

function contentTypeFor({ file }: { file: string }): string {
	if (file.endsWith(".ogg")) return "audio/ogg";
	if (file.endsWith(".mp3")) return "audio/mpeg";
	if (file.endsWith(".webp")) return "image/webp";
	if (file.endsWith(".json")) return "application/json";
	return "application/octet-stream";
}

function buildManifest({
	tracks,
	generatedAt,
}: {
	tracks: SourceTrack[];
	generatedAt: string;
}): AudioCdnManifest {
	return {
		version: AUDIO_CDN_MANIFEST_VERSION,
		generatedAt,
		tracks: tracks.map(({ file, artworkFile, ...track }) => ({
			...track,
			previewUrl: `${baseUrl}/${file}`,
			artworkUrl: artworkFile ? `${baseUrl}/${artworkFile}` : undefined,
		})),
	};
}

function validateSourceTracks({ tracks }: { tracks: SourceTrack[] }): string[] {
	const errors: string[] = [];
	const seenIds = new Set<number>();
	for (const track of tracks) {
		if (!Number.isInteger(track.id) || track.id > AUDIO_CDN_TRACK_ID_MAX) {
			errors.push(
				`Track "${track.name}" id ${track.id} must be an integer <= ${AUDIO_CDN_TRACK_ID_MAX}`
			);
		}
		if (seenIds.has(track.id)) {
			errors.push(`Duplicate track id ${track.id}`);
		}
		seenIds.add(track.id);
		for (const file of [track.file, track.artworkFile]) {
			if (file && !existsSync(path.join(sourceDir, file))) {
				errors.push(`Missing payload for "${track.name}": ${file}`);
			}
		}
	}
	return errors;
}

async function uploadFiles({
	manifest,
	tracks,
}: {
	manifest: AudioCdnManifest;
	tracks: SourceTrack[];
}): Promise<void> {
	if (!bucket) throw new Error("--bucket is required to upload");
	const client = new S3Client({
		endpoint:
			process.env.QCUT_AUDIO_ASSET_S3_ENDPOINT ??
			process.env.QCUT_TEXT_ASSET_S3_ENDPOINT,
		forcePathStyle: process.env.QCUT_AUDIO_ASSET_S3_FORCE_PATH_STYLE === "true",
		region: process.env.AWS_REGION ?? "auto",
	});
	const payloadFiles = tracks.flatMap((track) =>
		[track.file, track.artworkFile].filter(
			(file): file is string => typeof file === "string"
		)
	);
	for (const file of [...new Set(payloadFiles)]) {
		await client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: `${prefix}/${file}`,
				Body: await readFile(path.join(sourceDir, file)),
				ContentType: contentTypeFor({ file }),
				CacheControl: "public, max-age=31536000, immutable",
			})
		);
		console.log(`⬆️  ${prefix}/${file}`);
	}
	await client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: `${prefix}/manifest.json`,
			Body: JSON.stringify(manifest, null, "\t"),
			ContentType: "application/json",
			CacheControl: "public, max-age=300",
		})
	);
	console.log(`⬆️  ${prefix}/manifest.json`);
}

if (import.meta.main) {
	const tracksPath = path.join(sourceDir, "tracks.json");
	const tracks = JSON.parse(
		await readFile(tracksPath, "utf8")
	) as SourceTrack[];
	if (!Array.isArray(tracks) || tracks.length === 0) {
		console.error(`No tracks found in ${tracksPath}`);
		process.exit(1);
	}

	const sourceErrors = validateSourceTracks({ tracks });
	if (sourceErrors.length > 0) {
		for (const error of sourceErrors) console.error(`❌ ${error}`);
		process.exit(1);
	}

	const manifest = buildManifest({
		tracks,
		generatedAt: new Date().toISOString(),
	});
	if (!parseAudioCdnManifest({ value: manifest })) {
		console.error("❌ Built manifest failed runtime schema validation");
		process.exit(1);
	}
	const { issues } = verifyAudioCdnManifestValue({ value: manifest });
	const errors = issues.filter((issue) => issue.level === "error");
	if (errors.length > 0) {
		for (const issue of errors) console.error(`❌ ${issue.message}`);
		process.exit(1);
	}

	const distDir = path.join(sourceDir, "dist");
	await mkdir(distDir, { recursive: true });
	const manifestPath = path.join(distDir, "manifest.json");
	await writeFile(manifestPath, JSON.stringify(manifest, null, "\t"));
	console.log(`📝 Wrote ${manifestPath} (${manifest.tracks.length} tracks)`);

	if (dryRun) {
		console.log("Dry run — skipping upload (pass --bucket to publish)");
	} else {
		await uploadFiles({ manifest, tracks });
		console.log(`✅ Published to ${baseUrl}/manifest.json`);
	}
}
