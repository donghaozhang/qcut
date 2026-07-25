import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { BrowserWindow } from "electron";
import { resolveHyperframesAsset } from "./source-security";

const MAX_VOLUME_SEGMENTS = 32;
const VOLUME_SIMPLIFY_EPSILON = 0.005;

export interface HyperframesAudioElement {
	id: string;
	src: string;
	start: number;
	duration: number;
	mediaStart: number;
	volume: number;
	playbackRate: number;
	loop: boolean;
	type: "audio" | "video";
}

export interface HyperframesVolumeSample {
	time: number;
	volume: number;
}

export interface HyperframesPreparedAudioTrack extends HyperframesAudioElement {
	inputPath: string;
	volumeSamples: HyperframesVolumeSample[];
}

interface RuntimeVolumeValue {
	id: string;
	volume: number;
}

const COLLECT_AUDIO_ELEMENTS_SCRIPT = `(() => {
  const compositionDuration = Number(window.__player?.getDuration?.()) || 0;
  const startCache = new Map();
  const visiting = new Set();
  const numeric = (value) => {
    const parsed = Number.parseFloat(value ?? "");
    return Number.isFinite(parsed) ? parsed : null;
  };
  const durationForReference = (element) => {
    const explicit = numeric(element.getAttribute("data-duration"));
    if (explicit != null && explicit > 0) return explicit;
    const end = numeric(element.getAttribute("data-end"));
    if (end == null) return 0;
    return Math.max(0, end - resolveStart(element));
  };
  const resolveStart = (element) => {
    if (startCache.has(element)) return startCache.get(element);
    if (visiting.has(element)) return 0;
    visiting.add(element);
    const raw = (element.getAttribute("data-start") ?? "0").trim();
    const absolute = numeric(raw);
    let resolved = 0;
    if (absolute != null && /^[-+]?\\d*\\.?\\d+$/.test(raw)) {
      resolved = Math.max(0, absolute);
    } else {
      const match = raw.match(/^([A-Za-z0-9_.:-]+)(?:\\s*([+-])\\s*(\\d+(?:\\.\\d+)?))?$/);
      if (match) {
        const target = document.getElementById(match[1]) ??
          document.querySelector('[data-composition-id="' + match[1] + '"]');
        if (target) {
          const offset = match[3] ? Number(match[3]) * (match[2] === "-" ? -1 : 1) : 0;
          resolved = Math.max(0, resolveStart(target) + durationForReference(target) + offset);
        }
      }
    }
    visiting.delete(element);
    startCache.set(element, resolved);
    return resolved;
  };
  const media = Array.from(document.querySelectorAll(
    'audio[src], video[src][data-has-audio="true"]'
  ));
  return media.flatMap((element, index) => {
    const src = element.currentSrc || element.src || element.getAttribute("src") || "";
    if (!src) return [];
    const start = resolveStart(element);
    const mediaStart = Math.max(
      0,
      numeric(element.getAttribute("data-playback-start") ??
        element.getAttribute("data-media-start")) ?? 0
    );
    const playbackRate = Math.max(
      0.1,
      Math.min(5, numeric(element.getAttribute("data-playback-rate")) ??
        element.defaultPlaybackRate ?? 1)
    );
    const explicitDuration = numeric(element.getAttribute("data-duration"));
    const explicitEnd = numeric(element.getAttribute("data-end"));
    const naturalDuration = Number.isFinite(element.duration) && element.duration > mediaStart
      ? (element.duration - mediaStart) / playbackRate
      : 0;
    const duration = Math.max(
      0,
      explicitDuration && explicitDuration > 0
        ? explicitDuration
        : explicitEnd && explicitEnd > start
          ? explicitEnd - start
          : naturalDuration > 0
            ? naturalDuration
            : compositionDuration - start
    );
    if (duration <= 0) return [];
    const baseId = element.id || "media";
    const id = baseId + "-" + index;
    element.setAttribute("data-qcut-audio-id", id);
    const volume = Math.max(
      0,
      Math.min(1, numeric(element.getAttribute("data-volume")) ?? element.volume ?? 1)
    );
    return [{
      id,
      src,
      start,
      duration: Math.min(duration, Math.max(0, compositionDuration - start)),
      mediaStart,
      volume,
      playbackRate,
      loop: element.loop,
      type: element.tagName === "VIDEO" ? "video" : "audio",
    }];
  });
})()`;

