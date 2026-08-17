import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	JianyingFilterLabFilterSummary,
	JianyingFilterLabListResult,
} from "@/types/electron";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { JianyingFilterLab } from "../jianying-filter-lab";

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

const cachedSummer: JianyingFilterLabFilterSummary = {
	resourceId: "cached-1",
	title: "蜜桃乌龙",
	version: "0123456789abcdef",
	categories: ["夏日"],
	cacheStatus: "cached",
	implementation: "single-lut",
	available: true,
	hasThumbnail: false,
	downloadable: false,
	verification: { status: "unverified" },
	luts: [
		{
			lutId: "cached-1/0123456789abcdef/filter.cube.vf",
			resourceId: "cached-1",
			version: "0123456789abcdef",
			fileName: "filter.cube.vf",
			role: "single",
			size: 2,
			title: "蜜桃乌龙",
			categories: ["夏日"],
		},
	],
};

const dualPortrait: JianyingFilterLabFilterSummary = {
	resourceId: "dual-1",
	title: "亮肤",
	version: "dual-version",
	categories: ["人像"],
	cacheStatus: "cached",
	implementation: "dual-lut",
	available: true,
	hasThumbnail: false,
	downloadable: false,
	verification: { status: "unverified" },
	luts: [
		{
			lutId: "dual-1/dual-version/filter_bg.3dl.vf",
			resourceId: "dual-1",
			version: "dual-version",
			fileName: "filter_bg.3dl.vf",
			role: "background",
			size: 17,
		},
		{
			lutId: "dual-1/dual-version/filter_skin.3dl.vf",
			resourceId: "dual-1",
			version: "dual-version",
			fileName: "filter_skin.3dl.vf",
			role: "skin",
			size: 64,
		},
	],
};

const uncachedSummer: JianyingFilterLabFilterSummary = {
	resourceId: "uncached-1",
	title: "汽水冰摇",
	version: "remote-version",
	categories: ["夏日"],
	cacheStatus: "uncached",
	implementation: "unknown",
	available: false,
	hasThumbnail: false,
	downloadable: true,
	verification: { status: "unverified" },
	luts: [],
};

const shaderFood: JianyingFilterLabFilterSummary = {
	resourceId: "shader-food",
	title: "清透美食",
	version: "shader-version",
	categories: ["美食"],
	cacheStatus: "cached",
	implementation: "shader",
	available: true,
	hasThumbnail: false,
	downloadable: false,
	verification: { status: "unverified" },
	luts: [],
	renderer: {
		kind: "sharpen-lut",
		passCount: 2,
		fidelity: "structural",
	},
};

const catalogResult: JianyingFilterLabListResult = {
	count: 3,
	cachedCount: 2,
	availableCount: 2,
	filters: [cachedSummer, dualPortrait, uncachedSummer],
	categories: [
		{ name: "夏日", total: 2, cached: 1, available: 1 },
		{ name: "人像", total: 1, cached: 1, available: 1 },
	],
};

function installFilterLabApi({
	result,
}: {
	result: JianyingFilterLabListResult;
}) {
	const list = vi.fn(async () => result);
	const load = vi.fn(async ({ lutId }: { lutId: string }) => {
		const entry = [...cachedSummer.luts, ...dualPortrait.luts].find(
			(candidate) => candidate.lutId === lutId
		);
		if (!entry) throw new Error("Missing fixture LUT");
		return {
			...entry,
			kind: "colour" as const,
			cube: {
				size: 2,
				domainMin: [0, 0, 0] as [number, number, number],
				domainMax: [1, 1, 1] as [number, number, number],
				values: Array.from({ length: 24 }, () => 0),
			},
		};
	});
	const thumbnail = vi.fn();
	const loadRenderer = vi.fn(
		async ({ resourceId }: { resourceId: string }) => ({
			resourceId,
			version: "shader-version",
			name: "清透美食",
			enabled: true as const,
			presetId: `jianying:${resourceId}:shader-version`,
			intensity: 100,
			fidelity: "structural" as const,
			passes: [
				{ kind: "sharpen" as const, amount: 1 },
				{
					kind: "lut" as const,
					intensity: 100,
					cube: {
						size: 2,
						domainMin: [0, 0, 0] as [number, number, number],
						domainMax: [1, 1, 1] as [number, number, number],
						values: Array.from({ length: 24 }, () => 0),
					},
				},
			],
		})
	);
	const download = vi.fn(async ({ resourceId }: { resourceId: string }) => ({
		resourceId,
		version: "remote-version",
	}));
	const onCatalogChanged = vi.fn(() => vi.fn());
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: {
			...(window.electronAPI ?? {}),
			jianyingFilterLab: {
				list,
				load,
				loadRenderer,
				thumbnail,
				download,
				onCatalogChanged,
			},
		},
	});
	return { list, load, loadRenderer, thumbnail, download, onCatalogChanged };
}

