import { afterEach, describe, expect, it, vi } from "vitest";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { CoverPrivateLibrary } from "./cover-private-library";
import { loadPrivateCoverLibrary } from "@/lib/cover/private-cover-library";
import type { CoverLibraryResult } from "../../../../../../electron/jianying-cover-contract";

vi.mock("@/lib/i18n", () => ({ useTranslation: () => ({ locale: "zh" }) }));
vi.mock("@/lib/cover/private-cover-library", () => ({
	loadPrivateCoverLibrary: vi.fn(),
}));
const file = {
	path: `objects/${"a".repeat(64)}`,
	sha256: "a".repeat(64),
	bytes: 10,
	logicalPath: "template.json",
};
const entry: CoverLibraryResult["entries"][number] = {
	packageHash: "a".repeat(32),
	previewHash: "b".repeat(32),
	title: "Food fixture",
	categories: ["food", "recommended"],
	evidence: "native-ui-and-template-content",
	definition: file,
	preview: file,
	dependencies: [{ reference: "filter/missing", files: [], status: "missing" }],
	textCount: 3,
	cacheStatus: "missing-dependencies",
	renderStatus: "native-renderer-required",
	previewDataUrl: "data:image/webp;base64,UklGRg==",
};
const catalog: CoverLibraryResult = {
	entries: [entry],
	capturedAt: "2026-09-06",
	coverage: "observed-downloaded-subset",
};

afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});

describe("private cover library", () => {
	it("shows the eight native categories, actual previews and dependency status", async () => {
		vi.mocked(loadPrivateCoverLibrary).mockResolvedValue(catalog);
		render(<CoverPrivateLibrary onClear={vi.fn()} disabled={false} />);
		const nav = screen.getByRole("navigation", { name: "剪映封面分类" });
		expect(
			within(nav)
				.getAllByRole("button")
				.map((button) => button.textContent)
		).toEqual(["默认", "推荐", "生活", "游戏", "知识", "时尚", "影视", "美食"]);
		const card = await screen.findByTestId(`cover-cached-${entry.packageHash}`);
		expect(card.querySelector("img")?.getAttribute("src")).toBe(
			entry.previewDataUrl
		);
		expect(card.textContent).toContain("依赖不完整");
	});
	it("preserves multi-category membership without showing a card in unrelated categories", async () => {
		vi.mocked(loadPrivateCoverLibrary).mockResolvedValue(catalog);
		render(<CoverPrivateLibrary onClear={vi.fn()} disabled={false} />);
		await screen.findByText("Food fixture");
		fireEvent.click(screen.getByRole("button", { name: "生活" }));
		expect(screen.queryByText("Food fixture")).toBeNull();
		expect(screen.getByText("此分类尚无已缓存模板")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "推荐" }));
		expect(screen.getByText("Food fixture")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "美食" }));
		expect(screen.getByText("Food fixture")).toBeDefined();
	});
	it("opens cache details without applying an unsupported template", async () => {
		vi.mocked(loadPrivateCoverLibrary).mockResolvedValue(catalog);
		const onClear = vi.fn();
		render(<CoverPrivateLibrary onClear={onClear} disabled={false} />);
		fireEvent.click(await screen.findByText("Food fixture"));
		expect(screen.getByText("原生渲染尚未接入")).toBeDefined();
		expect(onClear).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "无模板" }));
		expect(onClear).toHaveBeenCalledOnce();
	});
	it("shows lab provenance, mapped versions and unresolved catalog IDs", async () => {
		vi.mocked(loadPrivateCoverLibrary).mockResolvedValue({
			...catalog,
			entries: [
				{
					...entry,
					dependencies: [
						{
							reference: "textEffect/old",
							status: "cached",
							files: [file],
							resolution: {
								method: "catalog-version",
								source: "text-lab",
								label: "Recovered word art",
								packageHash: "c".repeat(32),
							},
						},
						{
							reference: "filter/old",
							status: "missing",
							files: [],
							reason: "catalog-missing",
						},
					],
				},
			],
		});
		render(<CoverPrivateLibrary onClear={vi.fn()} disabled={false} />);
		fireEvent.click(await screen.findByText("Food fixture"));
		expect(screen.getByText(/Recovered word art/)).toBeDefined();
		expect(screen.getByText(/已映射当前版本/)).toBeDefined();
		expect(screen.getByText("资源目录未找到此 ID")).toBeDefined();
		expect(screen.getByText("原生渲染尚未接入")).toBeDefined();
	});
	it("shows integrity failures and refreshes after recovery", async () => {
		vi.mocked(loadPrivateCoverLibrary)
			.mockRejectedValueOnce(new Error("checksum"))
			.mockResolvedValueOnce(catalog);
		render(<CoverPrivateLibrary onClear={vi.fn()} disabled={false} />);
		expect((await screen.findByRole("alert")).textContent).toBe(
			"缓存读取或校验失败"
		);
		fireEvent.click(screen.getByRole("button", { name: "刷新缓存" }));
		await screen.findByText("Food fixture");
		expect(screen.queryByRole("alert")).toBeNull();
	});
	it("does not allow a stale read to replace a refreshed catalog", async () => {
		let resolveOld: (value: CoverLibraryResult) => void = () => {};
		vi.mocked(loadPrivateCoverLibrary)
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveOld = resolve;
					})
			)
			.mockResolvedValueOnce(catalog);
		render(<CoverPrivateLibrary onClear={vi.fn()} disabled={true} />);
		fireEvent.click(screen.getByRole("button", { name: "刷新缓存" }));
		await screen.findByText("Food fixture");
		resolveOld({ ...catalog, entries: [] });
		await waitFor(() => expect(screen.getByText("Food fixture")).toBeDefined());
		expect(
			screen.getByRole("button", { name: "无模板" }).hasAttribute("disabled")
		).toBe(true);
	});
});
