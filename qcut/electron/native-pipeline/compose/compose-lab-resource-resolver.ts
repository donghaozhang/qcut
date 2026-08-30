import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import {
	JIANYING_TRANSITIONS,
	type JianyingTransitionDefinition,
} from "../../jianying-transition-catalog.js";
import {
	inspectJianyingTransitionRuntime,
	type JianyingRuntimeInspection,
} from "../../jianying-transition/runtime-discovery.js";
import {
	materializeSoundEffectsLabAsset,
	resolveSoundEffectsLabAsset,
	type ResolvedSoundEffectsLabAsset,
} from "../sounds/sound-effects-lab-client.js";
import {
	defaultSoundEffectsLabManifestSource,
	type SoundEffectsLabManifestSource,
} from "../sounds/sound-effects-lab-config.js";
import {
	TRANSITION_LAB_RECIPES,
	type TransitionLabRecipe,
} from "../transitions/transition-lab-catalog.js";
import type { ComposeAssetReference } from "./compose-protocol.js";

const SOUND_EFFECTS_LAB_PREFIX = "sound-effects-lab:";
const EDITOR_TRANSITION_PRESETS = new Set([
	"crossfade",
	"dissolve",
	"whip-pan-right",
]);

export interface ComposeLabResourceDependencies {
	resolveSound: typeof resolveSoundEffectsLabAsset;
	materializeSound: typeof materializeSoundEffectsLabAsset;
	inspectJianyingTransitions: typeof inspectJianyingTransitionRuntime;
}

const DEFAULT_DEPENDENCIES: ComposeLabResourceDependencies = {
	resolveSound: resolveSoundEffectsLabAsset,
	materializeSound: materializeSoundEffectsLabAsset,
	inspectJianyingTransitions: inspectJianyingTransitionRuntime,
};

export type ComposeSoundLabResolution =
	| {
			status: "ready";
			asset: ResolvedSoundEffectsLabAsset;
	  }
	| {
			status: "downloadable";
			asset: ResolvedSoundEffectsLabAsset;
	  }
	| {
			status: "missing";
			detail: string;
			asset?: ResolvedSoundEffectsLabAsset;
	  }
	| {
			status: "reference-only";
			detail: string;
			asset: ResolvedSoundEffectsLabAsset;
	  };

export interface MaterializedComposeSound {
	localPath: string;
	sha256: string;
	bytes: number;
	asset: ResolvedSoundEffectsLabAsset;
}

export type ComposeTransitionResolution =
	| {
			status: "ready";
			backend: "editor-preset";
			presetId: string;
	  }
	| {
			status: "ready";
			backend: "transition-lab";
			presetId: string;
			recipe: TransitionLabRecipe;
	  }
	| {
			status: "ready";
			backend: "jianying-local";
			presetId: string;
			packageHash: string;
			definition: JianyingTransitionDefinition;
	  }
	| {
			status: "unsupported";
			backend: "editor-preset" | "jianying-local";
			detail: string;
	  };

function dependenciesWithDefaults({
	dependencies,
}: {
	dependencies?: Partial<ComposeLabResourceDependencies>;
}): ComposeLabResourceDependencies {
	return { ...DEFAULT_DEPENDENCIES, ...dependencies };
}

export function parseSoundEffectsLabAssetId({
	assetId,
}: {
	assetId: string;
}): string | null {
	if (!assetId.startsWith(SOUND_EFFECTS_LAB_PREFIX)) return null;
	const id = assetId.slice(SOUND_EFFECTS_LAB_PREFIX.length).trim();
	return id.length > 0 ? id : null;
}

export async function resolveComposeSoundLabReference({
	reference,
	source = defaultSoundEffectsLabManifestSource(),
	signal,
	dependencies,
}: {
	reference: ComposeAssetReference;
	source?: SoundEffectsLabManifestSource;
	signal?: AbortSignal;
	dependencies?: Partial<ComposeLabResourceDependencies>;
}): Promise<ComposeSoundLabResolution | null> {
	if (reference.assetType !== "sound-effect" || reference.provider !== "qcut") {
		return null;
	}
	const assetId = parseSoundEffectsLabAssetId({ assetId: reference.assetId });
	if (!assetId) return null;
	const resolvedDependencies = dependenciesWithDefaults({ dependencies });
	const asset = await resolvedDependencies.resolveSound({
		assetId,
		source,
		signal,
	});
	if (!asset) {
		return {
			status: "missing",
			detail: `Sound Effects Lab asset ${assetId} is not in the authenticated catalog.`,
		};
	}
	if (!asset.reusable) {
		return {
			status: "reference-only",
			detail: `Sound Effects Lab asset ${assetId} is reference-only and cannot be copied into QCut.`,
			asset,
		};
	}
	if (asset.localPath) return { status: "ready", asset };
	if (asset.objectKey && asset.fileName) {
		return { status: "downloadable", asset };
	}
	return {
		status: "missing",
		detail: `Sound Effects Lab asset ${assetId} has no readable source.`,
		asset,
	};
}

