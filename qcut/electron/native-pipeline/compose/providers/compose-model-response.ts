import type {
	ComposeAssetReference,
	ComposeAssetType,
	ComposePatchOperation,
	ComposeSnapshot,
} from "../compose-protocol.js";

const KNOWN_OPERATION_KINDS = new Set([
	"add-caption",
	"add-text-overlay",
	"add-sticker",
	"add-sound-effect",
	"update-media-zoom",
	"upsert-transition",
]);
const BUILTIN_TRANSITION_PRESETS = new Set(["crossfade", "dissolve"]);
const STICKER_ANIMATION_IN_TYPES = new Set([
	"none",
	"fade",
	"slide",
	"scale",
	"bounce",
] as const);
const STICKER_ANIMATION_OUT_TYPES = new Set([
	"none",
	"fade",
	"slide",
	"scale",
] as const);
const STICKER_ANIMATION_LOOP_TYPES = new Set([
	"none",
	"pulse",
	"float",
	"spin",
	"bounce",
] as const);

type StickerAnimationIn = "none" | "fade" | "slide" | "scale" | "bounce";
type StickerAnimationOut = "none" | "fade" | "slide" | "scale";
type StickerAnimationLoop = "none" | "pulse" | "float" | "spin" | "bounce";

interface SanitizeContext {
	projectDuration: number;
	resources: ComposeAssetReference[];
	targets: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField({
	record,
	key,
}: {
	record: Record<string, unknown>;
	key: string;
}): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteField({
	record,
	key,
}: {
	record: Record<string, unknown>;
	key: string;
}): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function boundedField({
	record,
	key,
	min,
	max,
}: {
	record: Record<string, unknown>;
	key: string;
	min: number;
	max: number;
}): number | undefined {
	const value = finiteField({ record, key });
	return value !== undefined && value >= min && value <= max
		? value
		: undefined;
}

function enumField<T extends string>({
	record,
	key,
	allowed,
}: {
	record: Record<string, unknown>;
	key: string;
	allowed: ReadonlySet<T>;
}): T | undefined {
	const value = stringField({ record, key });
	return value && allowed.has(value as T) ? (value as T) : undefined;
}

function portableAssetReference({
	resource,
}: {
	resource: ComposeAssetReference;
}): ComposeAssetReference {
	return {
		provider: resource.provider,
		assetType: resource.assetType,
		assetId: resource.assetId,
		...(resource.displayName ? { displayName: resource.displayName } : {}),
		...(resource.duration !== undefined ? { duration: resource.duration } : {}),
		...(resource.license ? { license: resource.license } : {}),
	};
}

function isUsableResource({
	resource,
}: {
	resource: ComposeAssetReference;
}): boolean {
	return (
		resource.availability !== "unavailable" &&
		resource.availability !== "reference-only" &&
		resource.capabilities?.editorApply !== false
	);
}

function resolveAllowedAsset({
	candidate,
	expectedType,
	resources,
}: {
	candidate: unknown;
	expectedType: ComposeAssetType;
	resources: ComposeAssetReference[];
}): ComposeAssetReference | undefined {
	const candidateRecord = isRecord(candidate) ? candidate : undefined;
	const assetId =
		typeof candidate === "string"
			? candidate.trim()
			: candidateRecord
				? stringField({ record: candidateRecord, key: "assetId" })
				: undefined;
	if (!assetId) return;
	const provider = candidateRecord
		? stringField({ record: candidateRecord, key: "provider" })
		: undefined;
	const assetType = candidateRecord
		? stringField({ record: candidateRecord, key: "assetType" })
		: undefined;
	if (assetType && assetType !== expectedType) return;

	const matches = resources.filter(
		(resource) =>
			resource.assetType === expectedType &&
			resource.assetId === assetId &&
			(!provider || resource.provider === provider) &&
			isUsableResource({ resource })
	);
	return matches.length === 1
		? portableAssetReference({ resource: matches[0] })
		: undefined;
}

function targetExists({
	trackId,
	elementId,
	context,
}: {
	trackId: string;
	elementId: string;
	context: SanitizeContext;
}): boolean {
	return context.targets.has(`${trackId}:${elementId}`);
}

function sanitizeBase({
	operation,
	index,
	context,
}: {
	operation: Record<string, unknown>;
	index: number;
	context: SanitizeContext;
}):
	| {
			id: string;
			kind: string;
			startTime: number;
			duration: number;
			reason?: string;
	  }
	| undefined {
	const kind = stringField({ record: operation, key: "kind" });
	const startTime = finiteField({ record: operation, key: "startTime" });
	const duration = finiteField({ record: operation, key: "duration" });
	if (
		!kind ||
		!KNOWN_OPERATION_KINDS.has(kind) ||
		startTime === undefined ||
		startTime < 0 ||
		duration === undefined ||
		duration <= 0 ||
		startTime + duration > context.projectDuration + 0.001
	) {
		return;
	}
	const reason = stringField({ record: operation, key: "reason" });
	return {
		id: `openrouter:${kind}:${index}`,
		kind,
		startTime,
		duration,
		...(reason ? { reason } : {}),
	};
}

function sanitizeSticker({
	operation,
	base,
	context,
}: {
	operation: Record<string, unknown>;
	base: NonNullable<ReturnType<typeof sanitizeBase>>;
	context: SanitizeContext;
}): ComposePatchOperation | undefined {
	const asset = resolveAllowedAsset({
		candidate: operation.asset ?? operation.assetId,
		expectedType: "sticker",
		resources: context.resources,
	});
	if (!asset) return;
	const x = boundedField({ record: operation, key: "x", min: 0, max: 1 });
	const y = boundedField({ record: operation, key: "y", min: 0, max: 1 });
	const width = boundedField({
		record: operation,
		key: "width",
		min: 0,
		max: 1,
	});
	const height = boundedField({
		record: operation,
		key: "height",
		min: 0,
		max: 1,
	});
	const rotation = finiteField({ record: operation, key: "rotation" });
	const opacity = boundedField({
		record: operation,
		key: "opacity",
		min: 0,
		max: 1,
	});
	const animationInType = enumField<StickerAnimationIn>({
		record: operation,
		key: "animationInType",
		allowed: STICKER_ANIMATION_IN_TYPES,
	});
	const animationOutType = enumField<StickerAnimationOut>({
		record: operation,
		key: "animationOutType",
		allowed: STICKER_ANIMATION_OUT_TYPES,
	});
	const animationLoopType = enumField<StickerAnimationLoop>({
		record: operation,
		key: "animationLoopType",
		allowed: STICKER_ANIMATION_LOOP_TYPES,
	});
	const animationInDuration = boundedField({
		record: operation,
		key: "animationInDuration",
		min: 0,
		max: base.duration,
	});
	const animationOutDuration = boundedField({
		record: operation,
		key: "animationOutDuration",
		min: 0,
		max: base.duration,
	});
	const animationLoopIntensity = boundedField({
		record: operation,
		key: "animationLoopIntensity",
		min: 0,
		max: 2,
	});
	return {
		...base,
		kind: "add-sticker",
		asset,
		...(x !== undefined ? { x } : {}),
		...(y !== undefined ? { y } : {}),
		...(width !== undefined ? { width } : {}),
		...(height !== undefined ? { height } : {}),
		...(rotation !== undefined ? { rotation } : {}),
		...(opacity !== undefined ? { opacity } : {}),
		...(typeof operation.maintainAspectRatio === "boolean"
			? { maintainAspectRatio: operation.maintainAspectRatio }
			: {}),
		...(animationInType ? { animationInType } : {}),
		...(animationInDuration !== undefined ? { animationInDuration } : {}),
		...(animationOutType ? { animationOutType } : {}),
		...(animationOutDuration !== undefined ? { animationOutDuration } : {}),
		...(animationLoopType ? { animationLoopType } : {}),
		...(animationLoopIntensity !== undefined ? { animationLoopIntensity } : {}),
	};
}

function sanitizeSound({
	operation,
	base,
	context,
}: {
	operation: Record<string, unknown>;
	base: NonNullable<ReturnType<typeof sanitizeBase>>;
	context: SanitizeContext;
}): ComposePatchOperation | undefined {
	const asset = resolveAllowedAsset({
		candidate: operation.asset ?? operation.assetId,
		expectedType: "sound-effect",
		resources: context.resources,
	});
	const volume = boundedField({
		record: operation,
		key: "volume",
		min: 0,
		max: 1,
	});
	if (!(asset && volume !== undefined)) return;
	const trimStart = boundedField({
		record: operation,
		key: "trimStart",
		min: 0,
		max: Number.MAX_SAFE_INTEGER,
	});
	const trimEnd = boundedField({
		record: operation,
		key: "trimEnd",
		min: 0,
		max: Number.MAX_SAFE_INTEGER,
	});
	const fadeIn = boundedField({
		record: operation,
		key: "fadeIn",
		min: 0,
		max: base.duration,
	});
	const fadeOut = boundedField({
		record: operation,
		key: "fadeOut",
		min: 0,
		max: base.duration,
	});
	const playbackRate = boundedField({
		record: operation,
		key: "playbackRate",
		min: 0.25,
		max: 4,
	});
	// Timeline duration consumes source seconds at playbackRate speed: a 2×
	// clip needs twice the source footage its timeline span suggests.
	if (
		asset.duration !== undefined &&
		(trimStart ?? 0) + (trimEnd ?? 0) + base.duration * (playbackRate ?? 1) >
			asset.duration + 0.001
	) {
		return;
	}
	return {
		...base,
		kind: "add-sound-effect",
		asset,
		volume,
		...(trimStart !== undefined ? { trimStart } : {}),
		...(trimEnd !== undefined ? { trimEnd } : {}),
		...(fadeIn !== undefined ? { fadeIn } : {}),
		...(fadeOut !== undefined ? { fadeOut } : {}),
		...(playbackRate !== undefined ? { playbackRate } : {}),
	};
}

function sanitizeOperation({
	operation,
	index,
	context,
}: {
	operation: Record<string, unknown>;
	index: number;
	context: SanitizeContext;
}): ComposePatchOperation | undefined {
	const base = sanitizeBase({ operation, index, context });
	if (!base) return;

	switch (base.kind) {
		case "add-caption": {
			const text = stringField({ record: operation, key: "text" });
			const language = stringField({ record: operation, key: "language" });
			return text && language
				? { ...base, kind: "add-caption", text, language }
				: undefined;
		}
		case "add-text-overlay": {
			const text = stringField({ record: operation, key: "text" });
			const textTemplateId = stringField({
				record: operation,
				key: "textTemplateId",
			});
			return text && textTemplateId
				? { ...base, kind: "add-text-overlay", text, textTemplateId }
				: undefined;
		}
		case "add-sticker":
			return sanitizeSticker({ operation, base, context });
		case "add-sound-effect":
			return sanitizeSound({ operation, base, context });
		case "update-media-zoom": {
			const trackId = stringField({ record: operation, key: "trackId" });
			const elementId = stringField({ record: operation, key: "elementId" });
			const fromScale = finiteField({ record: operation, key: "fromScale" });
			const toScale = finiteField({ record: operation, key: "toScale" });
			return trackId &&
				elementId &&
				fromScale !== undefined &&
				toScale !== undefined &&
				targetExists({ trackId, elementId, context })
				? {
						...base,
						kind: "update-media-zoom",
						trackId,
						elementId,
						fromScale,
						toScale,
					}
				: undefined;
		}
		case "upsert-transition": {
			const trackId = stringField({ record: operation, key: "trackId" });
			const fromElementId = stringField({
				record: operation,
				key: "fromElementId",
			});
			const toElementId = stringField({
				record: operation,
				key: "toElementId",
			});
			const presetId = stringField({ record: operation, key: "presetId" });
			if (
				!(trackId && fromElementId && toElementId && presetId) ||
				!targetExists({ trackId, elementId: fromElementId, context }) ||
				!targetExists({ trackId, elementId: toElementId, context })
			) {
				return;
			}
			const asset = BUILTIN_TRANSITION_PRESETS.has(presetId)
				? undefined
				: resolveAllowedAsset({
						candidate: operation.asset ?? presetId,
						expectedType: "transition",
						resources: context.resources,
					});
			if (!BUILTIN_TRANSITION_PRESETS.has(presetId) && !asset) return;
			return {
				...base,
				kind: "upsert-transition",
				trackId,
				fromElementId,
				toElementId,
				presetId: asset?.assetId ?? presetId,
				...(asset ? { asset } : {}),
			};
		}
	}
}

export function sanitizeComposeModelOperations({
	value,
	snapshot,
}: {
	value: unknown;
	snapshot: ComposeSnapshot;
}): ComposePatchOperation[] {
	if (!isRecord(value) || !Array.isArray(value.operations)) {
		throw new Error("The model response has no operations array.");
	}
	const context: SanitizeContext = {
		projectDuration: snapshot.project.duration,
		resources: snapshot.availableResources,
		targets: new Set(
			snapshot.media.map(({ trackId, elementId }) => `${trackId}:${elementId}`)
		),
	};
	const operations: ComposePatchOperation[] = [];
	for (const [index, candidate] of value.operations.entries()) {
		if (!isRecord(candidate)) continue;
		const operation = sanitizeOperation({
			operation: candidate,
			index,
			context,
		});
		if (operation) operations.push(operation);
	}
	return operations;
}
