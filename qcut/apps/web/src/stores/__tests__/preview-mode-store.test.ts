import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePreviewModeStore } from "@/stores/preview-mode-store";

describe("usePreviewModeStore", () => {
	beforeEach(() => {
		usePreviewModeStore.setState({ previewMode: "video" });
	});

	it("should default to video mode", () => {
		const { result } = renderHook(() => usePreviewModeStore());
		expect(result.current.previewMode).toBe("video");
	});

	it("should switch to mcp mode", () => {
		const { result } = renderHook(() => usePreviewModeStore());

		act(() => {
			result.current.setPreviewMode("mcp");
		});

		expect(result.current.previewMode).toBe("mcp");
	});

	it("should switch to agent mode", () => {
		const { result } = renderHook(() => usePreviewModeStore());

		act(() => {
			result.current.setPreviewMode("agent");
		});

		expect(result.current.previewMode).toBe("agent");
	});

	it("should switch back to video from agent", () => {
		const { result } = renderHook(() => usePreviewModeStore());

		act(() => {
			result.current.setPreviewMode("agent");
		});
		expect(result.current.previewMode).toBe("agent");

		act(() => {
			result.current.setPreviewMode("video");
		});
		expect(result.current.previewMode).toBe("video");
	});
});
