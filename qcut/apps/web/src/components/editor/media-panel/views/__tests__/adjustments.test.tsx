import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	JianyingFilterLabFilterSummary,
	JianyingFilterLabLoadResult,
	JianyingFilterLabLutSummary,
} from "@/types/electron";
import type { TimelineStore } from "@/stores/timeline/types";
import type { TimelineTrack } from "@/types/timeline";
import { AdjustmentsView } from "../adjustments";
import { JianyingFilterLabShelf } from "../adjustments/jianying-filter-lab-shelf";

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

function installTimelineState({
	selectedAdjustment = true,
	withLut = false,
}: {
	selectedAdjustment?: boolean;
	withLut?: boolean;
} = {}) {
	const color = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
	color.lut = {
		...color.lut,
		enabled: true,
		presetId: "custom",
		name: "高清黑白",
		cube: loadedLocalLut.cube,
	};
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
					...(withLut ? { color } : {}),
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

const localFilterSummary: JianyingFilterLabFilterSummary = {
	resourceId: localLutSummary.resourceId,
	title: "高清黑白",
	version: localLutSummary.version,
	categories: ["黑白"],
	cacheStatus: "cached",
	implementation: "single-lut",
	available: true,
	hasThumbnail: false,
	downloadable: false,
	verification: { status: "unverified" },
	luts: [localLutSummary],
};

function installFilterLabApi({
	available = true,
}: {
	available?: boolean;
} = {}) {
	const list = vi.fn(async () => ({
		count: 1,
		cachedCount: 1,
		availableCount: 1,
		filters: [localFilterSummary],
		categories: [{ name: "黑白", total: 1, cached: 1, available: 1 }],
	}));
	const load = vi.fn(async () => loadedLocalLut);
	const thumbnail = vi.fn();
	const onCatalogChanged = vi.fn(() => vi.fn());
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: {
			...(window.electronAPI ?? {}),
			jianyingFilterLab: available
				? { list, load, thumbnail, onCatalogChanged }
				: undefined,
		},
	});
	return { list, load, thumbnail, onCatalogChanged };
}

describe("AdjustmentsView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installFilterLabApi();
	});

	it("renders the adjustment and LUT import entry points without the lab", () => {
		installTimelineState();
		render(<AdjustmentsView />);

		expect(screen.getByText("新建调节")).toBeInTheDocument();
		expect(screen.getByText("我的")).toBeInTheDocument();
		expect(screen.getByText("LUT")).toBeInTheDocument();
		// The lab moved to the 滤镜 panel; adjustments must not offer it twice.
		expect(screen.queryByText("滤镜实验室")).not.toBeInTheDocument();
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
		render(<JianyingFilterLabShelf />);

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

	it("previews the active LUT against the original and updates its intensity", async () => {
		const timeline = installTimelineState({ withLut: true });
		render(<JianyingFilterLabShelf />);

		await screen.findByTestId("jianying-filter-lab-controls");
		expect(screen.getByRole("button", { name: "B 滤镜" })).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		expect(
			screen.getByRole("slider", { name: "剪映滤镜强度" })
		).toHaveAttribute("aria-valuenow", "100");

		fireEvent.click(screen.getByRole("button", { name: "A 原图" }));
		expect(timeline.updateAdjustmentElement).toHaveBeenLastCalledWith(
			"adjustment-track",
			"adjustment-1",
			expect.objectContaining({
				color: expect.objectContaining({
					lut: expect.objectContaining({
						enabled: false,
						cube: loadedLocalLut.cube,
					}),
				}),
			}),
			true
		);

		timeline.updateAdjustmentElement.mockClear();
		fireEvent.keyDown(screen.getByRole("slider", { name: "剪映滤镜强度" }), {
			key: "ArrowLeft",
		});
		expect(timeline.updateAdjustmentElement).toHaveBeenCalledWith(
			"adjustment-track",
			"adjustment-1",
			expect.objectContaining({
				color: expect.objectContaining({
					lut: expect.objectContaining({ intensity: 99 }),
				}),
			}),
			true
		);
	});

	it("shows a desktop-only state when the local cache bridge is unavailable", async () => {
		installTimelineState();
		installFilterLabApi({ available: false });
		render(<JianyingFilterLabShelf />);

		expect(
			await screen.findByText("滤镜实验室仅在 QCut 桌面版中可用")
		).toBeInTheDocument();
	});
});
