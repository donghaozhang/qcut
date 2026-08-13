import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	JianyingTextStyleLabListResult,
	JianyingTextStyleLabStyleSummary,
} from "@/types/electron";
import { JianyingTextStyleLabDialog } from "../jianying-text-style-lab";

function createStyle({
	categoryIds = ["popular" as const],
	index,
	previewOnly = false,
}: {
	categoryIds?: JianyingTextStyleLabStyleSummary["categoryIds"];
	index: number;
	previewOnly?: boolean;
}): JianyingTextStyleLabStyleSummary {
	const resourceId = (7405879107424111900n + BigInt(index)).toString();
	return {
		styleId: `${resourceId}/${index.toString(16).padStart(32, "0")}`,
		resourceId,
		version: index.toString(16).padStart(32, "0"),
		title: `测试花字 ${index}`,
		categoryIds,
		packageKind: previewOnly ? "InfoSticker" : "TextStyle",
		packageVersion: "3.0",
		fillKind: previewOnly ? "texture" : "solid",
		strokeCount: 1,
		innerShadowCount: 0,
		shadowCount: 1,
		textureLayerCount: previewOnly ? 1 : 0,
		capabilities: {
			staticTexture: previewOnly,
			multipleStrokes: false,
			animationComponents: previewOnly,
			scriptInfoSticker: false,
			shaderComponents: false,
			threeDimensional: false,
			feedbackComponents: false,
		},
		diagnostics: [],
		hasCover: true,
		compatibility: previewOnly ? "preview-only" : "approximated",
		...(previewOnly
			? {}
			: {
					approximation: {
						version: 1 as const,
						color: "#ffcc00",
						strokeColor: "#111111",
						strokeWidth: 3,
						strokeOpacity: 1,
						shadowColor: "#333333",
						shadowOpacity: 0.8,
						shadowOffsetX: 4,
						shadowOffsetY: 4,
						shadowBlur: 0,
						glowColor: "#ffffff",
						glowOpacity: 0,
						glowBlur: 12,
					},
				}),
	};
}

function createResult(): JianyingTextStyleLabListResult {
	return {
		count: 8,
		styles: [
			...Array.from({ length: 7 }, (_, index) =>
				createStyle({ index: index + 1 })
			),
			createStyle({
				categoryIds: ["purple"],
				index: 8,
				previewOnly: true,
			}),
		],
		categories: [
			{ id: "popular", label: "热门", count: 7 },
			{ id: "purple", label: "紫色", count: 1 },
		],
		packageCount: 224,
		invalidPackageCount: 0,
	};
}

function createRuntimeStyle(): JianyingTextStyleLabStyleSummary {
	const resourceId = "7328639616670649634";
	const version = "22192237621ba88a20b84176ddb9d22a";
	return {
		styleId: `${resourceId}/${version}`,
		resourceId,
		version,
		title: "动态脚本花字",
		categoryIds: ["popular"],
		packageKind: "ScriptInfoSticker",
		packageVersion: "3.0",
		fillKind: "unknown",
		strokeCount: 0,
		innerShadowCount: 0,
		shadowCount: 0,
		textureLayerCount: 0,
		capabilities: {
			staticTexture: true,
			multipleStrokes: true,
			animationComponents: true,
			scriptInfoSticker: true,
			shaderComponents: true,
			threeDimensional: true,
			feedbackComponents: true,
		},
		diagnostics: [],
		hasCover: true,
		compatibility: "native-runtime",
		runtimeReference: {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "ScriptInfoSticker",
			resourceId,
			packageHash: version,
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
			templateDuration: 3,
		},
	};
}

function installTextStyleLabAPI() {
	const result = createResult();
	const list = vi.fn(async () => result);
	const cover = vi.fn(async ({ styleId }: { styleId: string }) => ({
		styleId,
		mimeType: "image/png" as const,
		bytes: new Uint8Array([1, 2, 3]),
	}));
	window.electronAPI = {
		jianyingTextStyleLab: { list, cover },
	} as never;
	return { cover, list, result };
}

