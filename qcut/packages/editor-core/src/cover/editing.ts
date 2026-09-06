import type { CoverDesignV1, CoverTextLayerV1 } from "./model.js";

export function createCoverText({
	canvas,
	content,
	id,
}: {
	canvas: CoverDesignV1["canvas"];
	content: string;
	id: string;
}): CoverTextLayerV1 {
	return {
		id,
		kind: "text",
		content,
		x: 0.5,
		y: 0.5,
		width: 0.82,
		height: 0.3,
		rotation: 0,
		fontSize: Math.max(
			8,
			Math.min(180, Math.round(Math.min(canvas.width, canvas.height) * 0.09))
		),
		fontFamily: "sans-serif",
		color: "#ffffff",
		bold: true,
		italic: false,
		underline: false,
		align: "center",
		stroke: false,
		shadow: true,
		background: false,
	};
}

export function updateCoverText({
	design,
	id,
	changes,
}: {
	design: CoverDesignV1;
	id: string;
	changes: Partial<CoverTextLayerV1>;
}): CoverDesignV1 {
	return {
		...design,
		layers: [
			design.layers[0],
			...design.layers
				.slice(1)
				.filter((layer): layer is CoverTextLayerV1 => layer.kind === "text")
				.map((layer) =>
					layer.id === id
						? { ...layer, ...changes, kind: "text" as const, id }
						: layer
				),
		],
	};
}

export interface CoverHistory {
	past: CoverDesignV1[];
	present: CoverDesignV1 | null;
	future: CoverDesignV1[];
}

export type CoverHistoryAction =
	| { type: "load"; design: CoverDesignV1 }
	| { type: "edit"; design: CoverDesignV1 }
	| { type: "undo" | "redo" };

export function reduceCoverHistory(
	state: CoverHistory,
	action: CoverHistoryAction
): CoverHistory {
	if (action.type === "load")
		return { past: [], present: action.design, future: [] };
	if (action.type === "edit") {
		if (JSON.stringify(state.present) === JSON.stringify(action.design))
			return state;
		return {
			past: state.present ? [...state.past, state.present].slice(-60) : [],
			present: action.design,
			future: [],
		};
	}
	if (action.type === "undo" && state.past.length && state.present)
		return {
			past: state.past.slice(0, -1),
			present: state.past.at(-1)!,
			future: [state.present, ...state.future],
		};
	if (action.type === "redo" && state.future.length && state.present)
		return {
			past: [...state.past, state.present],
			present: state.future[0],
			future: state.future.slice(1),
		};
	return state;
}
