import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IndependentLutLibrary } from "../independent-lut-library";

vi.mock("../use-jianying-filter-thumbnail", () => ({
	useJianyingFilterThumbnail: () => ({
		containerRef: null,
		state: "unavailable",
	}),
}));
const cards = Array.from({ length: 40 }, (_, index) => ({
	resourceId: String(index + 1),
	version: "a".repeat(32),
	title: `Local ${index + 1}`,
	categories: [index % 2 ? "黑白" : "风景"],
}));
const list = vi.fn(async () => ({ count: 40, cards }));
const settings = {
	name: "Local 1 · QCut Metal",
	nativeEffect: { provider: "qcut-metal-lut-v1" },
};
const load = vi.fn(async () => settings);
beforeEach(() => {
	vi.clearAllMocks();
	list.mockResolvedValue({ count: 40, cards });
	load.mockResolvedValue(settings);
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: { qcutIndependentFilter: { list, load } },
	});
});
describe("independent local LUT library", () => {
	it("paginates the catalog and filters by title, ID and category", async () => {
		render(
			<IndependentLutLibrary onApply={vi.fn()} onApplyMultiPass={vi.fn()} />
		);
		await screen.findByText("本地 LUT · 40");
		expect(
			screen.queryByRole("button", { name: "应用 Local 40 QCut Metal" })
		).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "下一页 LUT" }));
		expect(
			screen.getByRole("button", { name: "应用 Local 40 QCut Metal" })
		).toBeVisible();
		fireEvent.change(screen.getByRole("searchbox"), {
			target: { value: "40" },
		});
		expect(screen.getByRole("button", { name: "上一页 LUT" })).toBeDisabled();
		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: "风景" },
		});
		expect(screen.getByText("暂无匹配滤镜")).toBeVisible();
	});
	it("loads the exact card version and applies the independent descriptor", async () => {
		const apply = vi.fn();
		render(
			<IndependentLutLibrary onApply={vi.fn()} onApplyMultiPass={apply} />
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "应用 Local 1 QCut Metal" })
		);
		await waitFor(() =>
			expect(apply).toHaveBeenCalledWith({ settings, layerName: settings.name })
		);
		expect(load).toHaveBeenCalledWith({
			resourceId: "1",
			version: "a".repeat(32),
		});
	});
	it("reports a load failure without applying a substitute", async () => {
		load.mockRejectedValueOnce(new Error("Local cube removed"));
		const apply = vi.fn();
		render(
			<IndependentLutLibrary onApply={vi.fn()} onApplyMultiPass={apply} />
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "应用 Local 1 QCut Metal" })
		);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Local cube removed"
		);
		expect(apply).not.toHaveBeenCalled();
	});
	it("refreshes a failed catalog scan", async () => {
		list.mockRejectedValueOnce(new Error("Scan failed"));
		render(<IndependentLutLibrary onApply={vi.fn()} />);
		await screen.findByRole("alert");
		fireEvent.click(screen.getByRole("button", { name: "刷新本地 LUT" }));
		await screen.findByText("本地 LUT · 40");
		expect(list).toHaveBeenLastCalledWith({ refresh: true });
	});
});