export const COLLECT_AUDIO_VOLUMES_SCRIPT = `Array.from(
  document.querySelectorAll("[data-qcut-audio-id]")
).map((element) => ({
  id: element.getAttribute("data-qcut-audio-id"),
  volume: Math.max(0, Math.min(1, Number(element.volume) || 0)),
}))`;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function parseAudioElement(value: unknown): HyperframesAudioElement | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		typeof value.src !== "string" ||
		typeof value.start !== "number" ||
		typeof value.duration !== "number" ||
		typeof value.mediaStart !== "number" ||
		typeof value.volume !== "number" ||
		typeof value.playbackRate !== "number" ||
		typeof value.loop !== "boolean" ||
		(value.type !== "audio" && value.type !== "video")
	) {
		return null;
	}
	return {
		id: value.id,
		src: value.src,
		start: value.start,
		duration: value.duration,
		mediaStart: value.mediaStart,
		volume: value.volume,
		playbackRate: value.playbackRate,
		loop: value.loop,
		type: value.type,
	};
}

export function parseRuntimeVolumeValues(value: unknown): RuntimeVolumeValue[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (
			!isRecord(item) ||
			typeof item.id !== "string" ||
			typeof item.volume !== "number" ||
			!Number.isFinite(item.volume)
		) {
			return [];
		}
		return [
			{
				id: item.id,
				volume: Math.max(0, Math.min(1, item.volume)),
			},
		];
	});
}

export async function collectHyperframesAudioElements({
	window,
}: {
	window: BrowserWindow;
}): Promise<HyperframesAudioElement[]> {
	const value: unknown = await window.webContents.executeJavaScript(
		COLLECT_AUDIO_ELEMENTS_SCRIPT,
		true
	);
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		const parsed = parseAudioElement(item);
		return parsed ? [parsed] : [];
	});
}

function extensionForMimeType(mimeType: string): string {
	const normalized = mimeType.toLowerCase();
	if (normalized.includes("mpeg") || normalized.includes("mp3")) return ".mp3";
	if (normalized.includes("wav")) return ".wav";
	if (normalized.includes("ogg")) return ".ogg";
	if (normalized.includes("mp4")) return ".mp4";
	if (normalized.includes("webm")) return ".webm";
	if (normalized.includes("aac")) return ".aac";
	return ".bin";
}

async function writeDataUri({
	src,
	outputDirectory,
	id,
}: {
	src: string;
	outputDirectory: string;
	id: string;
}): Promise<string> {
	const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(src);
	if (!match)
		throw new Error(`Invalid data URI for HyperFrames audio "${id}".`);
	const mimeType = match[1] || "application/octet-stream";
	const payload = match[3];
	const bytes = match[2]
		? Buffer.from(payload, "base64")
		: Buffer.from(decodeURIComponent(payload));
	const outputPath = path.join(
		outputDirectory,
		`${id.replace(/[^A-Za-z0-9_.-]/g, "_")}${extensionForMimeType(mimeType)}`
	);
	await fs.writeFile(outputPath, bytes);
	return outputPath;
}

