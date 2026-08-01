import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { AudioRecord } from "./inspect-audio-cache";
import { jsonObjectValue, parseJsonObject, stringValue } from "./json-values";

interface DownloadEntry {
	hex: string;
	path: string;
}

interface AudioProbe {
	format: string | null;
	durationSeconds: number | null;
	codec: string | null;
	sampleRate: number | null;
	channels: number | null;
}

export interface LocalAudioEvidence {
	state: "verified" | "present" | "missing" | "requires-cache-probe";
	path: string | null;
	mappingStrategy: "metadata-md5" | "download-config-url-hash" | "unresolved";
	sizeBytes: number | null;
	contentMd5: string | null;
	metadataMd5Matches: boolean | null;
	probe: AudioProbe | null;
}

function numberValue({ value }: { value: unknown }): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function readDownloadEntries({ cacheRoot }: { cacheRoot: string }): DownloadEntry[] {
	const configPath = path.join(cacheRoot, "music/downLoadcfg");
	if (!existsSync(configPath)) return [];
	const config = parseJsonObject({ value: readFileSync(configPath, "utf8") });
	if (!Array.isArray(config.list)) return [];
	const entries: DownloadEntry[] = [];
	for (const value of config.list) {
		const entry = jsonObjectValue({ value });
		if (!entry) continue;
		const hex = stringValue({ value: entry.hex });
		const entryPath = stringValue({ value: entry.path });
		if (hex && entryPath) entries.push({ hex, path: entryPath });
	}
	return entries;
}

function md5String({ value }: { value: string }): string {
	return createHash("md5").update(value).digest("hex");
}

function md5File({ filePath }: { filePath: string }): string {
	return createHash("md5").update(readFileSync(filePath)).digest("hex");
}

function probeAudio({ filePath }: { filePath: string }): AudioProbe | null {
	const result = spawnSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-show_entries",
			"format=format_name,duration:stream=codec_type,codec_name,sample_rate,channels",
			"-of",
			"json",
			filePath,
		],
		{ encoding: "utf8" }
	);
	if (result.status !== 0) return null;
	const root = parseJsonObject({ value: result.stdout });
	const format = jsonObjectValue({ value: root.format }) ?? {};
	const streams = Array.isArray(root.streams) ? root.streams : [];
	const audio =
		streams
			.map((stream) => jsonObjectValue({ value: stream }))
			.find((stream) => stream?.codec_type === "audio") ?? {};
	return {
		format: stringValue({ value: format.format_name }) || null,
		durationSeconds: numberValue({ value: format.duration }),
		codec: stringValue({ value: audio.codec_name }) || null,
		sampleRate: numberValue({ value: audio.sample_rate }),
		channels: numberValue({ value: audio.channels }),
	};
}

export function resolveLocalAudio({
	record,
	cacheRoot,
	verify,
}: {
	record: AudioRecord;
	cacheRoot: string;
	verify: boolean;
}): LocalAudioEvidence {
	const musicRoot = path.join(cacheRoot, "music");
	let resolvedPath: string | null = null;
	let mappingStrategy: LocalAudioEvidence["mappingStrategy"] = "unresolved";
	if (record.metadataMd5) {
		const candidate = path.join(musicRoot, `${record.metadataMd5}.mp3`);
		if (existsSync(candidate)) {
			resolvedPath = candidate;
			mappingStrategy = "metadata-md5";
		}
	}
	if (!(resolvedPath || !record.downloadUrl)) {
		const urlHash = md5String({ value: record.downloadUrl });
		const entry = readDownloadEntries({ cacheRoot }).find(
			(candidate) => candidate.hex === urlHash
		);
		if (entry) {
			const candidate = path.join(musicRoot, entry.path);
			if (existsSync(candidate)) {
				resolvedPath = candidate;
				mappingStrategy = "download-config-url-hash";
			}
		}
	}
	if (!resolvedPath) {
		return {
			state: record.metadataMd5 ? "missing" : "requires-cache-probe",
			path: null,
			mappingStrategy,
			sizeBytes: null,
			contentMd5: null,
			metadataMd5Matches: null,
			probe: null,
		};
	}
	const contentMd5 = verify ? md5File({ filePath: resolvedPath }) : null;
	const metadataMd5Matches =
		contentMd5 && record.metadataMd5
			? contentMd5 === record.metadataMd5
			: null;
	return {
		state: verify && metadataMd5Matches !== false ? "verified" : "present",
		path: resolvedPath,
		mappingStrategy,
		sizeBytes: statSync(resolvedPath).size,
		contentMd5,
		metadataMd5Matches,
		probe: verify ? probeAudio({ filePath: resolvedPath }) : null,
	};
}
