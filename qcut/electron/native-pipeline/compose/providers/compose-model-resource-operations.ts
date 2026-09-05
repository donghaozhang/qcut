import type {
	ComposeAssetReference,
	ComposeAssetType,
	ComposePatchOperation,
} from "../compose-protocol.js";

export function sanitizeResourceOperation({
	operation,
	base,
	resolveAsset,
	targetExists,
}: {
	operation: Record<string, unknown>;
	base: { id: string; startTime: number; duration: number; reason?: string };
	resolveAsset: (input: {
		candidate: unknown;
		expectedType: ComposeAssetType;
	}) => ComposeAssetReference | undefined;
	targetExists: (input: { trackId: string; elementId: string }) => boolean;
}): ComposePatchOperation | undefined {
	if (
		operation.kind === "add-caption" ||
		operation.kind === "add-text-overlay"
	) {
		if (typeof operation.text !== "string" || !operation.text.trim()) return;
		const references: {
			font?: ComposeAssetReference;
			fancyWord?: ComposeAssetReference;
			textAnimation?: ComposeAssetReference;
			asset?: ComposeAssetReference;
		} = {};
		for (const [key, expectedType] of [
			["font", "font"],
			["fancyWord", "fancy-word"],
			["textAnimation", "text-animation"],
			["asset", "text-template"],
		] as const) {
			if (operation[key] === undefined) continue;
			const asset = resolveAsset({ candidate: operation[key], expectedType });
			if (!asset) return;
			references[key] = asset;
		}
		const stylePresetId =
			typeof operation.stylePresetId === "string" &&
			operation.stylePresetId.trim()
				? operation.stylePresetId.trim()
				: undefined;
		const textTemplateId =
			typeof operation.textTemplateId === "string" &&
			operation.textTemplateId.trim()
				? operation.textTemplateId.trim()
				: undefined;
		const fields = {
			...base,
			...references,
			text: operation.text.trim(),
			...(stylePresetId ? { stylePresetId } : {}),
		};
		if (operation.kind === "add-caption") {
			if (typeof operation.language !== "string" || !operation.language.trim())
				return;
			return {
				...fields,
				kind: "add-caption",
				language: operation.language.trim(),
				...(textTemplateId ? { textTemplateId } : {}),
			};
		}
		if (!textTemplateId) return;
		return { ...fields, kind: "add-text-overlay", textTemplateId };
	}
	if (
		operation.kind === "set-media-filter-stack" ||
		operation.kind === "add-filter-layer"
	) {
		if (!Array.isArray(operation.filters) || operation.filters.length > 16)
			return;
		const filters = [];
		for (const [index, candidate] of (
			operation.filters as unknown[]
		).entries()) {
			if (
				!candidate ||
				typeof candidate !== "object" ||
				Array.isArray(candidate)
			)
				return;
			const value = candidate as Record<string, unknown>;
			const asset = resolveAsset({
				candidate: value.asset,
				expectedType: "filter",
			});
			if (
				!asset ||
				typeof value.intensity !== "number" ||
				!Number.isFinite(value.intensity) ||
				value.intensity < 0 ||
				value.intensity > 100
			)
				return;
			if (value.enabled !== undefined && typeof value.enabled !== "boolean")
				return;
			filters.push({
				id: `${base.id}:filter:${index}`,
				asset,
				intensity: value.intensity,
				enabled: value.enabled ?? true,
			});
		}
		if (operation.kind === "add-filter-layer")
			return filters.length
				? {
						...base,
						kind: "add-filter-layer",
						trackRole: "adjustment",
						filters,
					}
				: undefined;
		const { trackId, elementId } = operation;
		if (
			typeof trackId !== "string" ||
			typeof elementId !== "string" ||
			!targetExists({ trackId, elementId })
		)
			return;
		return {
			...base,
			kind: "set-media-filter-stack",
			trackId,
			elementId,
			filters,
		};
	}
	if (operation.kind === "insert-media-clip") {
		const asset = resolveAsset({
			candidate: operation.asset,
			expectedType: "generated-media",
		});
		if (
			!asset ||
			(operation.mediaKind !== "video" && operation.mediaKind !== "image")
		)
			return;
		const mediaKind = operation.mediaKind;
		if (!asset.tags?.includes(mediaKind)) return;
		if (
			mediaKind !== "image" &&
			(!asset.duration || base.duration > asset.duration)
		)
			return;
		return {
			...base,
			kind: "insert-media-clip",
			asset,
			mediaKind,
			trackRole: "overlay-video",
			trimStart: 0,
			trimEnd: Math.max(0, (asset.duration ?? base.duration) - base.duration),
			sourceDuration: asset.duration ?? base.duration,
		};
	}
}
