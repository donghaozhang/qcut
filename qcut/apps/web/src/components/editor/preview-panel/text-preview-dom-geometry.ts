export interface TextPreviewDomGeometry {
	frame: {
		width: number;
		height: number;
		transform: string;
	};
	content: {
		width: number;
		height: number;
		flexShrink: 0;
		transform: string;
		transformOrigin: "top left";
	};
}

function positiveFiniteOrOne({ value }: { value: number }): number {
	return Number.isFinite(value) && value > 0 ? value : 1;
}

export function resolveTextPreviewDomGeometry({
	boxWidth,
	boxHeight,
	previewScale,
	rotation,
}: {
	boxWidth: number;
	boxHeight: number;
	previewScale: number;
	rotation: number;
}): TextPreviewDomGeometry {
	const scale = positiveFiniteOrOne({ value: previewScale });
	return {
		frame: {
			width: boxWidth * scale,
			height: boxHeight * scale,
			transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
		},
		content: {
			width: boxWidth,
			height: boxHeight,
			flexShrink: 0,
			transform: `scale(${scale})`,
			transformOrigin: "top left",
		},
	};
}
