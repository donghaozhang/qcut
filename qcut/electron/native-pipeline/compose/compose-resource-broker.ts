import {
	JIANYING_TRANSITIONS,
	type JianyingTransitionDefinition,
} from "../../jianying-transition-catalog.js";
import { inspectJianyingTransitionRuntime } from "../../jianying-transition/runtime-discovery.js";
import { resolveStickerLabRootOverride } from "../cli/sticker-lab-root.js";
import {
	discoverLocalReferences,
	type LocalStickerLabDiscovery,
} from "../stickers/local-reference-catalog/index.js";
import {
	listSoundEffectsLabAssets,
	type ResolvedSoundEffectsLabAsset,
} from "../sounds/sound-effects-lab-client.js";
import {
	defaultSoundEffectsLabManifestSource,
	hasSoundEffectsLabCredentials,
} from "../sounds/sound-effects-lab-config.js";
import { TRANSITION_LAB_RECIPES } from "../transitions/transition-lab-catalog.js";
import type {
	ComposeAssetReference,
	ComposeSnapshot,
} from "./compose-protocol.js";

const DEFAULT_PER_TYPE_LIMIT = 24;
const MAX_PER_TYPE_LIMIT = 100;

export interface ComposeResourceBrokerResult {
	resources: ComposeAssetReference[];
	warnings: string[];
	capabilities: {
		resourceBroker: true;
		jianyingLocalTransitions: boolean;
	};
}

export interface ComposeResourceBrokerDependencies {
	discoverLabs?: typeof import("./compose-lab-candidates.js").discoverComposeLabCandidates;
	discoverStickers: typeof discoverLocalReferences;
	listSounds: typeof listSoundEffectsLabAssets;
	inspectJianyingTransitions: typeof inspectJianyingTransitionRuntime;
}

const DEFAULT_DEPENDENCIES: ComposeResourceBrokerDependencies = {
	discoverLabs: async () =>
		(
			await import("./compose-lab-candidates.js")
		).discoverComposeLabCandidates(),
	discoverStickers: discoverLocalReferences,
	listSounds: listSoundEffectsLabAssets,
	inspectJianyingTransitions: inspectJianyingTransitionRuntime,
};

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

function normalizedLimit({ value }: { value?: number }): number {
	if (!(typeof value === "number" && Number.isFinite(value) && value > 0)) {
		return DEFAULT_PER_TYPE_LIMIT;
	}
	return Math.min(MAX_PER_TYPE_LIMIT, Math.floor(value));
}

function queryTerms({ query }: { query: string }): string[] {
	const words = query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
	const terms = new Set<string>();
	for (const word of words) {
		if (word.length > 1) terms.add(word);
		if (!/[\u3400-\u9fff]/u.test(word)) continue;
		for (let index = 0; index + 1 < word.length; index += 1) {
			terms.add(word.slice(index, index + 2));
		}
	}
	return [...terms].slice(0, 40);
}

function candidateScore({
	query,
	terms,
	resource,
}: {
	query: string;
	terms: string[];
	resource: ComposeAssetReference;
}): number {
	const haystack = [
		resource.displayName ?? "",
		resource.assetId,
		...(resource.tags ?? []),
	]
		.join(" ")
		.toLocaleLowerCase();
	const normalizedQuery = query.trim().toLocaleLowerCase();
	let score = normalizedQuery && haystack.includes(normalizedQuery) ? 20 : 0;
	for (const term of terms) {
		if (haystack.includes(term)) score += term.length + 2;
	}
	return score;
}

function selectCandidates({
	query,
	resources,
	limit,
}: {
	query: string;
	resources: ComposeAssetReference[];
	limit: number;
}): ComposeAssetReference[] {
	const terms = queryTerms({ query });
	return resources
		.map((resource, index) => ({
			index,
			resource,
			score: candidateScore({ query, terms, resource }),
		}))
		.sort(
			(left, right) =>
				right.score - left.score ||
				left.index - right.index ||
				left.resource.assetId.localeCompare(right.resource.assetId)
		)
		.slice(0, limit)
		.map(({ resource }) => resource);
}

function stickerResources({
	discovery,
}: {
	discovery: LocalStickerLabDiscovery;
}): ComposeAssetReference[] {
	return discovery.catalogs.flatMap((catalog) =>
		catalog.categories.flatMap((category) =>
			category.items.map((item) => ({
				provider: "local" as const,
				assetType: "sticker" as const,
				assetId: `sticker-lab:${catalog.batchId}:${item.id}`,
				displayName: item.displayName,
				tags: [category.label, category.sourcePanel, item.sourceKind],
				availability: "ready" as const,
				license: "personal-only" as const,
				capabilities: {
					preview: true,
					editorApply: true,
					editorExport: true,
					headlessRender: item.runtimePackage === undefined,
				},
				provenance: {
					backend: "sticker-lab",
					batchId: catalog.batchId,
					categoryId: category.id,
					sourceKind: item.sourceKind,
					animated: item.playback.kind === "animated",
				},
			}))
		)
	);
}

function soundResource({
	asset,
}: {
	asset: ResolvedSoundEffectsLabAsset;
}): ComposeAssetReference {
	return {
		provider: "qcut",
		assetType: "sound-effect",
		assetId: `sound-effects-lab:${asset.id}`,
		displayName: asset.name,
		tags: asset.tags,
		duration: asset.durationSeconds ?? undefined,
		availability: asset.localPath ? "ready" : "downloadable",
		license: "commercial-ok",
		capabilities: {
			preview: true,
			editorApply: true,
			editorExport: true,
			headlessRender: true,
			requiresAuth: !asset.localPath,
		},
		provenance: {
			backend: "sound-effects-lab",
			provider: asset.provider,
			redistribution: asset.redistribution,
		},
	};
}

