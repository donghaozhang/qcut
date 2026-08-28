import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";

const manifestSchema = z.object({
	catalogId: z.string(),
	generatedAt: z.string().datetime(),
	categories: z.array(z.object({ id: z.string(), label: z.string() })),
	items: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			fileName: z.string().regex(/^[a-f0-9]{32}\.mp3$/),
			byteSize: z.number().int().positive(),
			duration: z.number().positive(),
			contentMd5: z.string().regex(/^[a-f0-9]{32}$/),
			contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
			categoryIds: z.array(z.string()).min(1),
			source: z.object({ provider: z.string() }).passthrough().optional(),
		})
	),
});

interface ProbeStream {
	codec_name?: string;
	sample_rate?: string;
	channels?: number;
	duration?: string;
}

interface ProbeOutput {
	format?: { duration?: string };
	streams?: ProbeStream[];
}

interface ProcessResult {
	exitCode: number;
	stderr: string;
	stdout: string;
}

export interface AudioLoudness {
	integratedLufs: number | null;
	truePeakDbfs: number | null;
	maxVolumeDb: number | null;
}

interface AudioQaItem {
	id: string;
	title: string;
	fileName: string;
	filePath: string | null;
	provider: string;
	byteSize: number | null;
	codec: string | null;
	durationSeconds: number | null;
	durationDeltaSeconds: number | null;
	sampleRate: number | null;
	channels: number | null;
	integratedLufs: number | null;
	truePeakDbfs: number | null;
	maxVolumeDb: number | null;
	errors: string[];
	warnings: string[];
}

function lastNumber({ pattern, text }: { pattern: RegExp; text: string }) {
	const matches = [...text.matchAll(pattern)];
	const raw = matches.at(-1)?.[1];
	if (!raw || raw.toLowerCase() === "-inf") return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

export function parseAudioLoudness({ text }: { text: string }): AudioLoudness {
	return {
		integratedLufs: lastNumber({
			pattern: /^\s*I:\s*(-?inf|-?\d+(?:\.\d+)?)\s+LUFS$/gim,
			text,
		}),
		truePeakDbfs: lastNumber({
			pattern: /^\s*Peak:\s*(-?inf|-?\d+(?:\.\d+)?)\s+dBFS$/gim,
			text,
		}),
		maxVolumeDb: lastNumber({
			pattern: /max_volume:\s*(-?inf|-?\d+(?:\.\d+)?)\s+dB/gim,
			text,
		}),
	};
}

async function runProcess({
	command,
}: {
	command: string[];
}): Promise<ProcessResult> {
	const process = Bun.spawn({
		cmd: command,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	return { exitCode, stderr, stdout };
}

function scanAudioFiles({ roots }: { roots: string[] }): Map<string, string> {
	const filesByName = new Map<string, string>();
	const scan = ({ directory }: { directory: string }): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const filePath = join(directory, entry.name);
			if (entry.isDirectory()) {
				scan({ directory: filePath });
				continue;
			}
			if (!entry.isFile() || !entry.name.endsWith(".mp3")) continue;
			filesByName.set(entry.name, filesByName.get(entry.name) ?? filePath);
		}
	};
	for (const root of roots) {
		if (!existsSync(root) || !statSync(root).isDirectory()) {
			throw new Error(`Audio root is not a directory: ${root}`);
		}
		scan({ directory: root });
	}
	return filesByName;
}

async function inspectAudio({
	ffmpegPath,
	ffprobePath,
	filePath,
	item,
}: {
	ffmpegPath: string;
	ffprobePath: string;
	filePath: string | undefined;
	item: z.infer<typeof manifestSchema>["items"][number];
}): Promise<AudioQaItem> {
	const errors: string[] = [];
	const warnings: string[] = [];
	if (!filePath) {
		return {
			id: item.id,
			title: item.title,
			fileName: item.fileName,
			filePath: null,
			provider: item.source?.provider ?? "jianying-reference",
			byteSize: null,
			codec: null,
			durationSeconds: null,
			durationDeltaSeconds: null,
			sampleRate: null,
			channels: null,
			integratedLufs: null,
			truePeakDbfs: null,
			maxVolumeDb: null,
			errors: ["missing-local-backup"],
			warnings,
		};
	}
	const bytes = readFileSync(filePath);
	const md5 = createHash("md5").update(bytes).digest("hex");
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	if (bytes.byteLength !== item.byteSize) errors.push("byte-size-mismatch");
	if (md5 !== item.contentMd5) errors.push("md5-mismatch");
	if (sha256 !== item.contentSha256) errors.push("sha256-mismatch");
	const [probe, decode] = await Promise.all([
		runProcess({
			command: [
				ffprobePath,
				"-v",
				"error",
				"-select_streams",
				"a:0",
				"-show_entries",
				"stream=codec_name,sample_rate,channels,duration:format=duration",
				"-of",
				"json",
				filePath,
			],
		}),
		runProcess({
			command: [
				ffmpegPath,
				"-nostdin",
				"-hide_banner",
				"-nostats",
				"-i",
				filePath,
				"-map",
				"0:a:0",
				"-af",
				"ebur128=peak=true:framelog=quiet,volumedetect",
				"-f",
				"null",
				"-",
			],
		}),
	]);
	let probeOutput: ProbeOutput = {};
	if (probe.exitCode !== 0) errors.push("ffprobe-failed");
	else {
		try {
			probeOutput = JSON.parse(probe.stdout) as ProbeOutput;
		} catch {
			errors.push("ffprobe-invalid-json");
		}
	}
	if (decode.exitCode !== 0) errors.push("decode-failed");
	const stream = probeOutput.streams?.[0];
	if (!stream) errors.push("missing-audio-stream");
	const codec = stream?.codec_name ?? null;
	if (codec && codec !== "mp3") errors.push(`unexpected-codec:${codec}`);
	const durationSeconds = Number(
		probeOutput.format?.duration ?? stream?.duration
	);
	const validDuration = Number.isFinite(durationSeconds)
		? durationSeconds
		: null;
	const durationDeltaSeconds =
		validDuration === null
			? null
			: Number(Math.abs(validDuration - item.duration).toFixed(6));
	if (durationDeltaSeconds === null) errors.push("invalid-duration");
	else if (durationDeltaSeconds > 0.1) errors.push("duration-mismatch");
	const sampleRate = Number(stream?.sample_rate);
	const validSampleRate = Number.isFinite(sampleRate) ? sampleRate : null;
	const channels = stream?.channels ?? null;
	if (validSampleRate !== null && validSampleRate < 16_000) {
		warnings.push("low-sample-rate");
	}
	if (channels !== null && (channels < 1 || channels > 2)) {
		warnings.push("unusual-channel-count");
	}
	const loudness = parseAudioLoudness({ text: decode.stderr });
	if (loudness.maxVolumeDb === null || loudness.maxVolumeDb <= -45) {
		warnings.push("very-quiet-or-silent");
	}
	if (loudness.truePeakDbfs !== null && loudness.truePeakDbfs >= -0.1) {
		warnings.push("near-clipping");
	}
	return {
		id: item.id,
		title: item.title,
		fileName: item.fileName,
		filePath,
		provider: item.source?.provider ?? "jianying-reference",
		byteSize: bytes.byteLength,
		codec,
		durationSeconds: validDuration,
		durationDeltaSeconds,
		sampleRate: validSampleRate,
		channels,
		...loudness,
		errors,
		warnings,
	};
}

async function inspectAll({
	concurrency,
	ffmpegPath,
	ffprobePath,
	filesByName,
	items,
}: {
	concurrency: number;
	ffmpegPath: string;
	ffprobePath: string;
	filesByName: Map<string, string>;
	items: z.infer<typeof manifestSchema>["items"];
}): Promise<AudioQaItem[]> {
	const results = new Array<AudioQaItem>(items.length);
	let nextIndex = 0;
	let completed = 0;
	const inspectNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		const item = items[index];
		if (!item) return;
		results[index] = await inspectAudio({
			ffmpegPath,
			ffprobePath,
			filePath: filesByName.get(item.fileName),
			item,
		});
		completed += 1;
		if (completed % 100 === 0 || completed === items.length) {
			process.stdout.write(`QA ${completed}/${items.length}\n`);
		}
		return inspectNext();
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, inspectNext)
	);
	return results;
}

