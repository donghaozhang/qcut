import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaElement } from "@/types/timeline";

const mocks = vi.hoisted(() => ({
	cancelOutpaint: vi.fn(),
	retryOutpaint: vi.fn(),
	runOutpaint: vi.fn(),
}));

vi.mock("@/hooks/use-media-outpaint", () => ({
	useMediaOutpaint: () => ({
		isAvailable: true,
		isChecked: true,
		isGenerating: false,
		isRunning: false,
		mediaItem: { id: "media-1", type: "video" },
		sourceDuration: 8,
		taskId: undefined,
		taskRequest: null,
		runOutpaint: mocks.runOutpaint,
		cancelOutpaint: mocks.cancelOutpaint,
		retryOutpaint: mocks.retryOutpaint,
	}),
}));

vi.mock("@/stores/editor/editor-store", () => ({
	useEditorStore: (
		selector: (state: {
			canvasSize: { width: number; height: number };
		}) => unknown
	) => selector({ canvasSize: { width: 1920, height: 1080 } }),
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: (
		selector: (state: { activeProject: { fps: number } }) => unknown
	) => selector({ activeProject: { fps: 30 } }),
}));

import { MediaAIProperties } from "../media-ai-properties";

const ELEMENT: MediaElement = {
	id: "clip-1",
	type: "media",
	mediaId: "media-1",
	name: "Clip",
	duration: 8,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
};

describe("MediaAIProperties", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.runOutpaint.mockResolvedValue(true);
	});

	it("submits an outpaint request for the selected clip", () => {
		render(
			<MediaAIProperties
				element={ELEMENT}
				trackId="track-1"
				onOpenUpscale={vi.fn()}
				onOpenVideoTools={vi.fn()}
			/>
		);

		const generate = screen.getByTestId("media-outpaint-generate");
		expect(generate).toBeDisabled();
		fireEvent.change(screen.getByTestId("media-outpaint-prompt"), {
			target: { value: "continue the office beyond the original frame" },
		});
		expect(generate).toBeEnabled();
		fireEvent.click(generate);

		expect(mocks.runOutpaint).toHaveBeenCalledWith({
			request: {
				prompt: "continue the office beyond the original frame",
				aspectRatio: "16:9",
				resolution: "720p",
			},
		});
	});

	it("keeps the existing upscale and AI tools entry points", () => {
		const onOpenUpscale = vi.fn();
		const onOpenVideoTools = vi.fn();
		render(
			<MediaAIProperties
				element={ELEMENT}
				trackId="track-1"
				onOpenUpscale={onOpenUpscale}
				onOpenVideoTools={onOpenVideoTools}
			/>
		);

		fireEvent.click(screen.getByTestId("media-ai-upscale"));
		fireEvent.click(screen.getByTestId("media-ai-video-tools"));
		expect(onOpenUpscale).toHaveBeenCalledOnce();
		expect(onOpenVideoTools).toHaveBeenCalledOnce();
	});
});
