import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	JianyingFilterLabLoadResult,
	JianyingFilterLabLutSummary,
} from "@/types/electron";
import type { TimelineStore } from "@/stores/timeline/types";
import type { TimelineTrack } from "@/types/timeline";
import { AdjustmentsView } from "../adjustments";

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

function installTimelineState({
	selectedAdjustment = true,
}: {
	selectedAdjustment?: boolean;
} = {}) {
	const tracks: TimelineTrack[] = [
		{
			id: "adjustment-track",
			name: "Adjustment",
			type: "adjustment",
			elements: [
				{
					id: "adjustment-1",
					type: "adjustment",
					name: "调节1",
					duration: 3,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
					opacity: 1,
				},
			],
		},
		{
			id: "media-track",
			name: "Media",
			type: "media",
			isMain: true,
			elements: [
				{
					id: "clip-1",
					type: "media",
					mediaId: "asset-1",
					name: "Clip 1",
					duration: 3,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
				},
			],
		},
	];
	const pushHistory = vi.fn();
	const insertTrackAt = vi.fn(() => "adjustment-track");
	const getTotalDuration = vi.fn(() => 12);
	const addElementToTrack = vi.fn(() => "adjustment-2");
	const updateAdjustmentElement = vi.fn();
	useTimelineStore.setState({
		_tracks: tracks,
		tracks,
		selectedElements: selectedAdjustment
			? [{ trackId: "adjustment-track", elementId: "adjustment-1" }]
			: [],
		pushHistory,
		insertTrackAt: insertTrackAt as TimelineStore["insertTrackAt"],
		getTotalDuration: getTotalDuration as TimelineStore["getTotalDuration"],
		addElementToTrack:
			addElementToTrack as unknown as TimelineStore["addElementToTrack"],
		updateAdjustmentElement:
			updateAdjustmentElement as unknown as TimelineStore["updateAdjustmentElement"],
	});
	usePlaybackStore.setState({ currentTime: 2 });
	return {
		insertTrackAt,
		addElementToTrack,
		pushHistory,
		updateAdjustmentElement,
	};
}

const cubeLut = [
	'TITLE "Panel LUT"',
	"LUT_3D_SIZE 2",
	"0 0 0",
	"1 0 0",
	"0 1 0",
	"1 1 0",
	"0 0 1",
	"1 0 1",
	"0 1 1",
	"1 1 1",
].join("\n");

const localLutSummary: JianyingFilterLabLutSummary = {
	lutId: "7429744855724641545/f4d46cb5bca43ef171199ea673d53b00/filter.cube.vf",
	resourceId: "7429744855724641545",
	version: "f4d46cb5bca43ef171199ea673d53b00",
	fileName: "filter.cube.vf",
	role: "single",
	size: 2,
	title: "高清黑白",
};

const loadedLocalLut: JianyingFilterLabLoadResult = {
	...localLutSummary,
	kind: "monochrome",
	cube: {
		size: 2,
		domainMin: [0, 0, 0],
		domainMax: [1, 1, 1],
		values: [
			0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
		],
	},
};

function installFilterLabApi({
	available = true,
}: {
	available?: boolean;
} = {}) {
	const list = vi.fn(async () => ({
		count: 1,
		luts: [localLutSummary],
		categoryOrder: [],
		uncached: [],
	}));
	const load = vi.fn(async () => loadedLocalLut);
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: {
			...(window.electronAPI ?? {}),
			jianyingFilterLab: available ? { list, load } : undefined,
		},
	});
	return { list, load };
}

