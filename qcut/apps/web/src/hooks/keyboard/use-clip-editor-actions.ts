import { useEffect } from "react";
import { toast } from "sonner";
import {
	bindAction,
	type ActionWithNoArgs,
	unbindAction,
} from "@/constants/actions";
import { exportStillFrame } from "@/lib/export/export-still-frame";
import { translate } from "@/lib/i18n";
import { freezeSelectedElementAtPlayhead } from "@/lib/timeline/freeze-frame";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { usePreviewViewStore } from "@/stores/editor/preview-view-store";
import { useLocaleStore } from "@/stores/locale-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TranslationKey } from "@/lib/i18n";

function t(key: TranslationKey, values?: Record<string, string | number>) {
	return translate({ locale: useLocaleStore.getState().locale, key, values });
}

function getSingleSelection() {
	const { selectedElements, tracks } = useTimelineStore.getState();
	if (selectedElements.length !== 1) return null;
	const selection = selectedElements[0];
	const track = tracks.find((candidate) => candidate.id === selection.trackId);
	const element = track?.elements.find(
		(candidate) => candidate.id === selection.elementId
	);
	return track && element ? { ...selection, track, element } : null;
}

function separateAudioSelected() {
	const selection = getSingleSelection();
	if (!selection || selection.track.type !== "media") {
		toast.error("Select exactly one media element to separate audio");
		return;
	}
	useTimelineStore
		.getState()
		.separateAudio(selection.trackId, selection.elementId);
}

function toggleBookmarkAtPlayhead() {
	const currentTime = usePlaybackStore.getState().currentTime;
	void useProjectStore.getState().toggleBookmark(currentTime);
}

function toggleSelectedElementEnabled() {
	const selection = getSingleSelection();
	if (!selection) {
		toast.error("Select a clip to enable or disable it");
		return;
	}
	useTimelineStore
		.getState()
		.toggleElementHidden(selection.trackId, selection.elementId);
}

function groupSelected() {
	const groupId = useTimelineStore.getState().groupSelectedElements();
	if (!groupId) {
		toast.error(t("timeline.toast.selectTwoForGroup"));
		return;
	}
	toast.success(t("timeline.toast.groupCreated"));
}

export async function runStillFrameExport() {
	const result = await exportStillFrame();
	if (result.ok) {
		toast.success(
			t("editor.preview.exportStillSuccess", { fileName: result.fileName })
		);
		return;
	}
	toast.error(t("editor.preview.exportStillError", { error: result.error }));
}

function ungroupSelected() {
	const selection = getSingleSelection();
	if (!selection?.element.groupId) {
		toast.error(t("timeline.toast.selectTwoForGroup"));
		return;
	}
	const count = useTimelineStore
		.getState()
		.ungroupElements(selection.element.groupId);
	if (count > 0) {
		toast.success(t("timeline.toast.ungrouped", { count }));
	}
}

/**
 * Binds clip-workflow and player-view actions so the shortcut system can
 * trigger the same behavior as the toolbar buttons and preview controls.
 */
export function useClipEditorActions() {
	useEffect(() => {
		const handlers: Partial<Record<ActionWithNoArgs, () => void>> = {
			"freeze-selected": () => {
				freezeSelectedElementAtPlayhead();
			},
			"separate-audio-selected": separateAudioSelected,
			"toggle-bookmark": toggleBookmarkAtPlayhead,
			"toggle-element-enabled": toggleSelectedElementEnabled,
			"group-selected": groupSelected,
			"ungroup-selected": ungroupSelected,
			"toggle-safe-areas": () =>
				usePreviewViewStore.getState().toggleSafeAreas(),
			"player-zoom-in": () =>
				usePreviewViewStore.getState().stepPreviewScale("in"),
			"player-zoom-out": () =>
				usePreviewViewStore.getState().stepPreviewScale("out"),
			"player-zoom-fit": () =>
				usePreviewViewStore.getState().setPreviewScale("fit"),
			"export-still-frame": () => {
				void runStillFrameExport();
			},
		};
		const entries = Object.entries(handlers) as Array<
			[ActionWithNoArgs, () => void]
		>;
		for (const [action, handler] of entries) bindAction(action, handler);
		return () => {
			for (const [action, handler] of entries) unbindAction(action, handler);
		};
	}, []);
}
