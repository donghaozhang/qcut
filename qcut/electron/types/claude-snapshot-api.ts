export const EDITOR_SNAPSHOT_VERSION = 1;
export const MAX_EDITOR_SNAPSHOT_DEPTH = 8;
export const EDITOR_SNAPSHOT_REF_ATTRIBUTE = "data-qcut-snapshot-ref";
export const EDITOR_SNAPSHOT_STATE_KEY = "__qcutSnapshotState";

export interface EditorSnapshotRequest {
	interactive?: boolean;
	depth?: number;
}

export interface EditorSnapshotBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface EditorSnapshotElement {
	ref: string;
	parentRef: string | null;
	depth: number;
	actionable: boolean;
	role: string | null;
	tagName: string;
	name: string | null;
	textPreview: string | null;
	testId: string | null;
	placeholder: string | null;
	value: string | null;
	disabled: boolean;
	checked: boolean | "mixed" | null;
	selected: boolean | null;
	expanded: boolean | null;
	bounds: EditorSnapshotBounds;
}

export interface EditorSnapshotResult {
	version: number;
	timestamp: number;
	interactiveOnly: boolean;
	maxDepth: number;
	elements: EditorSnapshotElement[];
	summary: {
		total: number;
		actionable: number;
	};
}

export interface EditorSnapshotClickRequest {
	ref: string;
}

export interface EditorSnapshotFillRequest {
	ref: string;
	value: string;
}

export interface EditorSnapshotActionResult {
	action: "click" | "fill";
	ref: string;
	tagName: string;
	role: string | null;
	name: string | null;
	value: string | null;
}