describe("JianyingTextStyleLabDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		window.electronAPI = undefined;
		vi.stubGlobal("URL", {
			...URL,
			createObjectURL: vi.fn(() => "blob:qcut-cover"),
			revokeObjectURL: vi.fn(),
		});
	});

	it("opens with five mapped styles and applies a card immediately", async () => {
		const api = installTextStyleLabAPI();
		const onApply = vi.fn();
		render(<JianyingTextStyleLabDialog onApply={onApply} />);

		fireEvent.click(screen.getByRole("button", { name: "花字实验室" }));
		await waitFor(() =>
			expect(api.list).toHaveBeenCalledWith({ refresh: false })
		);
		const cards = await screen.findAllByTestId("jianying-text-style-lab-card");
		expect(cards).toHaveLength(5);
		await waitFor(() => expect(api.cover).toHaveBeenCalledTimes(5));

		fireEvent.click(cards[0]);
		expect(onApply).toHaveBeenCalledWith({ style: api.result.styles[0] });
		expect(cards[0]).toHaveAttribute("aria-pressed", "true");

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		fireEvent.click(screen.getByRole("button", { name: "花字实验室" }));
		expect(
			(await screen.findAllByTestId("jianying-text-style-lab-card"))[0]
		).toHaveAttribute("aria-pressed", "false");
	});

	it("keeps every cached flower package visible in the complete view", async () => {
		installTextStyleLabAPI();
		render(<JianyingTextStyleLabDialog onApply={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "花字实验室" }));
		expect(
			await screen.findAllByTestId("jianying-text-style-lab-card")
		).toHaveLength(5);

		fireEvent.click(screen.getByRole("button", { name: "全部 8" }));
		await waitFor(() =>
			expect(
				screen.getAllByTestId("jianying-text-style-lab-card")
			).toHaveLength(8)
		);
		expect(
			screen.getByRole("button", { name: /测试花字 8 仅供预览/ })
		).toBeDisabled();
	});

	it("applies a native ScriptInfoSticker card to the timeline", async () => {
		const runtimeStyle = createRuntimeStyle();
		const list = vi.fn(
			async (): Promise<JianyingTextStyleLabListResult> => ({
				count: 1,
				styles: [runtimeStyle],
				categories: [{ id: "popular", label: "热门", count: 1 }],
				packageCount: 1,
				invalidPackageCount: 0,
			})
		);
		window.electronAPI = {
			jianyingTextStyleLab: {
				list,
				cover: vi.fn(async ({ styleId }: { styleId: string }) => ({
					styleId,
					mimeType: "image/png" as const,
					bytes: new Uint8Array([1, 2, 3]),
				})),
			},
		} as never;
		const onApply = vi.fn();
		render(<JianyingTextStyleLabDialog onApply={onApply} />);

		fireEvent.click(screen.getByRole("button", { name: "花字实验室" }));
		fireEvent.click(await screen.findByRole("button", { name: "全部 1" }));
		const card = await screen.findByRole("button", {
			name: "应用花字 动态脚本花字",
		});
		fireEvent.click(card);

		expect(onApply).toHaveBeenCalledWith({ style: runtimeStyle });
		expect(card).toHaveAttribute("aria-pressed", "true");
	});

	it("filters the local cache by Jianying flower category", async () => {
		installTextStyleLabAPI();
		render(<JianyingTextStyleLabDialog onApply={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "花字实验室" }));

		fireEvent.click(
			await screen.findByRole("button", {
				name: "热门，7 个本地花字",
			})
		);
		expect(screen.getAllByTestId("jianying-text-style-lab-card")).toHaveLength(
			7
		);

		fireEvent.click(screen.getByRole("button", { name: "紫色，1 个本地花字" }));
		expect(screen.getAllByTestId("jianying-text-style-lab-card")).toHaveLength(
			1
		);
		expect(
			screen.getByRole("button", { name: /测试花字 8 仅供预览/ })
		).toBeDisabled();
	});

	it("reports when the desktop cache API is unavailable", async () => {
		render(<JianyingTextStyleLabDialog onApply={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: "花字实验室" }));
		expect(
			await screen.findByText("花字实验室仅在 QCut 桌面版中可用")
		).toBeInTheDocument();
	});
});