describe("AdjustmentsView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installFilterLabApi();
	});

	it("renders the adjustment, LUT import, and filter lab entry points", () => {
		installTimelineState();
		render(<AdjustmentsView />);

		expect(screen.getByText("新建调节")).toBeInTheDocument();
		expect(screen.getByText("我的")).toBeInTheDocument();
		expect(screen.getByText("LUT")).toBeInTheDocument();
		expect(screen.getByText("滤镜实验室")).toBeInTheDocument();
		expect(screen.getByText("自定义调节")).toBeInTheDocument();
		expect(
			screen.queryByTestId("color-properties-panel")
		).not.toBeInTheDocument();
	});

	it("creates an adjustment layer at the playhead", () => {
		const timeline = installTimelineState();
		render(<AdjustmentsView />);

		fireEvent.click(screen.getByText("新建调节"));

		// Above the topmost media track (index 1 in the fixture), never appended.
		expect(timeline.insertTrackAt).toHaveBeenCalledWith("adjustment", 1);
		expect(timeline.addElementToTrack).toHaveBeenCalledWith(
			"adjustment-track",
			expect.objectContaining({
				type: "adjustment",
				name: "自定义调节",
				startTime: 2,
				duration: 10,
			}),
			{ pushHistory: false, selectElement: true }
		);
		expect(toast.success).toHaveBeenCalledWith("已新建调节层");
	});

	it("imports a LUT onto the selected adjustment layer", async () => {
		const timeline = installTimelineState();
		render(<AdjustmentsView />);

		fireEvent.click(screen.getByText("LUT"));
		fireEvent.change(screen.getByLabelText("选择 LUT 文件"), {
			target: {
				files: [new File([cubeLut], "panel.cube", { type: "text/plain" })],
			},
		});

		await waitFor(() => {
			expect(timeline.updateAdjustmentElement).toHaveBeenCalledWith(
				"adjustment-track",
				"adjustment-1",
				expect.objectContaining({
					color: expect.objectContaining({
						lut: expect.objectContaining({
							enabled: true,
							presetId: "custom",
							name: "Panel LUT",
						}),
					}),
				}),
				true
			);
		});
		expect(toast.success).toHaveBeenCalledWith("已导入 Panel LUT 到调节层");
	});

	it("creates an adjustment layer before importing a LUT when none is selected", async () => {
		const timeline = installTimelineState({ selectedAdjustment: false });
		render(<AdjustmentsView />);

		fireEvent.click(screen.getByText("LUT"));
		fireEvent.change(screen.getByLabelText("选择 LUT 文件"), {
			target: {
				files: [new File([cubeLut], "panel.cube", { type: "text/plain" })],
			},
		});

		await waitFor(() => {
			expect(timeline.addElementToTrack).toHaveBeenCalledWith(
				"adjustment-track",
				expect.objectContaining({
					name: "LUT - Panel LUT",
					type: "adjustment",
				}),
				{ pushHistory: false, selectElement: true }
			);
			expect(timeline.updateAdjustmentElement).toHaveBeenCalledWith(
				"adjustment-track",
				"adjustment-2",
				expect.objectContaining({
					color: expect.objectContaining({
						lut: expect.objectContaining({ name: "Panel LUT" }),
					}),
				}),
				false
			);
		});
	});

	it("loads and applies the exact local Jianying LUT to the selected layer", async () => {
		const timeline = installTimelineState();
		const api = installFilterLabApi();
		render(<AdjustmentsView />);

		fireEvent.click(screen.getByText("滤镜实验室"));
		await screen.findByText("高清黑白");
		expect(api.list).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByRole("button", { name: "应用 高清黑白" }));

		await waitFor(() => {
			expect(api.load).toHaveBeenCalledWith({ lutId: localLutSummary.lutId });
			expect(timeline.updateAdjustmentElement).toHaveBeenCalledWith(
				"adjustment-track",
				"adjustment-1",
				expect.objectContaining({
					color: expect.objectContaining({
						lut: expect.objectContaining({
							enabled: true,
							name: "高清黑白",
							cube: loadedLocalLut.cube,
						}),
					}),
				}),
				true
			);
		});
		expect(toast.success).toHaveBeenCalledWith("已应用 高清黑白 到调节层");
	});

	it("shows a desktop-only state when the local cache bridge is unavailable", async () => {
		installTimelineState();
		installFilterLabApi({ available: false });
		render(<AdjustmentsView />);

		fireEvent.click(screen.getByText("滤镜实验室"));
		expect(
			await screen.findByText("滤镜实验室仅在 QCut 桌面版中可用")
		).toBeInTheDocument();
	});
});