describe("JianyingFilterLab catalog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		const storage = new Map<string, string>();
		vi.mocked(window.localStorage.getItem).mockImplementation(
			(key) => storage.get(key) ?? null
		);
		vi.mocked(window.localStorage.setItem).mockImplementation((key, value) => {
			storage.set(key, value);
		});
		vi.mocked(window.localStorage.removeItem).mockImplementation((key) => {
			storage.delete(key);
		});
		vi.mocked(window.localStorage.clear).mockImplementation(() =>
			storage.clear()
		);
		useAssetLibraryStore.getState().resetLibrary();
	});

	it("shows available/total counts in Jianying category order", async () => {
		installFilterLabApi({ result: catalogResult });
		render(<JianyingFilterLab onApply={vi.fn()} />);

		expect(
			await screen.findByRole("tab", { name: "全部 2/3" })
		).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "夏日 1/2" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "人像 1/1" })).toBeInTheDocument();
		expect(screen.getByText("显示 2 · 可用 2/3 · 缓存 2")).toBeInTheDocument();
	});

	it("exposes measured verification details without claiming load parity", async () => {
		installFilterLabApi({
			result: {
				...catalogResult,
				filters: [
					{
						...cachedSummer,
						verification: {
							status: "close",
							version: cachedSummer.version,
							rgbRmse: 2.1,
							psnr: 41.2,
							ssim: 0.989,
							deltaE: 2.4,
						},
					},
					dualPortrait,
					uncachedSummer,
				],
			},
		});
		render(<JianyingFilterLab onApply={vi.fn()} />);
		const badge = await screen.findByText("接近");
		expect(badge).toHaveAttribute(
			"title",
			"接近 · RGB RMSE 2.1 · PSNR 41.2 · SSIM 0.989 · DeltaE 2.4"
		);
	});

	it("renders one grouped row for a dual LUT instead of two file rows", async () => {
		const api = installFilterLabApi({ result: catalogResult });
		const onApply = vi.fn();
		render(<JianyingFilterLab onApply={onApply} />);

		fireEvent.click(await screen.findByRole("tab", { name: "已缓存" }));
		const dualRow = screen.getByRole("button", { name: "应用 亮肤" });
		expect(screen.getAllByText("亮肤")).toHaveLength(1);
		expect(within(dualRow).getByText("双 LUT")).toBeInTheDocument();
		fireEvent.click(dualRow);
		await vi.waitFor(() => expect(api.load).toHaveBeenCalledTimes(2));
		expect(api.load).toHaveBeenCalledWith({
			lutId: "dual-1/dual-version/filter_bg.3dl.vf",
		});
		expect(api.load).toHaveBeenCalledWith({
			lutId: "dual-1/dual-version/filter_skin.3dl.vf",
		});
		await vi.waitFor(() =>
			expect(onApply).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "亮肤",
					cube: expect.any(Object),
					skinCube: expect.any(Object),
				})
			)
		);
	});

	it("explains uncached rows without trying to load them", async () => {
		const api = installFilterLabApi({ result: catalogResult });
		render(<JianyingFilterLab onApply={vi.fn()} />);

		fireEvent.click(await screen.findByRole("tab", { name: "全部目录" }));
		const uncachedRow = screen.getByRole("button", {
			name: "未缓存滤镜 汽水冰摇",
		});
		expect(uncachedRow.parentElement?.className).toContain("border-dashed");
		fireEvent.click(uncachedRow);
		expect(toast.info).toHaveBeenCalledWith(
			"「汽水冰摇」尚未下载，点击卡片右侧的下载按钮获取"
		);
		expect(api.load).not.toHaveBeenCalled();
	});

	it("tells the user to open Jianying when a filter cannot be downloaded", async () => {
		installFilterLabApi({
			result: {
				...catalogResult,
				filters: catalogResult.filters.map((filter) =>
					filter.cacheStatus === "uncached"
						? { ...filter, downloadable: false }
						: filter
				),
			},
		});
		render(<JianyingFilterLab onApply={vi.fn()} />);

		fireEvent.click(await screen.findByRole("tab", { name: "全部目录" }));
		fireEvent.click(
			screen.getByRole("button", { name: "未缓存滤镜 汽水冰摇" })
		);
		expect(toast.info).toHaveBeenCalledWith(
			"在剪映中使用一次「汽水冰摇」后，返回这里重新扫描"
		);
		expect(
			screen.queryByRole("button", { name: "下载 汽水冰摇" })
		).not.toBeInTheDocument();
	});

	it("downloads an uncached filter and refreshes the catalog", async () => {
		const api = installFilterLabApi({ result: catalogResult });
		render(<JianyingFilterLab onApply={vi.fn()} />);

		fireEvent.click(await screen.findByRole("tab", { name: "全部目录" }));
		fireEvent.click(screen.getByRole("button", { name: "下载 汽水冰摇" }));

		await waitFor(() =>
			expect(api.download).toHaveBeenCalledWith({ resourceId: "uncached-1" })
		);
		// A rescan is what turns the card from uncached into usable.
		await waitFor(() =>
			expect(api.list).toHaveBeenCalledWith({ refresh: true })
		);
	});

	it("loads the selected single LUT only when the grouped filter is available", async () => {
		const api = installFilterLabApi({ result: catalogResult });
		const onApply = vi.fn();
		render(<JianyingFilterLab onApply={onApply} />);

		fireEvent.click(
			await screen.findByRole("button", { name: "应用 蜜桃乌龙" })
		);
		expect(api.load).toHaveBeenCalledWith({
			lutId: "cached-1/0123456789abcdef/filter.cube.vf",
		});
		await vi.waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
		expect(onApply.mock.calls[0]?.[0]).toMatchObject({ name: "蜜桃乌龙" });
	});

	it("loads an identified shader through the multi-pass renderer", async () => {
		const api = installFilterLabApi({
			result: {
				count: 1,
				cachedCount: 1,
				availableCount: 1,
				filters: [shaderFood],
				categories: [{ name: "美食", total: 1, cached: 1, available: 1 }],
			},
		});
		const onApplyMultiPass = vi.fn();
		render(
			<JianyingFilterLab
				onApply={vi.fn()}
				onApplyMultiPass={onApplyMultiPass}
			/>
		);

		const row = await screen.findByRole("button", { name: "应用 清透美食" });
		expect(within(row).getByText("2 Pass")).toBeInTheDocument();
		fireEvent.click(row);

		await vi.waitFor(() =>
			expect(api.loadRenderer).toHaveBeenCalledWith({
				resourceId: "shader-food",
			})
		);
		expect(api.load).not.toHaveBeenCalled();
		expect(onApplyMultiPass).toHaveBeenCalledWith({
			settings: expect.objectContaining({
				name: "清透美食",
				passes: expect.arrayContaining([
					expect.objectContaining({ kind: "sharpen" }),
				]),
			}),
		});
	});

	it("favorites a grouped filter and exposes it in the favorites view", async () => {
		installFilterLabApi({ result: catalogResult });
		render(<JianyingFilterLab onApply={vi.fn()} />);

		fireEvent.click(
			await screen.findByRole("button", { name: "收藏 蜜桃乌龙" })
		);
		fireEvent.click(screen.getByRole("tab", { name: "收藏" }));

		expect(
			screen.getByRole("button", { name: "应用 蜜桃乌龙" })
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "应用 亮肤" })
		).not.toBeInTheDocument();
	});

	it("records successfully applied filters in recent order", async () => {
		installFilterLabApi({ result: catalogResult });
		render(<JianyingFilterLab onApply={vi.fn()} />);

		fireEvent.click(
			await screen.findByRole("button", { name: "应用 蜜桃乌龙" })
		);
		await vi.waitFor(() =>
			expect(
				window.localStorage.getItem("qcut-jianying-filter-recents-v1")
			).toBe(JSON.stringify(["cached-1"]))
		);
		fireEvent.click(screen.getByRole("tab", { name: "最近" }));

		expect(
			screen.getByRole("button", { name: "应用 蜜桃乌龙" })
		).toBeInTheDocument();
	});
});
