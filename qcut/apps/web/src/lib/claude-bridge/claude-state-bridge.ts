import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { platform } from "@qcut/platform-core";
import { useExportStore } from "@/stores/export-store";
import { useEditorStore } from "@/stores/editor-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";

import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	BlockerSnapshotItem,
	EditorStateRequest,
	EditorStateSnapshot,
	MediaStateSnapshotItem,
	ModalSnapshotItem,
	ProjectMetadataSnapshot,
	StateSection as StateSectionType,
	TimelineSnapshotTrack,
} from "../../../../../electron/types/claude-api";
import {
	EDITOR_STATE_SNAPSHOT_VERSION,
	StateSection,
} from "../../../../../electron/types/claude-api";

const STATE_SECTION_VALUES = new Set<StateSectionType>(
	Object.values(StateSection)
);

type SectionSet = Set<StateSectionType>;

interface ClaudeStateRendererBridgeAPI {
	onSnapshotRequest: (
		callback: (data: {
			requestId: string;
			request?: EditorStateRequest;
		}) => void
	) => void;
	sendSnapshotResponse: (
		requestId: string,
		result?: EditorStateSnapshot,
		error?: string
	) => void;
	removeListeners: () => void;
}

function toJsonSafe<T>({ value, fallback }: { value: T; fallback: T }): T {
	try {
		return JSON.parse(JSON.stringify(value)) as T;
	} catch {
		return fallback;
	}
}

function normalizeInclude({
	request,
}: {
	request?: EditorStateRequest;
}): SectionSet | null {
	try {
		if (!request?.include || request.include.length === 0) {
			return null;
		}

		const include = new Set<StateSectionType>();
		for (const item of request.include) {
			if (STATE_SECTION_VALUES.has(item)) {
				include.add(item);
			}
		}
		return include.size > 0 ? include : null;
	} catch {
		return null;
	}
}

function shouldIncludeStore({
	include,
	storeSection,
	aliases = [],
}: {
	include: SectionSet | null;
	storeSection: StateSectionType;
	aliases?: StateSectionType[];
}): boolean {
	if (!include) return true;
	if (include.has(storeSection)) return true;
	for (const alias of aliases) {
		if (include.has(alias)) return true;
	}
	return false;
}

function shouldIncludeTimelineField({
	include,
	field,
}: {
	include: SectionSet | null;
	field: "tracks" | "selection" | "playhead" | "meta";
}): boolean {
	if (!include) return true;
	if (include.has(StateSection.TIMELINE)) return true;
	if (field === "selection") return include.has(StateSection.SELECTION);
	if (field === "playhead") return include.has(StateSection.PLAYHEAD);
	return false;
}

function toIsoStringOrNull({ value }: { value: unknown }): string | null {
	try {
		if (value == null) return null;
		if (value instanceof Date) return value.toISOString();
		if (typeof value === "string") return value;
		if (typeof value === "number") {
			const date = new Date(value);
			return Number.isNaN(date.getTime()) ? null : date.toISOString();
		}
		return null;
	} catch {
		return null;
	}
}

function getUnknownBoolean({
	record,
	key,
}: {
	record: Record<string, unknown>;
	key: string;
}): boolean | undefined {
	try {
		const value = record[key];
		return typeof value === "boolean" ? value : undefined;
	} catch {
		return;
	}
}

function buildMediaItemsSnapshot(): {
	items: MediaStateSnapshotItem[];
	unsavedCount: number;
} {
	try {
		const mediaStore = useMediaStore.getState();
		let unsavedCount = 0;

		const items = mediaStore.mediaItems.map((item) => {
			const itemRecord = item as unknown as Record<string, unknown>;
			const unsaved = getUnknownBoolean({ record: itemRecord, key: "unsaved" });
			if (unsaved) unsavedCount += 1;

			return {
				id: item.id,
				name: item.name,
				type: item.type,
				url: item.url,
				thumbnailUrl: item.thumbnailUrl,
				duration: item.duration,
				width: item.width,
				height: item.height,
				fps: item.fps,
				localPath: item.localPath,
				isLocalFile: item.isLocalFile,
				thumbnailStatus: item.thumbnailStatus,
				ephemeral: item.ephemeral,
				unsaved,
				folderIds: item.folderIds ? [...item.folderIds] : undefined,
				metadata: item.metadata
					? toJsonSafe({
							value: item.metadata as Record<string, unknown>,
							fallback: {},
						})
					: undefined,
			};
		});

		return { items, unsavedCount };
	} catch {
		return { items: [], unsavedCount: 0 };
	}
}

