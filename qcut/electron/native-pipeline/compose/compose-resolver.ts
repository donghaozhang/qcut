import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";
import type { JianyingFilterCatalogExport } from "../../jianying-filter-catalog-export.js";
import { getFFprobePath } from "../../ffmpeg/paths.js";
import { exportCatalogDefault } from "../cli/cli-handlers-filter-lab-catalog.js";
import { resolveFilterLabRenderPlan } from "../filters/filter-lab-render-plan.js";
import type { FilterLabRenderPlan } from "../filters/filter-lab-render-plan.js";
import type {
	ComposeAudio,
	ComposeClip,
	ComposeOverlay,
	ComposeTransition,
	LoadedComposeManifest,
} from "./compose-manifest.js";

const execFileAsync = promisify(execFile);
const STICKER_EXTENSIONS = new Set([".jpeg", ".jpg", ".png", ".svg", ".webp"]);

export interface ComposeMediaProbe {
	duration: number;
	width: number;
	height: number;
	frameRate: number;
	hasVideo: boolean;
	hasAudio: boolean;
}

export interface ComposeAssetIdentity {
	sha256: string;
	bytes: number;
}

export interface ResolvedComposeClip {
	clip: ComposeClip;
	sourcePath: string;
	media: ComposeMediaProbe;
	duration: number;
	filterPlans: FilterLabRenderPlan[];
}

export interface ResolvedComposeOverlay {
	overlay: ComposeOverlay;
	sourcePath: string;
	identity: ComposeAssetIdentity;
}

export interface ResolvedComposeAudio {
	audio: ComposeAudio;
	sourcePath: string;
	media: ComposeMediaProbe;
	duration: number;
	identity: ComposeAssetIdentity;
}

export interface ComposeLock {
	schemaVersion: 1;
	kind: "qcut-compose-lock-v1";
	configSha256: string;
	canvas: LoadedComposeManifest["manifest"]["canvas"];
	duration: number;
	assets: Array<{
		role: "clip" | "sticker" | "sound-effect";
		id: string;
		source: string;
		sha256: string;
		bytes: number;
	}>;
	filters: Array<{
		clipId: string;
		index: number;
		resourceId: string;
		title: string;
		version: string;
		intensity: number;
		backend: string;
		fidelity: string;
		verification: string;
	}>;
	transitions: Array<{
		between: [string, string];
		preset: "crossfade";
		duration: number;
	}>;
}

export interface ResolvedComposeProject {
	loaded: LoadedComposeManifest;
	clips: ResolvedComposeClip[];
	transitionsByCut: Array<ComposeTransition | undefined>;
	overlays: ResolvedComposeOverlay[];
	audio: ResolvedComposeAudio[];
	duration: number;
	lock: ComposeLock;
}

export interface ComposeResolverDependencies {
	probeMedia: typeof probeComposeMedia;
	inspectAsset: typeof inspectComposeAsset;
	exportCatalog: () => Promise<JianyingFilterCatalogExport>;
	resolveFilterPlan: typeof resolveFilterLabRenderPlan;
}

export async function probeComposeMedia({
	filePath,
	signal,
}: {
	filePath: string;
	signal: AbortSignal;
}): Promise<ComposeMediaProbe> {
	const { stdout } = await execFileAsync(
		await getFFprobePath(),
		["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath],
		{ signal, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }
	);
	const payload = JSON.parse(String(stdout)) as {
		streams?: Array<{
			codec_type?: string;
			width?: number;
			height?: number;
			avg_frame_rate?: string;
			r_frame_rate?: string;
			duration?: string;
		}>;
		format?: { duration?: string };
	};
	const video = payload.streams?.find(
		({ codec_type }) => codec_type === "video"
	);
	const audio = payload.streams?.find(
		({ codec_type }) => codec_type === "audio"
	);
	const duration = Number(
		video?.duration ?? audio?.duration ?? payload.format?.duration ?? 0
	);
	const rateText = video?.avg_frame_rate ?? video?.r_frame_rate ?? "0/1";
	const [numeratorText = "0", denominatorText = "1"] = rateText.split("/");
	const numerator = Number(numeratorText);
	const denominator = Number(denominatorText);
	const frameRate = denominator === 0 ? 0 : numerator / denominator;
	return {
		duration: Number.isFinite(duration) ? duration : 0,
		width: Number(video?.width ?? 0),
		height: Number(video?.height ?? 0),
		frameRate: Number.isFinite(frameRate) ? frameRate : 0,
		hasVideo: Boolean(video),
		hasAudio: Boolean(audio),
	};
}

export async function inspectComposeAsset({
	filePath,
}: {
	filePath: string;
}): Promise<ComposeAssetIdentity> {
	await access(filePath);
	const metadata = await stat(filePath);
	if (!metadata.isFile())
		throw new Error(`Compose asset is not a file: ${filePath}`);
	const sha256 = await new Promise<string>((resolveHash, rejectHash) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.once("error", rejectHash);
		stream.once("end", () => resolveHash(hash.digest("hex")));
	});
	return { sha256, bytes: metadata.size };
}

