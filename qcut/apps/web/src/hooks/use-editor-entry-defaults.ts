import { useEffect } from "react";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { usePreviewModeStore } from "@/stores/preview-mode-store";

export function useEditorEntryDefaults({ projectId }: { projectId: string }) {
	const setActiveTab = useMediaPanelStore((state) => state.setActiveTab);
	const setPreviewMode = usePreviewModeStore((state) => state.setPreviewMode);

	useEffect(() => {
		if (!projectId) return;

		setActiveTab("media");
		setPreviewMode("video");
	}, [projectId, setActiveTab, setPreviewMode]);
}
