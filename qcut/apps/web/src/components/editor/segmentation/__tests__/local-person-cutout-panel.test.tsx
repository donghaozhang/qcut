import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportPersonCutoutVideo } from "@/lib/segmentation/person-cutout-export";
import { useCloudTaskStore } from "@/stores/cloud-task-store";
import { LocalPersonCutoutPanel } from "../LocalPersonCutoutPanel";

const segmentationState = vi.hoisted(() => ({
	personCutoutSettings: {},
	updatePersonCutoutSettings: vi.fn(),
	isProcessing: false,
	progress: 0,
	statusMessage: "",
	elapsedTime: 0,
	setProcessingState: vi.fn(),
	setSegmentedVideo: vi.fn(),
	segmentedVideoUrl: null,
}));

vi.mock("@/lib/segmentation/person-cutout-export", () => ({
	exportPersonCutoutVideo: vi.fn(),
}));

vi.mock("@/stores/ai/segmentation-store", () => ({
	useSegmentationStore: () => segmentationState,
}));

vi.mock("../PersonCutoutPreview", () => ({
	PersonCutoutPreview: () => <div data-testid="person-cutout-preview" />,
}));

vi.mock("../PersonCutoutSettings", () => ({
	PersonCutoutSettings: () => <div data-testid="person-cutout-settings" />,
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

const exportMock = vi.mocked(exportPersonCutoutVideo);

function renderPanel({ onMaskError = vi.fn() } = {}) {
	const sourceFile = new File(["video"], "source.mp4", {
		type: "video/mp4",
	});
	const addMediaItem = vi.fn();
	render(
		<LocalPersonCutoutPanel
			projectId="project-1"
			sourceFile={sourceFile}
			sourceUrl="blob:source"
			addMediaItem={addMediaItem}
			onMaskError={onMaskError}
		/>
	);
	return { addMediaItem, onMaskError };
}

describe("LocalPersonCutoutPanel", () => {
	beforeEach(() => {
		exportMock.mockReset();
		segmentationState.setProcessingState.mockReset();
		segmentationState.setSegmentedVideo.mockReset();
		useCloudTaskStore.getState().resetTasks();
	});

	it("cancels an active render without reporting a mask failure", async () => {
		exportMock.mockImplementation(({ signal }) => {
			if (!signal) throw new Error("Expected an abort signal");
			return new Promise((_resolve, reject) => {
				signal.addEventListener(
					"abort",
					() => reject(new DOMException("Canceled", "AbortError")),
					{ once: true }
				);
			});
		});
		const { onMaskError } = renderPanel();

		fireEvent.click(screen.getByRole("button", { name: "生成透明 WebM" }));
		fireEvent.click(await screen.findByRole("button", { name: "取消" }));

		expect(await screen.findByText("已取消")).toBeVisible();
		expect(screen.getByRole("button", { name: "重试" })).toBeVisible();
		expect(onMaskError).not.toHaveBeenCalled();
		expect(useCloudTaskStore.getState().tasks[0].status).toBe("canceled");
	});

	it("shows the terminal error and starts a fresh retry", async () => {
		exportMock.mockRejectedValue(new Error("WebCodecs encoder unavailable"));
		const { onMaskError } = renderPanel();

		fireEvent.click(screen.getByRole("button", { name: "生成透明 WebM" }));

		expect(
			await screen.findByText("WebCodecs encoder unavailable")
		).toBeVisible();
		expect(onMaskError).toHaveBeenCalledWith("WebCodecs encoder unavailable");

		fireEvent.click(screen.getByRole("button", { name: "重试" }));
		await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(2));
	});
});