function resolveSource({
	configDirectory,
	source,
}: {
	configDirectory: string;
	source: string;
}): string {
	return resolve(configDirectory, source);
}

function requireClipMedia({
	clip,
	media,
}: {
	clip: ComposeClip;
	media: ComposeMediaProbe;
}): number {
	if (!media.hasVideo || media.duration <= 0) {
		throw new Error(`Clip ${clip.id} must be a readable video with duration.`);
	}
	if (clip.trim.in >= media.duration) {
		throw new Error(`Clip ${clip.id} trim.in is outside the source duration.`);
	}
	const trimOut = clip.trim.out ?? media.duration;
	if (trimOut > media.duration + 0.05) {
		throw new Error(`Clip ${clip.id} trim.out is outside the source duration.`);
	}
	return trimOut - clip.trim.in;
}

function resolveTransitions({
	clips,
	transitions,
}: {
	clips: ResolvedComposeClip[];
	transitions: ComposeTransition[];
}): Array<ComposeTransition | undefined> {
	const cuts = Array.from<ComposeTransition | undefined>({
		length: Math.max(0, clips.length - 1),
	});
	for (const transition of transitions) {
		const cutIndex = clips.findIndex(
			({ clip }, index) =>
				clip.id === transition.between[0] &&
				clips[index + 1]?.clip.id === transition.between[1]
		);
		if (cutIndex < 0) {
			throw new Error(
				`Transition ${transition.between.join(" -> ")} must connect adjacent clips in manifest order.`
			);
		}
		if (cuts[cutIndex]) {
			throw new Error(
				`Cut ${transition.between.join(" -> ")} has two transitions.`
			);
		}
		const available = Math.min(
			clips[cutIndex].duration,
			clips[cutIndex + 1].duration
		);
		if (transition.duration >= available) {
			throw new Error(
				`Transition ${transition.between.join(" -> ")} must be shorter than both clips.`
			);
		}
		cuts[cutIndex] = transition;
	}
	return cuts;
}

function requireTimelineBounds({
	duration,
	overlays,
	audio,
}: {
	duration: number;
	overlays: ResolvedComposeOverlay[];
	audio: ResolvedComposeAudio[];
}): void {
	for (const { overlay } of overlays) {
		if (overlay.start + overlay.duration > duration + 0.05) {
			throw new Error(`Sticker ${overlay.source} ends after the timeline.`);
		}
		const { x, y, scale } = overlay.transform;
		if (x + scale <= 0 || y + scale <= 0 || x >= 1 || y >= 1) {
			throw new Error(`Sticker ${overlay.source} is outside the canvas.`);
		}
	}
	for (const item of audio) {
		if (item.audio.start + item.duration > duration + 0.05) {
			throw new Error(
				`Sound effect ${item.audio.source} ends after the timeline.`
			);
		}
		if (item.audio.fadeIn + item.audio.fadeOut > item.duration) {
			throw new Error(
				`Sound effect ${item.audio.source} fades exceed its trimmed duration.`
			);
		}
	}
}

async function resolveFilterPlans({
	loaded,
	catalog,
	dependencies,
}: {
	loaded: LoadedComposeManifest;
	catalog: JianyingFilterCatalogExport;
	dependencies: ComposeResolverDependencies;
}): Promise<FilterLabRenderPlan[][]> {
	const cards = new Map(catalog.cards.map((card) => [card.resourceId, card]));
	return Promise.all(
		loaded.manifest.clips.map(({ filters }) =>
			Promise.all(
				filters.map(({ resourceId, intensity }) => {
					const card = cards.get(resourceId);
					if (!card) {
						throw new Error(
							`Filter ${resourceId} is not in the local catalog.`
						);
					}
					return dependencies.resolveFilterPlan({ card, intensity });
				})
			)
		)
	);
}

