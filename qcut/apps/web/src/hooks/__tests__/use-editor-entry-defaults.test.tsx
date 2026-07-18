import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { usePreviewModeStore } from "@/stores/preview-mode-store";
import { useEditorEntryDefaults } from "../use-editor-entry-defaults";

describe("useEditorEntryDefaults", () => {
	beforeEach(() => {
		useMediaPanelStore.getState().setActiveTab("pty");
		usePreviewModeStore.getState().setPreviewMode("agent");
	});

	it("opens a project in the media and video views", () => {
		renderHook(() => useEditorEntryDefaults({ projectId: "project-one" }));

		expect(useMediaPanelStore.getState().activeGroup).toBe("media");
		expect(useMediaPanelStore.getState().activeTab).toBe("media");
		expect(usePreviewModeStore.getState().previewMode).toBe("video");
	});

	it("does not override a manual Agent switch within the same project", () => {
		const { rerender } = renderHook(
			({ projectId }) => useEditorEntryDefaults({ projectId }),
			{ initialProps: { projectId: "project-one" } }
		);

		act(() => {
			useMediaPanelStore.getState().setActiveTab("pty");
			usePreviewModeStore.getState().setPreviewMode("agent");
		});
		rerender({ projectId: "project-one" });

		expect(useMediaPanelStore.getState().activeTab).toBe("pty");
		expect(usePreviewModeStore.getState().previewMode).toBe("agent");
	});

	it("restores the defaults when entering another project", () => {
		const { rerender } = renderHook(
			({ projectId }) => useEditorEntryDefaults({ projectId }),
			{ initialProps: { projectId: "project-one" } }
		);

		act(() => {
			useMediaPanelStore.getState().setActiveTab("pty");
			usePreviewModeStore.getState().setPreviewMode("agent");
		});
		rerender({ projectId: "project-two" });

		expect(useMediaPanelStore.getState().activeGroup).toBe("media");
		expect(useMediaPanelStore.getState().activeTab).toBe("media");
		expect(usePreviewModeStore.getState().previewMode).toBe("video");
	});
});