function buildProjectMetadataSnapshot(): ProjectMetadataSnapshot | null {
	try {
		const { activeProject } = useProjectStore.getState();
		if (!activeProject) return null;

		return {
			id: activeProject.id,
			name: activeProject.name,
			currentSceneId: activeProject.currentSceneId,
			sceneCount: activeProject.scenes.length,
			sceneIds: activeProject.scenes.map((scene) => scene.id),
			thumbnail: activeProject.thumbnail,
			createdAt: toIsoStringOrNull({ value: activeProject.createdAt }),
			updatedAt: toIsoStringOrNull({ value: activeProject.updatedAt }),
			backgroundColor: activeProject.backgroundColor,
			backgroundType: activeProject.backgroundType,
			blurIntensity: activeProject.blurIntensity,
			fps: activeProject.fps,
			bookmarks: activeProject.bookmarks
				? [...activeProject.bookmarks]
				: undefined,
			canvasSize: {
				width: activeProject.canvasSize.width,
				height: activeProject.canvasSize.height,
			},
			canvasMode: activeProject.canvasMode,
		};
	} catch {
		return null;
	}
}

function collectOpenDialogs(): ModalSnapshotItem[] {
	try {
		if (typeof document === "undefined") return [];

		const nodes = Array.from(
			document.querySelectorAll<HTMLElement>(
				'[role="dialog"], [aria-modal="true"], [data-testid*="dialog"]'
			)
		);

		const unique = new Set<HTMLElement>();
		for (const node of nodes) {
			unique.add(node);
		}

		return Array.from(unique)
			.filter(
				(node) => node.offsetParent !== null || node.getClientRects().length > 0
			)
			.map((node) => ({
				role: node.getAttribute("role"),
				ariaLabel: node.getAttribute("aria-label"),
				testId: node.getAttribute("data-testid"),
				tagName: node.tagName.toLowerCase(),
				textPreview: node.textContent
					? node.textContent.replace(/\s+/g, " ").trim().slice(0, 120) || null
					: null,
			}));
	} catch {
		return [];
	}
}

function collectBlockingOverlays(): BlockerSnapshotItem[] {
	try {
		if (typeof document === "undefined") return [];

		const candidates = Array.from(
			document.querySelectorAll<HTMLElement>(
				'[data-radix-dialog-overlay], [data-testid*="overlay"], [class*="backdrop"]'
			)
		);

		const unique = new Set<HTMLElement>();
		for (const node of candidates) {
			unique.add(node);
		}

		return Array.from(unique)
			.filter(
				(node) => node.offsetParent !== null || node.getClientRects().length > 0
			)
			.map((node) => {
				const testId = node.getAttribute("data-testid");
				const className = node.className || null;
				const classValue = typeof className === "string" ? className : null;

				let kind: BlockerSnapshotItem["kind"] = "unknown";
				if (node.hasAttribute("data-radix-dialog-overlay")) {
					kind = "radix-overlay";
				} else if (classValue?.toLowerCase().includes("backdrop")) {
					kind = "dialog-backdrop";
				} else if (testId?.toLowerCase().includes("loading")) {
					kind = "loading-overlay";
				}

				return {
					kind,
					testId,
					className: classValue,
				};
			});
	} catch {
		return [];
	}
}

