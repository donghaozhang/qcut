export type VisualLayerBlendMode =
	| "normal"
	| "multiply"
	| "screen"
	| "overlay"
	| "darken"
	| "lighten";

export type VisualLayerKind = "video" | "image" | "sticker" | "text";

export interface PreparedVisualLayer {
	inputLabel: string;
	kind: VisualLayerKind;
	trackOrder?: number;
	elementOrder?: number;
	sourceOrder: number;
	legacyOrder: number;
	blendMode: VisualLayerBlendMode;
	startTime?: number;
	endTime?: number;
	x?: number | string;
	y?: number | string;
}

export interface ComposedVisualLayers {
	filterSteps: string[];
	outputLabel: string;
}

function hasTrackOrder(layer: PreparedVisualLayer): boolean {
	return Number.isFinite(layer.trackOrder);
}

export function sortPreparedVisualLayers({
	layers,
}: {
	layers: PreparedVisualLayer[];
}): PreparedVisualLayer[] {
	const usesTrackOrder = layers.some(hasTrackOrder);
	return [...layers].sort((left, right) => {
		if (usesTrackOrder) {
			const trackDifference =
				(right.trackOrder ?? Number.MAX_SAFE_INTEGER) -
				(left.trackOrder ?? Number.MAX_SAFE_INTEGER);
			if (trackDifference !== 0) return trackDifference;
			const elementDifference =
				(left.elementOrder ?? 0) - (right.elementOrder ?? 0);
			if (elementDifference !== 0) return elementDifference;
		}

		const legacyDifference = left.legacyOrder - right.legacyOrder;
		return legacyDifference !== 0
			? legacyDifference
			: left.sourceOrder - right.sourceOrder;
	});
}

function layerEnable(layer: PreparedVisualLayer): string {
	if (!Number.isFinite(layer.startTime) || !Number.isFinite(layer.endTime)) {
		return "";
	}
	return `:enable='between(t,${layer.startTime},${layer.endTime})'`;
}

export function composePreparedVisualLayers({
	baseLabel,
	layers,
	labelPrefix = "visual",
	canvasWidth,
	canvasHeight,
}: {
	baseLabel: string;
	layers: PreparedVisualLayer[];
	labelPrefix?: string;
	canvasWidth?: number;
	canvasHeight?: number;
}): ComposedVisualLayers {
	const filterSteps: string[] = [];
	let outputLabel = baseLabel;
	const orderedLayers = sortPreparedVisualLayers({ layers });

	for (let drawOrder = 0; drawOrder < orderedLayers.length; drawOrder++) {
		const layer = orderedLayers[drawOrder];
		const prefix = `${labelPrefix}_${layer.kind}_${drawOrder}`;
		const nextOutput = `${prefix}_composite`;
		const enable = layerEnable(layer);
		const position = `x=${layer.x ?? 0}:y=${layer.y ?? 0}:`;

		if (layer.blendMode === "normal") {
			filterSteps.push(
				`[${outputLabel}][${layer.inputLabel}]overlay=` +
					`${position}eof_action=pass:repeatlast=0:shortest=0:format=auto${enable}[${nextOutput}]`
			);
			outputLabel = nextOutput;
			continue;
		}

		const baseOriginal = `${prefix}_base_original`;
		const baseBlendInput = `${prefix}_base_blend_input`;
		const baseBlend = `${prefix}_base_blend`;
		const foregroundInput = `${prefix}_foreground_input`;
		const foregroundBlend = `${prefix}_foreground_blend`;
		const foregroundAlpha = `${prefix}_foreground_alpha`;
		const blended = `${prefix}_blended`;
		const alphaMask = `${prefix}_alpha_mask`;
		const blendedAlpha = `${prefix}_blended_alpha`;
		const hasProjectPosition = layer.x !== undefined || layer.y !== undefined;
		if (
			hasProjectPosition &&
			(!(canvasWidth && canvasWidth > 0) || !(canvasHeight && canvasHeight > 0))
		) {
			throw new Error(
				`Canvas dimensions are required for positioned ${layer.blendMode} layers`
			);
		}
		filterSteps.push(
			`[${outputLabel}]split=2[${baseOriginal}][${baseBlendInput}]`
		);
		filterSteps.push(`[${baseBlendInput}]format=rgba[${baseBlend}]`);
		const foregroundPlacement = hasProjectPosition
			? `,pad=${canvasWidth}:${canvasHeight}:${layer.x ?? 0}:${layer.y ?? 0}:color=black@0.0`
			: "";
		filterSteps.push(
			`[${layer.inputLabel}]format=rgba${foregroundPlacement}[${foregroundInput}]`
		);
		filterSteps.push(
			`[${foregroundInput}]split=2[${foregroundBlend}][${foregroundAlpha}]`
		);
		filterSteps.push(
			`[${baseBlend}][${foregroundBlend}]blend=all_mode=${layer.blendMode}:shortest=1[${blended}]`
		);
		filterSteps.push(`[${foregroundAlpha}]alphaextract[${alphaMask}]`);
		filterSteps.push(`[${blended}][${alphaMask}]alphamerge[${blendedAlpha}]`);
		const compositePosition = hasProjectPosition ? "x=0:y=0:" : position;
		filterSteps.push(
			`[${baseOriginal}][${blendedAlpha}]overlay=` +
				`${compositePosition}eof_action=pass:repeatlast=0:shortest=0:format=auto${enable}[${nextOutput}]`
		);
		outputLabel = nextOutput;
	}

	return { filterSteps, outputLabel };
}
