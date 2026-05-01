/**
 * Editor state snapshot types shared between Electron main and renderer.
 */

export const EDITOR_STATE_SNAPSHOT_VERSION = 1;

export const StateSection = {
	TIMELINE: "timeline",
	SELECTION: "selection",
	PLAYHEAD: "playhead",
	MEDIA: "media",
	EDITOR: "editor",
	UI: "ui",
	PROJECT: "project",
} as const;

export type StateSection = (typeof StateSection)[keyof typeof StateSection];

export interface EditorStateRequest {
	include?: StateSection[];
	/**
	 * Per-section options. Today only `media.includeThumbnails` is honoured —
	 * default is **false** because raw `data:image/jpeg;base64,…` thumbnail
	 * URLs can push the snapshot past the HTTP/IPC transport limits and
	 * break JSON parsing in clients (see
	 * docs/task/editor-cli-results-2026-04-30/IMPLEMENTATION-PLAN.md).
	 *
	 * When `false`, populated `thumbnailUrl` fields are replaced with the
	 * sentinel string `"<stripped>"` so callers can detect existence
	 * without paying the bytes; null/undefined values pass through.
	 */
	media?: {
		includeThumbnails?: boolean;
	};
}

/** Sentinel value used for stripped thumbnail URLs. */
export const STRIPPED_THUMBNAIL_SENTINEL = "<stripped>";

export interface EditorStateSnapshot {
	version: number;
	timestamp: number;
	state: {
		timeline?: TimelineStateSnapshot;
		media?: MediaStateSnapshot;
		editor?: EditorUiStateSnapshot;
		project?: ProjectStateSnapshot;
	};
}

export interface TimelineStateSnapshot {
	tracks?: TimelineSnapshotTrack[];
	selection?: TimelineSelectionSnapshotItem[];
	playhead?: PlayheadStateSnapshot;
	autoSave?: {
		status: string;
		isSaving: boolean;
		lastSavedAt: number | null;
	};
	history?: {
		undoDepth: number;
		redoDepth: number;
	};
}

export interface TimelineSelectionSnapshotItem {
	trackId: string;
	elementId: string;
}

export interface PlayheadStateSnapshot {
	currentTime: number;
	isPlaying: boolean;
	duration: number;
	speed: number;
}

export interface TimelineSnapshotTrack {
	id: string;
	name: string;
	type: string;
	muted?: boolean;
	isMain?: boolean;
	elements: TimelineSnapshotElement[];
}

export interface TimelineSnapshotElement {
	id: string;
	type: string;
	name?: string;
	startTime?: number;
	duration?: number;
	trimStart?: number;
	trimEnd?: number;
	hidden?: boolean;
	[key: string]: unknown;
}

export interface MediaStateSnapshot {
	items?: MediaStateSnapshotItem[];
	counts?: {
		total: number;
		video: number;
		audio: number;
		image: number;
		unsaved: number;
	};
	isLoading?: boolean;
	hasInitialized?: boolean;
}

export interface MediaStateSnapshotItem {
	id: string;
	name: string;
	type: "video" | "audio" | "image";
	url?: string;
	thumbnailUrl?: string;
	duration?: number;
	width?: number;
	height?: number;
	fps?: number;
	localPath?: string;
	isLocalFile?: boolean;
	thumbnailStatus?: "pending" | "loading" | "ready" | "failed";
	ephemeral?: boolean;
	unsaved?: boolean;
	folderIds?: string[];
	metadata?: Record<string, unknown>;
}

export interface EditorUiStateSnapshot {
	activePanel?: {
		group: string | null;
		tab: string | null;
		editSubgroup: string | null;
		aiTab: string | null;
	};
	activeTool?: {
		id: string | null;
		name: string | null;
		source: "white-draw" | null;
	};
	modals?: {
		exportDialogOpen: boolean;
		openCount: number;
		items: ModalSnapshotItem[];
	};
	blockers?: {
		overlayCount: number;
		items: BlockerSnapshotItem[];
	};
	isDirty?: boolean;
	dirtySources?: string[];
	canvas?: {
		width: number;
		height: number;
		mode: string;
	};
	initialization?: {
		isInitializing: boolean;
		isPanelsReady: boolean;
	};
}

export interface ModalSnapshotItem {
	role: string | null;
	ariaLabel: string | null;
	testId: string | null;
	tagName: string;
	textPreview: string | null;
}

export interface BlockerSnapshotItem {
	kind: "dialog-backdrop" | "radix-overlay" | "loading-overlay" | "unknown";
	testId: string | null;
	className: string | null;
}

export interface ProjectStateSnapshot {
	activeProject?: ProjectMetadataSnapshot | null;
	savedProjectCount?: number;
	isLoading?: boolean;
	isInitialized?: boolean;
}

export interface ProjectMetadataSnapshot {
	id: string;
	name: string;
	currentSceneId: string;
	sceneCount: number;
	sceneIds: string[];
	thumbnail: string;
	createdAt: string | null;
	updatedAt: string | null;
	backgroundColor?: string;
	backgroundType?: "color" | "blur";
	blurIntensity?: 4 | 8 | 18;
	fps?: number;
	bookmarks?: number[];
	canvasSize: {
		width: number;
		height: number;
	};
	canvasMode: "preset" | "original" | "custom";
}