function buildEditorStateSnapshot({
	request,
}: {
	request?: EditorStateRequest;
}): EditorStateSnapshot {
	const include = normalizeInclude({ request });
	const snapshot: EditorStateSnapshot = {
		version: EDITOR_STATE_SNAPSHOT_VERSION,
		timestamp: Date.now(),
		state: {},
	};

	const includeTimeline = shouldIncludeStore({
		include,
		storeSection: StateSection.TIMELINE,
		aliases: [StateSection.SELECTION, StateSection.PLAYHEAD],
	});
	const includeMedia = shouldIncludeStore({
		include,
		storeSection: StateSection.MEDIA,
	});
	const includeEditor = shouldIncludeStore({
		include,
		storeSection: StateSection.EDITOR,
		aliases: [StateSection.UI],
	});
	const includeProject = shouldIncludeStore({
		include,
		storeSection: StateSection.PROJECT,
	});

	let mediaUnsavedCount = 0;

	if (includeTimeline) {
		const timelineStore = useTimelineStore.getState();
		const playbackStore = usePlaybackStore.getState();

		const timelineSnapshot: EditorStateSnapshot["state"]["timeline"] = {};

		if (shouldIncludeTimelineField({ include, field: "tracks" })) {
			timelineSnapshot.tracks = toJsonSafe<TimelineSnapshotTrack[]>({
				value: timelineStore.tracks as unknown as TimelineSnapshotTrack[],
				fallback: [],
			});
		}

		if (shouldIncludeTimelineField({ include, field: "selection" })) {
			timelineSnapshot.selection = timelineStore.selectedElements.map(
				(item) => ({
					trackId: item.trackId,
					elementId: item.elementId,
				})
			);
		}

		if (shouldIncludeTimelineField({ include, field: "playhead" })) {
			timelineSnapshot.playhead = {
				currentTime: playbackStore.currentTime,
				isPlaying: playbackStore.isPlaying,
				duration: playbackStore.duration,
				speed: playbackStore.speed,
			};
		}

		if (shouldIncludeTimelineField({ include, field: "meta" })) {
			timelineSnapshot.autoSave = {
				status: timelineStore.autoSaveStatus,
				isSaving: timelineStore.isAutoSaving,
				lastSavedAt: timelineStore.lastAutoSaveAt,
			};
			timelineSnapshot.history = {
				undoDepth: timelineStore.history.length,
				redoDepth: timelineStore.redoStack.length,
			};
		}

		snapshot.state.timeline = timelineSnapshot;
	}

	if (includeMedia) {
		const mediaStore = useMediaStore.getState();
		const { items, unsavedCount } = buildMediaItemsSnapshot();
		mediaUnsavedCount = unsavedCount;

		const counts = {
			total: 0,
			video: 0,
			audio: 0,
			image: 0,
			unsaved: unsavedCount,
		};
		for (const item of items) {
			counts.total += 1;
			if (item.type === "video") counts.video += 1;
			if (item.type === "audio") counts.audio += 1;
			if (item.type === "image") counts.image += 1;
		}

		snapshot.state.media = {
			items,
			counts,
			isLoading: mediaStore.isLoading,
			hasInitialized: mediaStore.hasInitialized,
		};
	} else {
		mediaUnsavedCount = buildMediaItemsSnapshot().unsavedCount;
	}

	if (includeEditor) {
		const editorStore = useEditorStore.getState();
		const panelStore = useMediaPanelStore.getState();
		const exportStore = useExportStore.getState();
		const timelineStore = useTimelineStore.getState();
		const modals = collectOpenDialogs();
		const blockers = collectBlockingOverlays();

		const dirtySources: string[] = [];
		if (timelineStore.isAutoSaving) dirtySources.push("timeline:auto-saving");
		if (timelineStore.autoSaveStatus === "Auto-save failed") {
			dirtySources.push("timeline:auto-save-failed");
		}
		if (mediaUnsavedCount > 0) dirtySources.push("media:unsaved-items");

		snapshot.state.editor = {
			activePanel: {
				group: panelStore.activeGroup ?? null,
				tab: panelStore.activeTab ?? null,
				editSubgroup: panelStore.activeEditSubgroup ?? null,
				aiTab: panelStore.aiActiveTab ?? null,
			},
			activeTool: {
				id: null,
				name: null,
				source: null,
			},
			modals: {
				exportDialogOpen: exportStore.isDialogOpen,
				openCount: modals.length,
				items: modals,
			},
			blockers: {
				overlayCount: blockers.length,
				items: blockers,
			},
			isDirty: dirtySources.length > 0,
			dirtySources,
			canvas: {
				width: editorStore.canvasSize.width,
				height: editorStore.canvasSize.height,
				mode: editorStore.canvasMode,
			},
			initialization: {
				isInitializing: editorStore.isInitializing,
				isPanelsReady: editorStore.isPanelsReady,
			},
		};
	}

	if (includeProject) {
		const projectStore = useProjectStore.getState();
		snapshot.state.project = {
			activeProject: buildProjectMetadataSnapshot(),
			savedProjectCount: projectStore.savedProjects.length,
			isLoading: projectStore.isLoading,
			isInitialized: projectStore.isInitialized,
		};
	}

	return snapshot;
}

function getClaudeStateBridge(): ClaudeStateRendererBridgeAPI | null {
	try {
		const claude = platform().claude as
			| ({ state?: ClaudeStateRendererBridgeAPI } & Record<string, unknown>)
			| undefined;
		return claude?.state ?? null;
	} catch {
		return null;
	}
}

export function setupClaudeStateBridge(): void {
	const bridge = getClaudeStateBridge();
	if (!bridge) return;

	bridge.onSnapshotRequest(
		(data: { requestId: string; request?: EditorStateRequest }) => {
			try {
				const snapshot = buildEditorStateSnapshot({ request: data.request });
				bridge.sendSnapshotResponse(data.requestId, snapshot);
			} catch (error) {
				bridge.sendSnapshotResponse(
					data.requestId,
					undefined,
					error instanceof Error ? error.message : String(error)
				);
			}
		}
	);
}

export function cleanupClaudeStateBridge(): void {
	getClaudeStateBridge()?.removeListeners();
}
