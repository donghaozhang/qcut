export const EDITOR_SNAPSHOT_VERSION = 1;
export const DEFAULT_EDITOR_SNAPSHOT_DEPTH = 8;
export const MAX_EDITOR_SNAPSHOT_DEPTH = 32;
export const EDITOR_SNAPSHOT_REF_ATTRIBUTE = "data-qcut-snapshot-ref";
export const EDITOR_SNAPSHOT_STATE_KEY = "__qcutSnapshotState";
export const EDITOR_SNAPSHOT_IGNORE_ATTRIBUTE = "data-qcut-snapshot-ignore";

/**
 * Default soft cap on the serialised snapshot payload (256 KB). Beyond
 * this the renderer returns a `truncated: true` envelope instead of the
 * partial tree, because Electron's `executeJavaScript` IPC silently
 * mangles very large objects (~80 KB ceiling observed in practice).
 *
 * Callers can lift the cap with `request.maxBytes` but the IPC ceiling
 * still applies — past a few hundred KB the response will arrive corrupt.
 */
export const DEFAULT_SNAPSHOT_MAX_BYTES = 256 * 1024;

/**
 * Default cap on the number of elements walked into the snapshot. Stops
 * very wide DOM trees (think dropdown listboxes with 1000+ items) from
 * filling the byte budget before reaching the actually-interesting nodes.
 */
export const DEFAULT_SNAPSHOT_MAX_NODES = 500;

export interface EditorSnapshotRequest {
	interactive?: boolean;
	depth?: number;
	/** Soft cap on serialized payload size; default DEFAULT_SNAPSHOT_MAX_BYTES. */
	maxBytes?: number;
	/** Hard cap on element count; default DEFAULT_SNAPSHOT_MAX_NODES. */
	maxNodes?: number;
}

/**
 * Returned by the renderer when a snapshot exceeds the configured cap.
 * Lets the client distinguish "the tree was too big" from "the response
 * is corrupt" — exactly what was missing before.
 */
export interface EditorSnapshotTruncatedResult {
	truncated: true;
	reason: string;
	suggestion: string;
	meta: {
		totalNodes: number;
		serializedBytes: number;
		maxBytes: number;
		maxNodes: number;
	};
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
	/** Always present; `false` for ordinary results. Set together with the truncated envelope. */
	truncated?: false;
}

/** Snapshot payload returned to the caller — full tree OR truncated envelope. */
export type EditorSnapshotResponse =
	| EditorSnapshotResult
	| EditorSnapshotTruncatedResult;

export interface EditorSnapshotClickRequest {
	ref: string;
}

export interface EditorSnapshotFillRequest {
	ref: string;
	value: string;
}

export interface EditorSnapshotSelectRequest {
	ref: string;
	value: string;
}

export interface EditorSnapshotCheckRequest {
	ref: string;
	checked: boolean;
}

export interface EditorSnapshotActionResult {
	action: "click" | "fill" | "select" | "check";
	ref: string;
	tagName: string;
	role: string | null;
	name: string | null;
	value: string | null;
}
