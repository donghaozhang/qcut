import { fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	JianyingFilterLabListResult,
	JianyingFilterLabLutSummary,
} from "@/types/electron";
import type { JianyingFilterLabKnownFilter } from "../use-jianying-filter-lab";
import { JianyingFilterLab } from "../jianying-filter-lab";

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

const cachedSummerLut: JianyingFilterLabLutSummary = {
	lutId: "cached-1/0123456789abcdef/filter.cube.vf",
	resourceId: "cached-1",
	version: "0123456789abcdef",
	fileName: "filter.cube.vf",
	role: "single",
	size: 2,
	title: "蜜桃乌龙",
	categories: ["夏日"],
};

const uncachedSummer: JianyingFilterLabKnownFilter = {
	resourceId: "uncached-1",
	title: "汽水冰摇",
	categories: ["夏日"],
};

const uncachedIndoor: JianyingFilterLabKnownFilter = {
	resourceId: "uncached-2",
	title: "冷白皮",
	categories: ["室内"],
};

const catalogResult: JianyingFilterLabListResult = {
	count: 1,
	luts: [cachedSummerLut],
	categoryOrder: ["夏日", "室内"],
	uncached: [uncachedSummer, uncachedIndoor],
};

function installFilterLabApi({
	result,
}: {
	result: JianyingFilterLabListResult;
}) {
	const list = vi.fn(async () => result);
	const load = vi.fn();
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: {
			...(window.electronAPI ?? {}),
			jianyingFilterLab: { list, load },
		},
	});
	return { list, load };
}

describe("JianyingFilterLab uncached placeholders", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders muted placeholder rows after cached LUTs inside a category", async () => {
		installFilterLabApi({ result: catalogResult });
		render(<JianyingFilterLab onApply={vi.fn()} />);

		fireEvent.click(await screen.findByRole("tab", { name: "夏日" }));

		const cachedRow = screen.getByRole("button", { name: "应用 蜜桃乌龙" });
		const placeholderRow = screen.getByRole("button", {
			name: "未缓存滤镜 汽水冰摇",
		});
		// Placeholder rows come after every cached row.
		expect(
			cachedRow.compareDocumentPosition(placeholderRow) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		// Visually muted, badged, never an <img> (no remote Jianying assets).
		expect(placeholderRow.className).toContain("border-dashed");
		expect(placeholderRow.className).toContain("opacity-60");
		expect(within(placeholderRow).getByText("未缓存")).toBeInTheDocument();
		expect(placeholderRow.querySelector("img")).toBeNull();
		// Other categories' uncached filters stay out of this view, but an
		// uncached-only category is still reachable from the rail.
		expect(screen.queryByText("冷白皮")).not.toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "室内" })).toBeInTheDocument();
	});

	it("shows a footer count instead of placeholders in the 全部 view", async () => {
		installFilterLabApi({ result: catalogResult });
		render(<JianyingFilterLab onApply={vi.fn()} />);

		await screen.findByText("蜜桃乌龙");
		expect(
			screen.getByText("另有 2 个剪映滤镜未缓存,按分类查看")
		).toBeInTheDocument();
		expect(
			screen.queryAllByTestId("jianying-filter-lab-placeholder")
		).toHaveLength(0);
	});

	it("surfaces at most 20 placeholder matches when searching in 全部", async () => {
		const bulk: JianyingFilterLabKnownFilter[] = Array.from(
			{ length: 25 },
			(_, index) => ({
				resourceId: `bulk-${index}`,
				title: `测试滤镜${index}`,
				categories: ["测试"],
			})
		);
		installFilterLabApi({
			result: { count: 0, luts: [], categoryOrder: ["测试"], uncached: bulk },
		});
		render(<JianyingFilterLab onApply={vi.fn()} />);

		await screen.findByText("0 个 LUT");
		fireEvent.change(screen.getByLabelText("搜索本机剪映 LUT"), {
			target: { value: "测试" },
		});

		expect(
			screen.getAllByTestId("jianying-filter-lab-placeholder")
		).toHaveLength(20);
	});

	it("explains via toast on placeholder click and never calls load", async () => {
		const api = installFilterLabApi({ result: catalogResult });
		render(<JianyingFilterLab onApply={vi.fn()} />);

		fireEvent.click(await screen.findByRole("tab", { name: "夏日" }));
		fireEvent.click(
			screen.getByRole("button", { name: "未缓存滤镜 汽水冰摇" })
		);

		expect(toast.info).toHaveBeenCalledWith(
			"在剪映中使用一次「汽水冰摇」后,这里即可加载"
		);
		expect(api.load).not.toHaveBeenCalled();
	});
});
