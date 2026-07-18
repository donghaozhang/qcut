import type {
	AssetManifestEntry,
	EffectAudioCompanion,
	EffectInstance,
} from "@qcut/editor-core";
import { platform } from "@qcut/platform-core";
import {
	ensureAssetResources,
	type ResolvedAssetResource,
} from "@/lib/assets/asset-resource-cache";
import { resolveEffectSoundAsset } from "@/lib/effects/effect-sound-resources";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import type { AudioFileInput } from "../types";

interface EffectCompanionAudioExportAPI {
	saveTemp: (audioData: Uint8Array, filename: string) => Promise<string>;
}

interface EffectCompanionReference {
	effect: EffectInstance;
	element: TimelineElement;
	trackId: string;
	companion: EffectAudioCompanion;
	duration: number;
}

type EnsureSourceResource = ({
	asset,
}: {
	asset: AssetManifestEntry;
}) => Promise<ResolvedAssetResource[]>;

function validateCompanion({
	companion,
	effectId,
}: {
	companion: EffectAudioCompanion;
	effectId: string;
}): void {
	const values = [
		companion.offsetSeconds,
		companion.durationSeconds,
		companion.gain,
	];
	if (values.some((value) => !Number.isFinite(value))) {
		throw new Error(`Effect companion audio has invalid timing: ${effectId}`);
	}
	if (companion.offsetSeconds < 0 || companion.durationSeconds <= 0) {
		throw new Error(`Effect companion audio has an invalid range: ${effectId}`);
	}
	if (companion.gain < 0) {
		throw new Error(`Effect companion audio has invalid gain: ${effectId}`);
	}
}

function collectCompanionReferences({
	tracks,
	effectsByElementId,
	fps,
}: {
	tracks: readonly TimelineTrack[];
	effectsByElementId: ReadonlyMap<string, readonly EffectInstance[]>;
	fps: number;
}): EffectCompanionReference[] {
	const references: EffectCompanionReference[] = [];
	for (const track of tracks) {
		if (track.muted) continue;
		for (const element of track.elements) {
			if (element.hidden) continue;
			const effects = effectsByElementId.get(element.id) ?? [];
			for (const effect of effects) {
				if (!effect.enabled || !effect.audioCompanion) continue;
				validateCompanion({
					companion: effect.audioCompanion,
					effectId: effect.id,
				});
				const timelineDuration =
					element.type === "media"
						? getMediaTimelineDuration(element, fps)
						: Math.max(
								0,
								element.duration - element.trimStart - element.trimEnd
							);
				const availableDuration =
					timelineDuration - effect.audioCompanion.offsetSeconds;
				const duration = Math.min(
					effect.audioCompanion.durationSeconds,
					availableDuration
				);
				if (duration <= 0 || effect.audioCompanion.gain === 0) continue;
				references.push({
					effect,
					element,
					trackId: track.id,
					companion: effect.audioCompanion,
					duration,
				});
			}
		}
	}
	return references;
}

function safeFileName({
	resourceId,
	sourceUrl,
}: {
	resourceId: string;
	sourceUrl: string;
}): string {
	const extension = sourceUrl.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
	const safeId = resourceId.replace(/[^a-zA-Z0-9._-]/g, "_");
	return `effect-audio-${safeId}.${extension || "ogg"}`;
}

async function materializeCompanionAudio({
	api,
	asset,
	ensureSourceResource,
}: {
	api: EffectCompanionAudioExportAPI;
	asset: AssetManifestEntry;
	ensureSourceResource: EnsureSourceResource;
}): Promise<string> {
	const resources = await ensureSourceResource({ asset });
	const source = resources.find((resource) => resource.role === "source");
	if (!source?.blob) {
		throw new Error(
			`Effect sound resource has no exportable bytes: ${asset.id}`
		);
	}
	const path = await api.saveTemp(
		new Uint8Array(await source.blob.arrayBuffer()),
		safeFileName({ resourceId: asset.id, sourceUrl: source.sourceUrl })
	);
	if (!path) {
		throw new Error(`Effect sound resource saved without a path: ${asset.id}`);
	}
	return path;
}

/** Converts enabled effect companions into regular FFmpeg audio mix inputs. */
export async function extractEffectCompanionAudioSources({
	tracks,
	effectsByElementId,
	fps,
	api = platform().audio,
	ensureSourceResource = ({ asset }) =>
		ensureAssetResources({
			asset,
			roles: ["source"],
			cacheBundledResources: true,
		}),
}: {
	tracks: readonly TimelineTrack[];
	effectsByElementId: ReadonlyMap<string, readonly EffectInstance[]>;
	fps: number;
	api?: EffectCompanionAudioExportAPI;
	ensureSourceResource?: EnsureSourceResource;
}): Promise<AudioFileInput[]> {
	const references = collectCompanionReferences({
		tracks,
		effectsByElementId,
		fps,
	});
	if (references.length === 0) return [];
	if (!api?.saveTemp) {
		throw new Error("Effect companion audio export API is unavailable");
	}

	const pathByResourceId = new Map<string, Promise<string>>();
	const resolvePath = ({ resourceId }: { resourceId: string }) => {
		const existing = pathByResourceId.get(resourceId);
		if (existing) return existing;
		const { asset } = resolveEffectSoundAsset({ resourceId });
		const pending = materializeCompanionAudio({
			api,
			asset,
			ensureSourceResource,
		});
		pathByResourceId.set(resourceId, pending);
		return pending;
	};

	const sources = await Promise.all(
		references.map(
			async ({ effect, element, trackId, companion, duration }) => ({
				elementId: effect.id,
				trackId,
				path: await resolvePath({ resourceId: companion.resourceId }),
				startTime: element.startTime + companion.offsetSeconds,
				volume: companion.gain,
				trimStart: 0,
				trimEnd: 0,
				duration,
			})
		)
	);
	return sources.sort((left, right) => left.startTime - right.startTime);
}