function qcutTransitionResources(): ComposeAssetReference[] {
	return TRANSITION_LAB_RECIPES.map((recipe) => ({
		provider: "local",
		assetType: "transition",
		assetId: recipe.id,
		displayName: recipe.localizedName,
		tags: [recipe.name, recipe.clip.type, recipe.clip.direction ?? ""].filter(
			(tag) => tag.length > 0
		),
		duration: recipe.defaultDuration,
		availability: "ready",
		license: "commercial-ok",
		capabilities: {
			preview: true,
			editorApply: true,
			editorExport: true,
			headlessRender: false,
		},
		provenance: {
			backend: "transition-lab",
			origin: recipe.shader.origin,
		},
	}));
}

function jianyingTransitionResource({
	transition,
}: {
	transition: JianyingTransitionDefinition;
}): ComposeAssetReference {
	return {
		provider: "local",
		assetType: "transition",
		assetId: transition.id,
		displayName: transition.localizedName,
		tags: [
			transition.name,
			transition.group,
			transition.family,
			transition.preview.type,
		],
		duration: transition.defaultDuration,
		availability: "ready",
		license: "personal-only",
		capabilities: {
			preview: true,
			editorApply: true,
			editorExport: true,
			headlessRender: false,
			requiresLocalRuntime: true,
		},
		provenance: {
			backend: "jianying-local",
			group: transition.group,
			access: transition.access,
			runtimeKind: transition.runtimeKind,
		},
	};
}

export function composeResourceQuery({
	snapshot,
	intentQuery,
}: {
	snapshot: Pick<ComposeSnapshot, "captions" | "shots">;
	intentQuery?: unknown;
}): string {
	if (typeof intentQuery === "string" && intentQuery.trim()) {
		return intentQuery.trim().slice(0, 500);
	}
	return [
		...snapshot.captions.map((caption) => caption.text),
		...snapshot.shots.map((shot) => shot.label ?? ""),
	]
		.join(" ")
		.trim()
		.slice(0, 500);
}

export async function discoverComposeResources({
	query = "",
	perTypeLimit,
	signal,
	generatedMedia = [],
	dependencies = DEFAULT_DEPENDENCIES,
}: {
	query?: string;
	perTypeLimit?: number;
	signal?: AbortSignal;
	generatedMedia?: ComposeAssetReference[];
	dependencies?: ComposeResourceBrokerDependencies;
} = {}): Promise<ComposeResourceBrokerResult> {
	const limit = normalizedLimit({ value: perTypeLimit });
	const warnings: string[] = [];
	const stickerPromise = dependencies
		.discoverStickers({
			rootPath: resolveStickerLabRootOverride({}),
		})
		.catch((error: unknown) => {
			warnings.push(`Sticker Lab: ${errorMessage({ error })}`);
			return null;
		});
	const soundSource = defaultSoundEffectsLabManifestSource();
	const soundPromise = hasSoundEffectsLabCredentials({ source: soundSource })
		? dependencies
				.listSounds({ source: soundSource, signal })
				.catch((error: unknown) => {
					warnings.push(`Sound Effects Lab: ${errorMessage({ error })}`);
					return [];
				})
		: Promise.resolve([]);
	const transitionPromise = dependencies
		.inspectJianyingTransitions()
		.catch((error: unknown) => {
			warnings.push(`Jianying transitions: ${errorMessage({ error })}`);
			return null;
		});

	const [stickerDiscovery, sounds, transitionInspection] = await Promise.all([
		stickerPromise,
		soundPromise,
		transitionPromise,
	]);
	const reusableSounds = sounds.filter((asset) => asset.reusable);
	const restrictedSoundCount = sounds.length - reusableSounds.length;
	if (restrictedSoundCount > 0) {
		warnings.push(
			`Sound Effects Lab omitted ${restrictedSoundCount} reference-only asset(s) from Compose candidates.`
		);
	}
	const availableTransitionIds = new Set(
		transitionInspection?.status.transitions
			.filter((transition) => transition.available)
			.map((transition) => transition.id) ?? []
	);
	const jianyingTransitions = JIANYING_TRANSITIONS.filter((transition) =>
		availableTransitionIds.has(transition.id)
	).map((transition) => jianyingTransitionResource({ transition }));

	const resources = [
		...selectCandidates({
			query,
			resources: stickerDiscovery
				? stickerResources({ discovery: stickerDiscovery })
				: [],
			limit,
		}),
		...selectCandidates({
			query,
			resources: reusableSounds.map((asset) => soundResource({ asset })),
			limit,
		}),
		...selectCandidates({
			query,
			resources: [...qcutTransitionResources(), ...jianyingTransitions],
			limit,
		}),
	];
	const labs = await dependencies.discoverLabs?.().catch(() => ({
		resources: [],
		warnings: ["Compose Lab discovery unavailable."],
	}));
	warnings.push(...(labs?.warnings ?? []));
	const additional = [
		...(labs?.resources ?? []),
		...generatedMedia.filter(
			(asset) =>
				asset.assetType === "generated-media" &&
				asset.availability === "ready" &&
				asset.capabilities?.editorApply === true
		),
	];
	for (const assetType of new Set(additional.map((asset) => asset.assetType))) {
		resources.push(
			...selectCandidates({
				query,
				resources: additional.filter((asset) => asset.assetType === assetType),
				limit,
			})
		);
	}

	return {
		resources,
		warnings,
		capabilities: {
			resourceBroker: true,
			jianyingLocalTransitions: jianyingTransitions.length > 0,
		},
	};
}