async function run(): Promise<void> {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			manifest: { type: "string" },
			output: { type: "string" },
			"audio-root": { type: "string", multiple: true },
			concurrency: { type: "string" },
			ffmpeg: { type: "string" },
			ffprobe: { type: "string" },
		},
		strict: true,
	});
	if (!(values.manifest && values.output && values["audio-root"]?.length)) {
		throw new Error(
			"Usage: bun scripts/qa-sound-effects-lab-audio.ts --manifest <manifest.json> --audio-root <dir> [--audio-root <dir>] --output <report.json> [--concurrency 8]"
		);
	}
	const concurrency = Number(values.concurrency ?? "8");
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
		throw new Error("--concurrency must be an integer between 1 and 32");
	}
	const manifest = manifestSchema.parse(
		JSON.parse(readFileSync(resolve(values.manifest), "utf8"))
	);
	const audioRoots = values["audio-root"].map((root) => resolve(root));
	const filesByName = scanAudioFiles({ roots: audioRoots });
	const items = await inspectAll({
		concurrency,
		ffmpegPath: values.ffmpeg ?? "ffmpeg",
		ffprobePath: values.ffprobe ?? "ffprobe",
		filesByName,
		items: manifest.items,
	});
	const failedItems = items.filter((item) => item.errors.length > 0);
	const warningItems = items.filter((item) => item.warnings.length > 0);
	const sourceHashes = new Set(
		manifest.items.map((item) => item.contentSha256)
	);
	const report = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		catalogId: manifest.catalogId,
		manifestPath: resolve(values.manifest),
		audioRoots,
		summary: {
			manifestItemCount: manifest.items.length,
			localUniqueFileCount: filesByName.size,
			verifiedItemCount: items.length - failedItems.length,
			failedItemCount: failedItems.length,
			warningItemCount: warningItems.length,
			uniqueContentHashCount: sourceHashes.size,
			duplicateContentHashCount: manifest.items.length - sourceHashes.size,
			categoryCount: manifest.categories.length,
		},
		items,
	};
	const outputPath = resolve(values.output);
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
	if (failedItems.length > 0) process.exitCode = 1;
}

if (import.meta.main) await run();
