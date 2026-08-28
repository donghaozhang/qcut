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
	useSegmentationStore: Object.assign(() => segmentationState, {
		getState: () => ({ ...segmentationState, trackingRequest: null }),
	}),
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

function renderPanel({
	onMaskError = vi.fn(),
	autoStartRequestId,
}: {
	onMaskError?: (message: string) => void;
	autoStartRequestId?: string;
} = {}) {
	const sourceFile = new File(["video"], "source.mp4", {
		type: "video/mp4",
	});
	const addMediaItem = vi.fn();
	render(
		<LocalPersonCutoutPanel
			projectId="project-1"
			sourceFile={sourceFile}
			sourceUrl="blob:source"
			autoStartRequestId={autoStartRequestId}
			addMediaItem={addMediaItem}
			onMaskError={onMaskError}
		/>
	);
	return { addMediaItem, onMaskError };
}

describe("LocalPersonCutoutPanel", () => {
	beforeEach(() => {
		exportMock.mockReset();
		segmentationState.updatePersonCutoutSettings.mockReset();
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

		fireEvent.click(screen.getByRole("button", { name: "开始人物抠像" }));
		fireEvent.click(await screen.findByRole("button", { name: "取消" }));

		expect(await screen.findByText("已取消")).toBeVisible();
		expect(screen.getByRole("button", { name: "重试" })).toBeVisible();
		expect(onMaskError).not.toHaveBeenCalled();
		expect(useCloudTaskStore.getState().tasks[0].status).toBe("canceled");
	});

	it("shows the terminal error and starts a fresh retry", async () => {
		exportMock.mockRejectedValue(new Error("本机暂时无法生成透明视频"));
		const { onMaskError } = renderPanel();

		fireEvent.click(screen.getByRole("button", { name: "开始人物抠像" }));

		expect(await screen.findByText("本机暂时无法生成透明视频")).toBeVisible();
		expect(onMaskError).toHaveBeenCalledWith("本机暂时无法生成透明视频");

		fireEvent.click(screen.getByRole("button", { name: "重试" }));
		await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(2));
	});

	it("uses the selected fine quality without showing a preview player", async () => {
		exportMock.mockRejectedValue(new Error("测试结束"));
		renderPanel();

		expect(document.querySelector("video")).toBeNull();
		expect(
			screen.getByText("基础处理速度较快，精细效果更佳，但耗时较长")
		).toBeVisible();
		fireEvent.click(screen.getByTestId("person-cutout-quality-fine"));
		expect(segmentationState.updatePersonCutoutSettings).toHaveBeenCalledWith({
			threshold: 0.5,
			temporalSmoothing: 0,
			edgeShift: 0,
			feather: 0,
		});
		fireEvent.click(screen.getByRole("button", { name: "开始人物抠像" }));

		await waitFor(() =>
			expect(exportMock).toHaveBeenCalledWith(
				expect.objectContaining({ quality: "fine" })
			)
		);
	});

	it("automatically starts each tracking request only once", async () => {
		exportMock.mockRejectedValue(new Error("stop after auto start"));
		const sourceFile = new File(["video"], "source.mp4", {
			type: "video/mp4",
		});
		const { rerender } = render(
			<LocalPersonCutoutPanel
				projectId="project-1"
				sourceFile={sourceFile}
				sourceUrl="blob:source"
				autoStartRequestId="tracking-1"
				addMediaItem={vi.fn()}
			/>
		);

		await waitFor(() => expect(exportMock).toHaveBeenCalledOnce());
		rerender(
			<LocalPersonCutoutPanel
				projectId="project-1"
				sourceFile={sourceFile}
				sourceUrl="blob:source"
				autoStartRequestId="tracking-1"
				addMediaItem={vi.fn()}
			/>
		);
		expect(exportMock).toHaveBeenCalledOnce();
		rerender(
			<LocalPersonCutoutPanel
				projectId="project-1"
				sourceFile={sourceFile}
				sourceUrl="blob:source"
				autoStartRequestId="tracking-2"
				addMediaItem={vi.fn()}
			/>
		);
		await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(2));
	});
});
