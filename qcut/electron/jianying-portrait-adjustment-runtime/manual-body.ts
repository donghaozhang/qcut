import type {
	MediaPortraitManualBody,
	MediaPortraitManualBodyTool,
} from "../jianying-portrait-adjustment-contract.js";

export const DEFAULT_JIANYING_MANUAL_BODY = {
	stretch: {
		intensity: 0,
		upper: 0.448,
		bottom: 0.202,
	},
	slim: {
		intensity: 0,
		x: 0.504,
		y: 0.422,
		width: 0.284,
		height: 0.308,
		rotation: 0,
	},
	zoom: {
		intensity: 0,
		x: 0.495,
		y: 0.64,
		radius: 0.12,
	},
} as const satisfies Required<MediaPortraitManualBody>;

export const JIANYING_MANUAL_BODY_RUNTIME_PACKAGE = {
	stretch: "manual-stretch",
	slim: "manual-slim",
	zoom: "manual-zoom",
} as const;

export function activeJianyingManualBodyTools({
	manualBody,
}: {
	manualBody?: MediaPortraitManualBody;
}): MediaPortraitManualBodyTool[] {
	return (
		Object.keys(
			JIANYING_MANUAL_BODY_RUNTIME_PACKAGE
		) as MediaPortraitManualBodyTool[]
	).filter((tool) => (manualBody?.[tool]?.intensity ?? 0) !== 0);
}

export function buildJianyingManualBodyFeatureParameters({
	manualBody,
	tool,
}: {
	manualBody: MediaPortraitManualBody;
	tool: MediaPortraitManualBodyTool;
}) {
	if (tool === "stretch") {
		const value = manualBody.stretch ?? DEFAULT_JIANYING_MANUAL_BODY.stretch;
		return JSON.stringify({
			effects_adjust_intensity: value.intensity / 100,
			upper: value.upper,
			bottom: value.bottom,
		});
	}
	if (tool === "slim") {
		const value = manualBody.slim ?? DEFAULT_JIANYING_MANUAL_BODY.slim;
		return JSON.stringify({
			effects_adjust_intensity: value.intensity / 100,
			x: value.x,
			y: value.y,
			width: value.width,
			height: value.height,
			rotation: value.rotation,
		});
	}
	const value = manualBody.zoom ?? DEFAULT_JIANYING_MANUAL_BODY.zoom;
	return JSON.stringify({
		effects_adjust_intensity: value.intensity / 100,
		x: value.x,
		y: value.y,
		r: value.radius,
	});
}
