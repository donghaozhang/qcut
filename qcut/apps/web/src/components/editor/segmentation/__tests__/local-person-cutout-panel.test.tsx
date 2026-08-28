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
	segmentedVideoUrl: null as string | null,
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

const fineExportResult: Awaited<ReturnType<typeof exportPersonCutoutVideo>> = {
	blendImplementation: "TEMattingBlendEffectV2-compatible",
	blob: new Blob(["cutout"], { type: "video/webm" }),
	codec: "vp9",
	didModelRouteFallback: false,
	duration: 2,
	frameCount: 60,
	frameRate: 30,
	hasAudio: false,
	height: 640,
	modelRoute: "portrait-gru",
	nativeMetalCanary: "passed",
	pipelineId: "qcut-gru-vision-fusion-v1",
	provider: "qcut-local-person-matting-v1",
	refinementProvider: "qcut-portrait-temporal-border-refinement-v1",
	requestedModelRoute: "auto",
	trackingSamples: [],
	width: 360,
};

function renderPanel({
	onMaskError = vi.fn(),
	onMaskReady,
	autoStartRequestId,
}: {
	onMaskError?: (message: string) => void;
	onMaskReady?: Parameters<typeof LocalPersonCutoutPanel>[0]["onMaskReady"];
	autoStartRequestId?: string;
} = {}) {
	const sourceFile = new File(["video"], "source.mp4", {
		type: "video/mp4",
	});
	const addMediaItem = vi.fn().mockResolvedValue("cutout-media-1");
	const panel = () => (
		<LocalPersonCutoutPanel
			projectId="project-1"
			sourceFile={sourceFile}
			sourceUrl="blob:source"
			autoStartRequestId={autoStartRequestId}
			addMediaItem={addMediaItem}
			onMaskError={onMaskError}
			onMaskReady={onMaskReady}
		/>
	);
	const rendered = render(panel());
	return {
		addMediaItem,
		onMaskError,
		rerenderPanel: () => rendered.rerender(panel()),
	};
}

describe("LocalPersonCutoutPanel", () => {
	beforeEach(() => {
		exportMock.mockReset();
		segmentationState.updatePersonCutoutSettings.mockReset();
		segmentationState.setProcessingState.mockReset();
		segmentationState.setSegmentedVideo.mockReset();
		segmentationState.segmentedVideoUrl = null;
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

	it("persists fine-mode execution metadata and attaches the QCut matte", async () => {
		exportMock.mockResolvedValue(fineExportResult);
		const onMaskReady = vi.fn(() => true);
		const { addMediaItem, rerenderPanel } = renderPanel({ onMaskReady });

		fireEvent.click(screen.getByTestId("person-cutout-quality-fine"));
		fireEvent.click(screen.getByRole("button", { name: "开始并应用" }));

		await waitFor(() => expect(addMediaItem).toHaveBeenCalledOnce());
		expect(addMediaItem).toHaveBeenCalledWith(
			"project-1",
			expect.objectContaining({
				metadata: expect.objectContaining({
					blendImplementation: "TEMattingBlendEffectV2-compatible",
					didModelRouteFallback: false,
					modelRoute: "portrait-gru",
					nativeMetalCanary: "passed",
					pipelineId: "qcut-gru-vision-fusion-v1",
					provider: "qcut-local-person-matting-v1",
					quality: "fine",
					refinementProvider: "qcut-portrait-temporal-border-refinement-v1",
					requestedModelRoute: "auto",
					source: "qcut-local-person-cutout",
				}),
			})
		);
		expect(onMaskReady).toHaveBeenCalledWith(
			expect.objectContaining({
				source: "qcut-person-matting",
				sourceMediaId: "cutout-media-1",
			})
		);
		expect(segmentationState.setProcessingState).toHaveBeenLastCalledWith(
			expect.objectContaining({
				isProcessing: false,
				statusMessage: "人物蒙版已应用到所选片段",
			})
		);

		segmentationState.segmentedVideoUrl = "blob:cutout";
		rerenderPanel();
		expect(screen.getByTestId("person-cutout-result")).toHaveTextContent(
			"人物抠像结果已生成并应用"
		);
	});

	it("states that an unattached result was only added to the media library", async () => {
		exportMock.mockResolvedValue(fineExportResult);
		const { rerenderPanel } = renderPanel({ onMaskReady: () => false });

		fireEvent.click(screen.getByTestId("person-cutout-quality-fine"));
		fireEvent.click(screen.getByRole("button", { name: "开始并应用" }));
		await waitFor(() =>
			expect(segmentationState.setProcessingState).toHaveBeenLastCalledWith(
				expect.objectContaining({
					isProcessing: false,
					statusMessage: "透明人物视频已添加到素材库",
				})
			)
		);

		segmentationState.segmentedVideoUrl = "blob:cutout";
		rerenderPanel();
		expect(screen.getByTestId("person-cutout-result")).toHaveTextContent(
			"人物抠像结果已生成，已添加到素材库"
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
