import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoverText } from "@qcut/editor-core/cover";
import type { JianyingTextStyleLabListResult } from "@/types/electron";
import { useJianyingTextStyleLab } from "../media-panel/views/text-style-lab/use-jianying-text-style-lab";
import { CoverTextStyleLibrary } from "./cover-text-style-library";

vi.mock("@/lib/i18n", () => ({ useTranslation: () => ({ locale: "zh" }) }));
vi.mock(
	"../media-panel/views/text-style-lab/use-jianying-text-style-lab",
	() => ({ useJianyingTextStyleLab: vi.fn() })
);
const canvas = { width: 1920, height: 1080, backgroundColor: "#000000" };
const layer = createCoverText({
	canvas,
	content: "Manual title",
	id: "manual",
});
const result = {
	count: 2,
	categories: [{ id: "glow", label: "光效", count: 1 }],
	categoryGroups: [],
	packageCount: 2,
	invalidPackageCount: 0,
	styles: [
		{
			styleId: "cached",
			resourceId: "123",
			title: "Local glow",
			compatibility: "native-runtime",
			categoryIds: ["glow"],
			approximation: {
				version: 1,
				color: "#ffffff",
				strokeColor: "#000000",
				strokeWidth: 0,
				strokeOpacity: 0,
				shadowColor: "#000000",
				shadowOpacity: 0,
				shadowOffsetX: 0,
				shadowOffsetY: 0,
				shadowBlur: 0,
				glowColor: "#00ffaa",
				glowOpacity: 0.8,
				glowBlur: 12,
			},
		},
		{
			styleId: "unsupported",
			resourceId: "456",
			title: "Native only",
			categoryIds: [],
		},
	],
} as unknown as JianyingTextStyleLabListResult;
beforeEach(() => {
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
	vi.mocked(useJianyingTextStyleLab).mockReturnValue({
		checking: false,
		error: "",
		result,
		refresh: vi.fn(),
	});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("cover text style library", () => {
	it("reuses the existing thirteen presets and targets the current selection", () => {
		const onChange = vi.fn();
		const view = render(
			<CoverTextStyleLibrary
				layer={layer}
				canvas={canvas}
				disabled={false}
				onChange={onChange}
				onError={vi.fn()}
			/>
		);
		expect(screen.getAllByTestId(/^cover-preset-/)).toHaveLength(13);
		fireEvent.click(screen.getByTestId("cover-preset-highlight"));
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({
				background: true,
				textStyle: expect.objectContaining({ backgroundColor: "#ffe600" }),
			})
		);
		view.rerender(
			<CoverTextStyleLibrary
				layer={{ ...layer, id: "two", fontSize: 120 }}
				canvas={canvas}
				disabled={false}
				onChange={onChange}
				onError={vi.fn()}
			/>
		);
		fireEvent.click(screen.getByTestId("cover-preset-clean-white"));
		expect(onChange.mock.lastCall?.[0]).not.toHaveProperty("id");
		expect(onChange.mock.lastCall?.[0]).not.toHaveProperty("fontSize");
	});
	it("reads existing lab data and excludes packages without an applicable reference", () => {
		const onChange = vi.fn();
		render(
			<CoverTextStyleLibrary
				layer={layer}
				canvas={canvas}
				disabled={false}
				onChange={onChange}
				onError={vi.fn()}
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: "花字实验室" }));
		expect(useJianyingTextStyleLab).toHaveBeenLastCalledWith({ enabled: true });
		expect(screen.getByText("1 / 2 可应用花字")).toBeDefined();
		expect(screen.queryByText("Native only")).toBeNull();
		fireEvent.click(
			screen.getByRole("button", { name: "静态近似 · Local glow" })
		);
		expect(onChange.mock.lastCall?.[0].textStyle).toMatchObject({
			glowEnabled: true,
			glowColor: "#00ffaa",
		});
		fireEvent.change(screen.getByRole("searchbox"), {
			target: { value: "no match" },
		});
		expect(screen.queryByTestId("cover-word-art-cached")).toBeNull();
	});
	it("applies native-only InfoSticker packages without flattening the lab reference", () => {
		const reference = {
			schemaVersion: 1 as const,
			source: "jianying-cache" as const,
			packageKind: "InfoSticker" as const,
			resourceId: "456",
			packageHash: "a".repeat(32),
			editMode: "runtime-with-preload-fallback" as const,
			slotMapping: "line-to-widget" as const,
			timeMapping: "stretch" as const,
			templateDuration: 3,
		};
		vi.mocked(useJianyingTextStyleLab).mockReturnValue({
			checking: false,
			error: "",
			refresh: vi.fn(),
			result: {
				...result,
				styles: [{ ...result.styles[1], runtimeReference: reference }],
			},
		});
		const onChange = vi.fn();
		render(
			<CoverTextStyleLibrary
				layer={layer}
				canvas={canvas}
				disabled={false}
				onChange={onChange}
				onError={vi.fn()}
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: "花字实验室" }));
		fireEvent.click(screen.getByTestId("cover-word-art-unsupported"));
		expect(onChange).toHaveBeenCalledWith(
			expect.objectContaining({
				jianyingTextStyle: reference,
				nativeFrameTime: 1,
			})
		);
		expect(onChange.mock.lastCall?.[0]).not.toHaveProperty("content");
	});
	it("never applies without a selected layer", () => {
		const onChange = vi.fn();
		render(
			<CoverTextStyleLibrary
				canvas={canvas}
				disabled={false}
				onChange={onChange}
				onError={vi.fn()}
			/>
		);
		fireEvent.click(screen.getByTestId("cover-preset-highlight"));
		expect(onChange).not.toHaveBeenCalled();
		expect(screen.getByText("未选中文字")).toBeDefined();
	});
	it("reports unavailable desktop lab without substituting fake cards", () => {
		vi.mocked(useJianyingTextStyleLab).mockReturnValue({
			checking: false,
			error: "花字实验室仅在 QCut 桌面版中可用",
			result: { ...result, styles: [], count: 0 },
			refresh: vi.fn(),
		});
		render(
			<CoverTextStyleLibrary
				layer={layer}
				canvas={canvas}
				disabled={false}
				onChange={vi.fn()}
				onError={vi.fn()}
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: "花字实验室" }));
		expect(screen.getByRole("status").textContent).toContain("桌面版");
		expect(screen.queryAllByTestId(/^cover-preset-/)).toHaveLength(0);
	});
});