export async function resolveComposeProject({
	loaded,
	signal,
	dependencies: dependencyOverrides = {},
}: {
	loaded: LoadedComposeManifest;
	signal: AbortSignal;
	dependencies?: Partial<ComposeResolverDependencies>;
}): Promise<ResolvedComposeProject> {
	const dependencies: ComposeResolverDependencies = {
		probeMedia: probeComposeMedia,
		inspectAsset: inspectComposeAsset,
		exportCatalog: exportCatalogDefault,
		resolveFilterPlan: resolveFilterLabRenderPlan,
		...dependencyOverrides,
	};
	signal.throwIfAborted();
	const filterCount = loaded.manifest.clips.reduce(
		(total, clip) => total + clip.filters.length,
		0
	);
	const catalog =
		filterCount > 0
			? await dependencies.exportCatalog()
			: { count: 0, cards: [] };
	const [filterPlans, clipAssets, overlayAssets, audioAssets, configIdentity] =
		await Promise.all([
			resolveFilterPlans({ loaded, catalog, dependencies }),
			Promise.all(
				loaded.manifest.clips.map(async (clip) => {
					const sourcePath = resolveSource({
						configDirectory: loaded.configDirectory,
						source: clip.source,
					});
					const [media, identity] = await Promise.all([
						dependencies.probeMedia({ filePath: sourcePath, signal }),
						dependencies.inspectAsset({ filePath: sourcePath }),
					]);
					return { clip, sourcePath, media, identity };
				})
			),
			Promise.all(
				loaded.manifest.overlays.map(async (overlay) => {
					const sourcePath = resolveSource({
						configDirectory: loaded.configDirectory,
						source: overlay.source,
					});
					if (!STICKER_EXTENSIONS.has(extname(sourcePath).toLowerCase())) {
						throw new Error(`Unsupported sticker source: ${overlay.source}`);
					}
					return {
						overlay,
						sourcePath,
						identity: await dependencies.inspectAsset({ filePath: sourcePath }),
					};
				})
			),
			Promise.all(
				loaded.manifest.audio.map(async (audio) => {
					const sourcePath = resolveSource({
						configDirectory: loaded.configDirectory,
						source: audio.source,
					});
					const [media, identity] = await Promise.all([
						dependencies.probeMedia({ filePath: sourcePath, signal }),
						dependencies.inspectAsset({ filePath: sourcePath }),
					]);
					if (!media.hasAudio || media.duration <= 0) {
						throw new Error(
							`Sound effect ${audio.source} has no audio stream.`
						);
					}
					if (audio.trim.in >= media.duration) {
						throw new Error(
							`Sound effect ${audio.source} trim.in is outside the source.`
						);
					}
					const trimOut = audio.trim.out ?? media.duration;
					if (trimOut > media.duration + 0.05) {
						throw new Error(
							`Sound effect ${audio.source} trim.out is outside the source.`
						);
					}
					return {
						audio,
						sourcePath,
						media,
						duration: trimOut - audio.trim.in,
						identity,
					};
				})
			),
			dependencies.inspectAsset({ filePath: loaded.configPath }),
		]);
	const clips = clipAssets.map(
		({ clip, sourcePath, media }, index): ResolvedComposeClip => ({
			clip,
			sourcePath,
			media,
			duration: requireClipMedia({ clip, media }),
			filterPlans: filterPlans[index],
		})
	);
	const transitionsByCut = resolveTransitions({
		clips,
		transitions: loaded.manifest.transitions,
	});
	const duration =
		clips.reduce((total, clip) => total + clip.duration, 0) -
		transitionsByCut.reduce(
			(total, transition) => total + (transition?.duration ?? 0),
			0
		);
	requireTimelineBounds({
		duration,
		overlays: overlayAssets,
		audio: audioAssets,
	});
	const assets: ComposeLock["assets"] = [
		...clipAssets.map(({ clip, identity }) => ({
			role: "clip" as const,
			id: clip.id,
			source: clip.source,
			...identity,
		})),
		...overlayAssets.map(({ overlay, identity }, index) => ({
			role: "sticker" as const,
			id: `sticker-${index + 1}`,
			source: overlay.source,
			...identity,
		})),
		...audioAssets.map(({ audio, identity }, index) => ({
			role: "sound-effect" as const,
			id: `sound-effect-${index + 1}`,
			source: audio.source,
			...identity,
		})),
	];
	return {
		loaded,
		clips,
		transitionsByCut,
		overlays: overlayAssets,
		audio: audioAssets,
		duration,
		lock: {
			schemaVersion: 1,
			kind: "qcut-compose-lock-v1",
			configSha256: configIdentity.sha256,
			canvas: loaded.manifest.canvas,
			duration,
			assets,
			filters: clips.flatMap(({ clip, filterPlans }) =>
				filterPlans.map(({ evidence }, index) => ({
					clipId: clip.id,
					index,
					resourceId: evidence.resourceId,
					title: evidence.title,
					version: evidence.version,
					intensity: evidence.intensity,
					backend: evidence.backend,
					fidelity: evidence.fidelity,
					verification: evidence.verification,
				}))
			),
			transitions: loaded.manifest.transitions,
		},
	};
}
