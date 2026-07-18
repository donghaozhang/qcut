import type { CanvasSize } from "@/types/editor";

/** dataTransfer MIME type used when dragging a project card/row. */
export const PROJECT_DRAG_MIME = "application/x-qcut-project";

/** Format seconds as mm:ss (or h:mm:ss for long projects), e.g. 203 -> "03:23". */
export function formatProjectDuration(seconds: number): string {
	const total = Math.round(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = total % 60;
	const mm = String(minutes).padStart(2, "0");
	const ss = String(secs).padStart(2, "0");
	return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export type ProjectTypeKey =
	| "projects.typeLandscape"
	| "projects.typePortrait"
	| "projects.typeSquare"
	| "projects.typeCustom";

const COMMON_RATIOS: Array<{ ratio: number; key: ProjectTypeKey }> = [
	{ ratio: 16 / 9, key: "projects.typeLandscape" },
	{ ratio: 4 / 3, key: "projects.typeLandscape" },
	{ ratio: 21 / 9, key: "projects.typeLandscape" },
	{ ratio: 9 / 16, key: "projects.typePortrait" },
	{ ratio: 3 / 4, key: "projects.typePortrait" },
	{ ratio: 1, key: "projects.typeSquare" },
];

/** Translation key describing the project's canvas orientation. */
export function getProjectTypeKey(canvasSize: CanvasSize): ProjectTypeKey {
	if (canvasSize.width <= 0 || canvasSize.height <= 0) {
		return "projects.typeCustom";
	}
	const ratio = canvasSize.width / canvasSize.height;
	const match = COMMON_RATIOS.find((c) => Math.abs(ratio - c.ratio) < 0.02);
	if (match) return match.key;
	// Uncommon ratios still read naturally as landscape/portrait
	if (ratio > 1.1) return "projects.typeLandscape";
	if (ratio < 0.9) return "projects.typePortrait";
	return "projects.typeCustom";
}
