/**
 * Verify an audio CDN catalog manifest.
 *
 * Checks the manifest parses under the runtime schema, that no entries were
 * dropped by validation, that IDs are unique, and (optionally) that every
 * referenced remote file responds.
 *
 * Usage:
 *   bun apps/web/scripts/verify-audio-cdn-manifest.ts --manifest <path> [--check-remote]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
	parseAudioCdnManifest,
	parseAudioCdnTrack,
} from "../src/lib/audio/audio-cdn-catalog";

const manifestFlagIndex = process.argv.indexOf("--manifest");
const manifestPath = path.resolve(
	manifestFlagIndex >= 0
		? process.argv[manifestFlagIndex + 1]
		: path.join(import.meta.dir, "../audio-cdn/dist/manifest.json")
);
const checkRemote = process.argv.includes("--check-remote");

export interface AudioManifestVerifyIssue {
	level: "error" | "warning";
	message: string;
}

export function verifyAudioCdnManifestValue({ value }: { value: unknown }): {
	issues: AudioManifestVerifyIssue[];
	trackCount: number;
} {
	const issues: AudioManifestVerifyIssue[] = [];
	const manifest = parseAudioCdnManifest({ value });
	if (!manifest) {
		return {
			issues: [
				{ level: "error", message: "Manifest failed schema validation" },
			],
			trackCount: 0,
		};
	}

	const rawTracks = Array.isArray(
		(value as { tracks?: unknown[] } | null)?.tracks
	)
		? ((value as { tracks: unknown[] }).tracks ?? [])
		: [];
	for (const [index, rawTrack] of rawTracks.entries()) {
		if (!parseAudioCdnTrack({ value: rawTrack })) {
			issues.push({
				level: "error",
				message: `Track at index ${index} was rejected by schema validation`,
			});
		}
	}

	const seenIds = new Set<number>();
	for (const track of manifest.tracks) {
		if (seenIds.has(track.id)) {
			issues.push({
				level: "error",
				message: `Duplicate track id ${track.id} (${track.name})`,
			});
		}
		seenIds.add(track.id);
		if (!track.artworkUrl) {
			issues.push({
				level: "warning",
				message: `Track ${track.id} (${track.name}) has no artworkUrl`,
			});
		}
	}

	const musicCount = manifest.tracks.filter(
		(track) => track.kind === "music"
	).length;
	console.log(
		`Manifest OK-shape: ${manifest.tracks.length} tracks (${musicCount} music, ${manifest.tracks.length - musicCount} sfx), generated ${manifest.generatedAt}`
	);
	return { issues, trackCount: manifest.tracks.length };
}

async function verifyRemoteUrls({
	value,
}: {
	value: unknown;
}): Promise<AudioManifestVerifyIssue[]> {
	const manifest = parseAudioCdnManifest({ value });
	if (!manifest) return [];
	const issues: AudioManifestVerifyIssue[] = [];
	const urls = manifest.tracks.flatMap((track) =>
		[track.previewUrl, track.downloadUrl, track.artworkUrl].filter(
			(url): url is string => typeof url === "string"
		)
	);
	const uniqueUrls = [...new Set(urls)];
	let nextIndex = 0;
	const workers = Array.from(
		{ length: Math.min(6, uniqueUrls.length) },
		async () => {
			while (nextIndex < uniqueUrls.length) {
				const url = uniqueUrls[nextIndex];
				nextIndex += 1;
				try {
					const response = await fetch(url, {
						method: "HEAD",
						signal: AbortSignal.timeout(30_000),
					});
					if (!response.ok) {
						issues.push({
							level: "error",
							message: `Remote file ${url} responded ${response.status}`,
						});
					}
				} catch (error) {
					issues.push({
						level: "error",
						message: `Remote file ${url} failed: ${
							error instanceof Error ? error.message : String(error)
						}`,
					});
				}
			}
		}
	);
	await Promise.all(workers);
	console.log(`Checked ${uniqueUrls.length} remote files`);
	return issues;
}

if (import.meta.main) {
	const value: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
	const { issues } = verifyAudioCdnManifestValue({ value });
	if (checkRemote) {
		issues.push(...(await verifyRemoteUrls({ value })));
	}
	for (const issue of issues) {
		const prefix = issue.level === "error" ? "❌" : "⚠️ ";
		console.log(`${prefix} ${issue.message}`);
	}
	const errorCount = issues.filter((issue) => issue.level === "error").length;
	if (errorCount > 0) {
		console.error(`Verification failed with ${errorCount} error(s)`);
		process.exit(1);
	}
	console.log("✅ Audio CDN manifest verified");
}
