import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { AudioRecord } from "./inspect-audio-cache";
import { jsonObjectValue, parseJsonObject, stringValue } from "./json-values";

const FFPROBE_TIMEOUT_MILLISECONDS = 10_000;
const nodeRequire = createRequire(import.meta.url);

interface DownloadEntry {
	hex: string;
	path: string;
}

export interface AudioProbe {
	format: string | null;
	durationSeconds: number | null;
	codec: string | null;
	sampleRate: number | null;
	channels: number | null;
}

export interface AudioProbeError {
	code:
		| "ffprobe-unavailable"
		| "ffprobe-timeout"
		| "ffprobe-failed"
		| "invalid-ffprobe-output";
	message: string;
}

export interface AudioProbeResult {
	probe: AudioProbe | null;
	error: AudioProbeError | null;
}

interface FfprobeInvocation {
	binaryPath: string;
	args: string[];
	timeoutMilliseconds: number;
}

interface FfprobeProcessResult {
	status: number | null;
	stdout: string;
	stderr: string;
	error?: NodeJS.ErrnoException;
}

type ResolveFfprobePath = () => string | null;
type RunFfprobe = (invocation: FfprobeInvocation) => FfprobeProcessResult;

export interface LocalAudioEvidence {
	state: "verified" | "present" | "missing" | "requires-cache-probe";
	path: string | null;
	mappingStrategy: "metadata-md5" | "download-config-url-hash" | "unresolved";
	sizeBytes: number | null;
	contentMd5: string | null;
	metadataMd5Matches: boolean | null;
	probe: AudioProbe | null;
	probeError: AudioProbeError | null;
}

/**
 * A null metadataMd5Matches means no content hash was ever compared — the
 * VOD/url-hash mapping case. SKILL.md treats that mapping as unproven until a
 * cache probe confirms it, so it must not be reported as verified.
 */
function resolvedFileState({
	verify,
	metadataMd5Matches,
}: {
	verify: boolean;
	metadataMd5Matches: boolean | null;
}): LocalAudioEvidence["state"] {
	if (!verify) return "present";
	if (metadataMd5Matches === true) return "verified";
	if (metadataMd5Matches === null) return "requires-cache-probe";
	return "present";
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

export function resolveBundledFfprobePath(): string | null {
	try {
		const moduleValue = jsonObjectValue({ value: nodeRequire("ffprobe-static") });
		const defaultValue = jsonObjectValue({ value: moduleValue?.default });
		return (
			stringValue({ value: moduleValue?.path }) ||
			stringValue({ value: defaultValue?.path }) ||
			null
		);
	} catch {
		return null;
	}
}

function runFfprobe({
	binaryPath,
	args,
	timeoutMilliseconds,
}: FfprobeInvocation): FfprobeProcessResult {
	const result = spawnSync(binaryPath, args, {
		encoding: "utf8",
		timeout: timeoutMilliseconds,
	});
	return {
		status: result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		...(result.error ? { error: result.error } : {}),
	};
}

function failedProbe({
	code,
	message,
}: {
	code: AudioProbeError["code"];
	message: string;
}): AudioProbeResult {
	return { probe: null, error: { code, message } };
}

export function probeAudio({
	filePath,
	resolveFfprobePath = resolveBundledFfprobePath,
	runProbe = runFfprobe,
}: {
	filePath: string;
	resolveFfprobePath?: ResolveFfprobePath;
	runProbe?: RunFfprobe;
}): AudioProbeResult {
	const ffprobePath = resolveFfprobePath();
	if (!ffprobePath) {
		return failedProbe({
			code: "ffprobe-unavailable",
			message: "The bundled ffprobe-static binary could not be resolved.",
		});
	}
	const result = runProbe({
		binaryPath: ffprobePath,
		args: [
			"-v",
			"error",
			"-show_entries",
			"format=format_name,duration:stream=codec_type,codec_name,sample_rate,channels",
			"-of",
			"json",
			filePath,
		],
		timeoutMilliseconds: FFPROBE_TIMEOUT_MILLISECONDS,
	});
	if (result.error?.code === "ENOENT") {
		return failedProbe({
			code: "ffprobe-unavailable",
			message: `The bundled ffprobe binary does not exist at ${ffprobePath}.`,
		});
	}
	if (result.error?.code === "ETIMEDOUT") {
		return failedProbe({
			code: "ffprobe-timeout",
			message: `ffprobe exceeded ${FFPROBE_TIMEOUT_MILLISECONDS} ms.`,
		});
	}
	if (result.error || result.status !== 0) {
		return failedProbe({
			code: "ffprobe-failed",
			message:
				result.stderr.trim() ||
				result.error?.message ||
				`ffprobe exited with status ${String(result.status)}.`,
		});
	}
	let rootValue: unknown;
	try {
		rootValue = JSON.parse(result.stdout);
	} catch {
		return failedProbe({
			code: "invalid-ffprobe-output",
			message: "ffprobe returned invalid JSON.",
		});
	}
	const root = jsonObjectValue({ value: rootValue });
	if (!root) {
		return failedProbe({
			code: "invalid-ffprobe-output",
			message: "ffprobe returned a non-object JSON payload.",
		});
	}
	const format = jsonObjectValue({ value: root.format }) ?? {};
	const streams = Array.isArray(root.streams) ? root.streams : [];
	const audio =
		streams
			.map((stream) => jsonObjectValue({ value: stream }))
			.find((stream) => stream?.codec_type === "audio") ?? {};
	return {
		probe: {
			format: stringValue({ value: format.format_name }) || null,
			durationSeconds: numberValue({ value: format.duration }),
			codec: stringValue({ value: audio.codec_name }) || null,
			sampleRate: numberValue({ value: audio.sample_rate }),
			channels: numberValue({ value: audio.channels }),
		},
		error: null,
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
			probeError: null,
		};
	}
	const contentMd5 = verify ? md5File({ filePath: resolvedPath }) : null;
	const metadataMd5Matches =
		contentMd5 && record.metadataMd5
			? contentMd5 === record.metadataMd5
			: null;
	const probeResult = verify
		? probeAudio({ filePath: resolvedPath })
		: { probe: null, error: null };
	return {
		state: resolvedFileState({ verify, metadataMd5Matches }),
		path: resolvedPath,
		mappingStrategy,
		sizeBytes: statSync(resolvedPath).size,
		contentMd5,
		metadataMd5Matches,
		probe: probeResult.probe,
		probeError: probeResult.error,
	};
}