async function resolveAudioInput({
	element,
	projectPath,
	outputDirectory,
}: {
	element: HyperframesAudioElement;
	projectPath: string;
	outputDirectory: string;
}): Promise<string> {
	if (/^https?:\/\//i.test(element.src)) return element.src;
	if (/^data:/i.test(element.src)) {
		return writeDataUri({
			src: element.src,
			outputDirectory,
			id: element.id,
		});
	}
	if (/^blob:/i.test(element.src)) {
		throw new Error(
			`HyperFrames audio "${element.id}" uses a transient blob URL that cannot be exported.`
		);
	}

	let requestedPath = element.src;
	try {
		const sourceUrl = new URL(element.src);
		if (sourceUrl.protocol === "qcut-hyperframes:") {
			requestedPath = sourceUrl.pathname;
		} else if (sourceUrl.protocol === "file:") {
			throw new Error(
				`HyperFrames audio "${element.id}" uses an unsupported file URL.`
			);
		} else if (sourceUrl.protocol) {
			throw new Error(
				`HyperFrames audio "${element.id}" uses unsupported protocol "${sourceUrl.protocol}".`
			);
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes("HyperFrames audio")) {
			throw error;
		}
		requestedPath = element.src.split(/[?#]/, 1)[0];
	}

	const resolved = resolveHyperframesAsset({
		projectPath,
		urlPath: requestedPath,
	});
	if (!resolved) {
		throw new Error(
			`HyperFrames audio source is missing or outside the project: "${element.src}".`
		);
	}
	return resolved;
}

export async function prepareHyperframesAudioTracks({
	elements,
	volumeSamplesById,
	projectPath,
	outputDirectory,
}: {
	elements: HyperframesAudioElement[];
	volumeSamplesById: ReadonlyMap<string, HyperframesVolumeSample[]>;
	projectPath: string;
	outputDirectory: string;
}): Promise<HyperframesPreparedAudioTrack[]> {
	if (elements.length === 0) return [];
	await fs.mkdir(outputDirectory, { recursive: true });
	return Promise.all(
		elements.map(async (element) => ({
			...element,
			inputPath: await resolveAudioInput({
				element,
				projectPath,
				outputDirectory,
			}),
			volumeSamples: [...(volumeSamplesById.get(element.id) ?? [])],
		}))
	);
}

function simplifyVolumeSamples(
	samples: HyperframesVolumeSample[]
): HyperframesVolumeSample[] {
	if (samples.length < 3) return samples;
	const keep = new Array<boolean>(samples.length).fill(false);
	keep[0] = true;
	keep[samples.length - 1] = true;
	const stack: Array<[number, number]> = [[0, samples.length - 1]];

	while (stack.length > 0) {
		const range = stack.pop();
		if (!range) break;
		const [startIndex, endIndex] = range;
		const start = samples[startIndex];
		const end = samples[endIndex];
		const span = end.time - start.time;
		let maxDistance = VOLUME_SIMPLIFY_EPSILON;
		let splitIndex = -1;
		for (let index = startIndex + 1; index < endIndex; index += 1) {
			const point = samples[index];
			const interpolated =
				span === 0
					? start.volume
					: start.volume +
						((end.volume - start.volume) * (point.time - start.time)) / span;
			const distance = Math.abs(point.volume - interpolated);
			if (distance > maxDistance) {
				maxDistance = distance;
				splitIndex = index;
			}
		}
		if (splitIndex >= 0) {
			keep[splitIndex] = true;
			stack.push([startIndex, splitIndex], [splitIndex, endIndex]);
		}
	}

	const simplified = samples.filter((_sample, index) => keep[index]);
	if (simplified.length <= MAX_VOLUME_SEGMENTS) return simplified;
	const step = (simplified.length - 1) / (MAX_VOLUME_SEGMENTS - 1);
	return Array.from({ length: MAX_VOLUME_SEGMENTS }, (_value, index) => {
		return simplified[Math.round(index * step)];
	}).filter(
		(sample, index, selected) =>
			index === 0 || sample.time > selected[index - 1].time
	);
}

function formatNumber(value: number): string {
	return Number(value.toFixed(6)).toString();
}

function buildVolumeFilter({
	track,
}: {
	track: HyperframesPreparedAudioTrack;
}): string {
	const samples = track.volumeSamples
		.filter(
			(sample) =>
				Number.isFinite(sample.time) &&
				Number.isFinite(sample.volume) &&
				sample.time >= track.start &&
				sample.time <= track.start + track.duration
		)
		.map((sample) => ({
			time: sample.time - track.start,
			volume: Math.max(0, Math.min(1, sample.volume)),
		}))
		.sort((left, right) => left.time - right.time);
	if (samples.length === 0) return `volume=${formatNumber(track.volume)}`;
	if (samples[0].time > 0) {
		samples.unshift({ time: 0, volume: track.volume });
	}

	const deduped: HyperframesVolumeSample[] = [];
	for (const sample of samples) {
		const previous = deduped[deduped.length - 1];
		if (previous && Math.abs(previous.time - sample.time) < 0.000001) {
			previous.volume = sample.volume;
		} else {
			deduped.push(sample);
		}
	}
	const simplified = simplifyVolumeSamples(deduped);
	const hasAutomation = simplified.some(
		(sample) => Math.abs(sample.volume - track.volume) > 0.0001
	);
	if (!hasAutomation || simplified.length < 2) {
		return `volume=${formatNumber(track.volume)}`;
	}

	let expression = formatNumber(
		simplified[simplified.length - 1]?.volume ?? track.volume
	);
	for (let index = simplified.length - 2; index >= 0; index -= 1) {
		const current = simplified[index];
		const next = simplified[index + 1];
		const span = Math.max(0.000001, next.time - current.time);
		const slope = (next.volume - current.volume) / span;
		const segment = `${formatNumber(current.volume)}+(${formatNumber(slope)})*(t-${formatNumber(current.time)})`;
		expression = `if(lt(t,${formatNumber(next.time)}),${segment},${expression})`;
	}
	return `volume=${expression.replace(/\\/g, "\\\\").replace(/,/g, "\\,")}:eval=frame`;
}

function buildAtempoFilters(playbackRate: number): string[] {
	let remaining = Math.max(0.1, Math.min(5, playbackRate));
	const factors: number[] = [];
	while (remaining < 0.5) {
		factors.push(0.5);
		remaining /= 0.5;
	}
	while (remaining > 2) {
		factors.push(2);
		remaining /= 2;
	}
	if (Math.abs(remaining - 1) > 0.000001) factors.push(remaining);
	return factors.map((factor) => `atempo=${formatNumber(factor)}`);
}

interface HyperframesEncodeOptions {
	framesPattern: string;
	outputPath: string;
	fps: number;
	duration?: number;
	audioTracks?: HyperframesPreparedAudioTrack[];
}

function buildHyperframesEncodePreamble({
	framesPattern,
	fps,
	duration,
	audioTracks = [],
}: Omit<HyperframesEncodeOptions, "outputPath">): {
	args: string[];
	hasAudio: boolean;
} {
	const args = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-framerate",
		String(fps),
		"-start_number",
		"0",
		"-i",
		framesPattern,
	];

	for (const track of audioTracks) {
		if (track.loop) args.push("-stream_loop", "-1");
		args.push("-i", track.inputPath);
	}

	if (audioTracks.length > 0 && duration !== undefined) {
		const filterParts = audioTracks.map((track, index) => {
			const inputIndex = index + 1;
			const tempoFilters = buildAtempoFilters(track.playbackRate);
			const filters = [
				`atrim=start=${formatNumber(track.mediaStart)}`,
				"asetpts=PTS-STARTPTS",
				...tempoFilters,
				`atrim=duration=${formatNumber(track.duration)}`,
				"aresample=48000",
				"aformat=channel_layouts=stereo",
				buildVolumeFilter({ track }),
				`adelay=${Math.max(0, Math.round(track.start * 1000))}:all=1`,
				`apad=whole_dur=${formatNumber(duration)}`,
				`atrim=duration=${formatNumber(duration)}`,
			];
			return `[${inputIndex}:a:0]${filters.join(",")}[ha${index}]`;
		});
		const mixInputs = audioTracks
			.map((_track, index) => `[ha${index}]`)
			.join("");
		filterParts.push(
			`${mixInputs}amix=inputs=${audioTracks.length}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.98,atrim=duration=${formatNumber(duration)}[haout]`
		);
		args.push(
			"-filter_complex",
			filterParts.join(";"),
			"-map",
			"0:v:0",
			"-map",
			"[haout]"
		);
	}

	return {
		args,
		hasAudio: audioTracks.length > 0 && duration !== undefined,
	};
}

export function buildHyperframesEncodeArgs({
	framesPattern,
	outputPath,
	fps,
	duration,
	audioTracks = [],
}: HyperframesEncodeOptions): string[] {
	const { args, hasAudio } = buildHyperframesEncodePreamble({
		framesPattern,
		fps,
		duration,
		audioTracks,
	});
	args.push(
		"-c:v",
		"prores_ks",
		"-profile:v",
		"4",
		"-pix_fmt",
		"yuva444p10le",
		"-r",
		String(fps)
	);
	if (hasAudio && duration !== undefined) {
		args.push(
			"-c:a",
			"pcm_s16le",
			"-ar",
			"48000",
			"-ac",
			"2",
			"-t",
			formatNumber(duration)
		);
	} else {
		args.push("-an");
	}
	args.push("-y", outputPath);
	return args;
}

export function buildHyperframesBrowserEncodeArgs({
	framesPattern,
	outputPath,
	fps,
	duration,
	audioTracks = [],
}: HyperframesEncodeOptions): string[] {
	const { args, hasAudio } = buildHyperframesEncodePreamble({
		framesPattern,
		fps,
		duration,
		audioTracks,
	});
	args.push(
		"-c:v",
		"libvpx-vp9",
		"-lossless",
		"1",
		"-pix_fmt",
		"yuva420p",
		"-auto-alt-ref",
		"0",
		"-deadline",
		"good",
		"-cpu-used",
		"2",
		"-metadata:s:v:0",
		"alpha_mode=1",
		"-r",
		String(fps)
	);
	if (hasAudio) {
		args.push("-c:a", "libopus", "-b:a", "192k", "-ar", "48000", "-ac", "2");
	} else {
		args.push("-an");
	}
	if (duration !== undefined) {
		args.push("-t", formatNumber(duration));
	}
	args.push("-y", outputPath);
	return args;
}
