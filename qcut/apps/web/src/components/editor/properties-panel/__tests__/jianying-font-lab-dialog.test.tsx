import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	JianyingFontLabFontSummary,
	JianyingFontLabListResult,
} from "@/types/electron";

const runtimeMocks = vi.hoisted(() => ({
	ensureLocalFontLoaded: vi.fn(async () => ({})),
	loadTransientLocalFontFace: vi.fn(async () => ({
		face: {},
		release: vi.fn(() => true),
	})),
}));

vi.mock("@/lib/fonts/local-font-runtime", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/fonts/local-font-runtime")>();
	return { ...actual, ...runtimeMocks };
});

import { JianyingFontLabDialog } from "../jianying-font-lab-dialog";

function createFont({ index }: { index: number }): JianyingFontLabFontSummary {
	const hash = index.toString(16).padStart(64, "0");
	return {
		fontId: `sha256:${hash}`,
		cssFamily: `QCutLocal_${hash.slice(0, 20)}`,
		familyName: `测试字体 ${index}`,
		fullName: `测试字体 ${index} Regular`,
		postscriptName: `Test-Font-${index}`,
		subfamilyName: "Regular",
		format: index % 2 === 0 ? "otf" : "ttf",
		size: 1024 * index,
		sourceKinds: index % 2 === 0 ? ["ai-text-template"] : ["effect"],
	};
}

function createListResult(): JianyingFontLabListResult {
	return {
		count: 13,
		fonts: Array.from({ length: 13 }, (_, index) =>
			createFont({ index: index + 1 })
		),
		rootCount: 4,
		fileCount: 15,
		duplicateFileCount: 2,
		invalidFileCount: 0,
		oversizedFileCount: 0,
	};
}

function installFontLabAPI({ covered }: { covered: boolean }) {
	const result = createListResult();
	const list = vi.fn(async () => result);
	const inspect = vi.fn(async ({ fontId }: { fontId: string }) => ({
		fontId,
		covered,
		checkedCodePointCount: 4,
		missing: covered
			? []
			: [{ character: "字", codePoint: 0x5b57, unicode: "U+5B57" }],
	}));
	window.electronAPI = {
		jianyingFontLab: {
			list,
			inspect,
			load: vi.fn(),
		},
	} as never;
	return { inspect, list, result };
}

describe("JianyingFontLabDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("IntersectionObserver", undefined);
		window.electronAPI = undefined;
	});

	it("opens as a five-font picker and applies a covered font immediately", async () => {
		const api = installFontLabAPI({ covered: true });
		const onApply = vi.fn();
		render(
			<JianyingFontLabDialog initialSample="字体实验室" onApply={onApply} />
		);
		fireEvent.click(screen.getByLabelText("打开本机字体实验室"));

		await waitFor(() =>
			expect(api.list).toHaveBeenCalledWith({ refresh: false })
		);
		const rows = await screen.findAllByTestId("jianying-font-card");
		expect(rows).toHaveLength(5);
		expect(screen.queryByRole("button", { name: "应用到文字" })).toBeNull();
		expect(runtimeMocks.loadTransientLocalFontFace).toHaveBeenCalledTimes(5);

		fireEvent.click(rows[0]);

		await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
		expect(api.inspect).toHaveBeenCalledWith({
			fontId: api.result.fonts[0].fontId,
			text: "字体实验室",
		});
		expect(onApply).toHaveBeenCalledWith({
			asset: expect.objectContaining({
				kind: "local-font",
				source: "jianying-cache",
				assetId: api.result.fonts[0].fontId,
				cssFamily: api.result.fonts[0].cssFamily,
			}),
		});
		expect(screen.getByTestId("jianying-font-picker-popover")).toBeVisible();
		expect(rows[0]).toHaveAttribute("aria-pressed", "true");
	});

	it("keeps the complete cache inventory available from the all-fonts view", async () => {
		installFontLabAPI({ covered: true });
		render(<JianyingFontLabDialog initialSample="字体" onApply={vi.fn()} />);
		fireEvent.click(screen.getByLabelText("打开本机字体实验室"));

		expect(await screen.findAllByTestId("jianying-font-card")).toHaveLength(5);
		fireEvent.click(screen.getByRole("button", { name: "全部" }));

		await waitFor(() =>
			expect(screen.getAllByTestId("jianying-font-card")).toHaveLength(13)
		);
	});

	it("blocks immediate application when the font is missing a required glyph", async () => {
		installFontLabAPI({ covered: false });
		const onApply = vi.fn();
		render(<JianyingFontLabDialog initialSample="缺字" onApply={onApply} />);
		fireEvent.click(screen.getByLabelText("打开本机字体实验室"));
		const rows = await screen.findAllByTestId("jianying-font-card");

		fireEvent.click(rows[0]);

		expect(await screen.findByText(/U\+5B57/)).toBeInTheDocument();
		expect(onApply).not.toHaveBeenCalled();
		expect(runtimeMocks.ensureLocalFontLoaded).not.toHaveBeenCalled();
	});
});