function safeFileComponent({ value }: { value: string }): string {
	return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function soundExtension({
	asset,
}: {
	asset: ResolvedSoundEffectsLabAsset;
}): string {
	const fileExtension = asset.fileName ? extname(asset.fileName) : "";
	if (fileExtension) return fileExtension.toLocaleLowerCase();
	const mimeExtensions: Record<string, string> = {
		"audio/aac": ".aac",
		"audio/flac": ".flac",
		"audio/m4a": ".m4a",
		"audio/mp4": ".m4a",
		"audio/mpeg": ".mp3",
		"audio/ogg": ".ogg",
		"audio/wav": ".wav",
		"audio/x-wav": ".wav",
	};
	return asset.mimeType
		? (mimeExtensions[asset.mimeType] ?? ".audio")
		: ".audio";
}

export async function materializeComposeSoundLabReference({
	reference,
	scratchDirectory,
	source = defaultSoundEffectsLabManifestSource(),
	signal,
	dependencies,
}: {
	reference: ComposeAssetReference;
	scratchDirectory: string;
	source?: SoundEffectsLabManifestSource;
	signal?: AbortSignal;
	dependencies?: Partial<ComposeLabResourceDependencies>;
}): Promise<MaterializedComposeSound | null> {
	const resolution = await resolveComposeSoundLabReference({
		reference,
		source,
		signal,
		dependencies,
	});
	if (!resolution) return null;
	if (
		resolution.status === "missing" ||
		resolution.status === "reference-only"
	) {
		throw new Error(resolution.detail);
	}
	const resolvedDependencies = dependenciesWithDefaults({ dependencies });
	const destinationPath = join(
		scratchDirectory,
		`${safeFileComponent({ value: reference.assetId })}${soundExtension({ asset: resolution.asset })}`
	);
	const localPath = await resolvedDependencies.materializeSound({
		asset: resolution.asset,
		destinationPath,
		source,
		signal,
	});
	const [bytes, file] = await Promise.all([
		readFile(localPath),
		stat(localPath),
	]);
	return {
		localPath,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		bytes: file.size,
		asset: resolution.asset,
	};
}

function findJianyingDefinition({
	assetId,
}: {
	assetId: string;
}): JianyingTransitionDefinition | undefined {
	return JIANYING_TRANSITIONS.find((transition) => transition.id === assetId);
}

function verifiedJianyingPackage({
	definition,
	inspection,
}: {
	definition: JianyingTransitionDefinition;
	inspection: JianyingRuntimeInspection;
}): boolean {
	const status = inspection.status.transitions.find(
		(transition) => transition.id === definition.id
	);
	const packagePath = inspection.packagePaths.get(definition.id);
	return Boolean(
		status?.available &&
			packagePath &&
			basename(packagePath).toLocaleLowerCase() ===
				definition.metadataMd5.toLocaleLowerCase()
	);
}

export async function resolveComposeTransitionReference({
	assetId,
	dependencies,
}: {
	assetId: string;
	dependencies?: Partial<ComposeLabResourceDependencies>;
}): Promise<ComposeTransitionResolution> {
	if (EDITOR_TRANSITION_PRESETS.has(assetId)) {
		return { status: "ready", backend: "editor-preset", presetId: assetId };
	}
	const recipe = TRANSITION_LAB_RECIPES.find((entry) => entry.id === assetId);
	if (recipe) {
		return {
			status: "ready",
			backend: "transition-lab",
			presetId: recipe.id,
			recipe,
		};
	}
	const definition = findJianyingDefinition({ assetId });
	if (!definition) {
		return {
			status: "unsupported",
			backend: "editor-preset",
			detail: `Unknown transition preset: ${assetId}`,
		};
	}
	if (definition.runtimeKind !== "transition-segment") {
		return {
			status: "unsupported",
			backend: "jianying-local",
			detail: `${definition.localizedName} requires AI generation and is not a local two-input transition.`,
		};
	}
	const resolvedDependencies = dependenciesWithDefaults({ dependencies });
	const inspection = await resolvedDependencies.inspectJianyingTransitions();
	if (!verifiedJianyingPackage({ definition, inspection })) {
		return {
			status: "unsupported",
			backend: "jianying-local",
			detail: `Jianying transition ${definition.localizedName} is not available in the verified local runtime.`,
		};
	}
	return {
		status: "ready",
		backend: "jianying-local",
		presetId: definition.id,
		packageHash: definition.metadataMd5,
		definition,
	};
}
