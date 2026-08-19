import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	STICKER_CATEGORIES,
	STICKER_CATEGORY_MINIMUM_SIZE,
} from "@/lib/stickers/sticker-catalog";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useStickerPackStore } from "@/stores/sticker-pack-store";
import { useStickersStore } from "@/stores/stickers-store";
import { StickersView } from "../stickers-view";

const localCatalogMock = vi.hoisted(() => ({
	current: {
		catalog: {
			version: 1 as const,
			categories: [
				{
					id: "popular",
					label: "热门",
					sourcePanel: "贴纸库 / 热门",
					items: Array.from({ length: 4 }, (_, index) => ({
						id: `reference-${index + 1}`,
						displayName: index === 0 ? "手绘弯箭头" : `参考贴纸 ${index + 1}`,
						fileName: `reference-${index + 1}.png`,
						filePath: `/tmp/reference-${index + 1}.png`,
						mimeType: "image/png" as const,
						sourceKind: "atlas-animation" as const,
						playback: {
							kind: "animated" as const,
							frameCount: 4,
							frameRate: 5,
							cycleDuration: 0.8,
							loop: true,
						},
					})),
				},
			],
		},
		error: null as string | null,
		isAvailable: true,
		isLoading: false,
		privateCatalogs: [
			{
				categories: [
					{
						id: "trending",
						label: "热门",
						sourcePanel: "剪映贴纸面板",
						items: [
							{
								id: "private-1",
								displayName: "参照贴纸 甲",
								fileName: "private-1.png",
								filePath: "/tmp/private-1.png",
								mimeType: "image/png" as const,
								sourceKind: "atlas-animation" as const,
								playback: {
									kind: "animated" as const,
									frameCount: 4,
									frameRate: 5,
									cycleDuration: 0.8,
									loop: true,
								},
							},
						],
					},
				],
			},
		],
	},
}));
const stickerSelectMocks = vi.hoisted(() => ({
	download: vi.fn(),
	select: vi.fn(),
	upload: vi.fn(),
}));

vi.mock("../hooks/use-local-sticker-catalog", () => ({
	useLocalStickerCatalog: () => localCatalogMock.current,
}));

vi.mock("../hooks/use-sticker-select", () => ({
	useStickerSelect: () => ({
		handleStickerDownload: stickerSelectMocks.download,
		handleStickerSelect: stickerSelectMocks.select,
		handleStickerUpload: stickerSelectMocks.upload,
	}),
}));

vi.mock("@/lib/stickers/local-sticker-reference", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/lib/stickers/local-sticker-reference")
		>();
	return {
		...actual,
		loadStickerLabReferenceFile: async ({
			reference,
		}: {
			reference: { fileName: string };
		}) =>
			new File([new Uint8Array([137, 80, 78, 71])], reference.fileName, {
				type: "image/png",
			}),
	};
});

describe("StickersView", () => {
	beforeEach(() => {
		localCatalogMock.current.isAvailable = true;
		localCatalogMock.current.isLoading = false;
		localCatalogMock.current.error = null;
		stickerSelectMocks.download.mockReset();
		stickerSelectMocks.select.mockReset();
		stickerSelectMocks.upload.mockReset();
		stickerSelectMocks.upload.mockResolvedValue("local-media-id");
		useAssetLibraryStore.getState().resetLibrary();
		useStickerPackStore.getState().resetPacks();
		useStickersStore.setState({
			searchResults: [],
			recentStickers: [],
			error: null,
			isLoading: false,
		});
	});

	it("opens the creator catalog on the popular category", () => {
		render(<StickersView />);

		expect(screen.getByTestId("sticker-category-popular")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		expect(
			screen.getByText(`${STICKER_CATEGORY_MINIMUM_SIZE} 个贴纸`)
		).toBeInTheDocument();
		expect(
			within(screen.getByTestId("sticker-category-grid")).getAllByTestId(
				"sticker-item"
			)
		).toHaveLength(STICKER_CATEGORY_MINIMUM_SIZE);
		expect(
			screen.getAllByRole("img", { name: "热门·爆款推荐" }).length
		).toBeGreaterThan(0);
	});

	it("uses one collapsible sticker library hierarchy", () => {
		render(<StickersView />);

		const sidebar = screen.getByTestId("sticker-sidebar");
		const libraryButton = within(sidebar).getByRole("button", {
			name: "贴纸库",
		});
		expect(libraryButton).toHaveAttribute("aria-expanded", "true");
		expect(
			within(sidebar).getAllByRole("button", { name: "贴纸库" })
		).toHaveLength(1);

		fireEvent.click(libraryButton);
		expect(libraryButton).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByTestId("sticker-category-popular")).toBeNull();

		fireEvent.click(libraryButton);
		expect(screen.getByTestId("sticker-category-popular")).toBeInTheDocument();
	});

	// Iterates every creator category; slow Windows CI runners exceed the 5s default.
	it(
		"renders at least five stickers in every creator category",
		{ timeout: 20_000 },
		() => {
			render(<StickersView />);

			for (const category of STICKER_CATEGORIES) {
				fireEvent.click(screen.getByTestId(`sticker-category-${category.id}`));
				const items = within(
					screen.getByTestId("sticker-category-grid")
				).getAllByTestId("sticker-item");
				expect(items.length, category.id).toBeGreaterThanOrEqual(
					STICKER_CATEGORY_MINIMUM_SIZE
				);
				expect(
					screen.getByTestId(`sticker-category-${category.id}`)
				).toHaveAttribute("aria-pressed", "true");
			}
		}
	);

	it("searches curated stickers in Chinese", () => {
		render(<StickersView />);

		fireEvent.change(
			screen.getByRole("textbox", {
				name: "搜索贴纸 / Search stickers",
			}),
			{ target: { value: "奶茶" } }
		);

		const results = screen.getAllByTestId("sticker-item");
		expect(results).toHaveLength(STICKER_CATEGORY_MINIMUM_SIZE);
		expect(
			screen.getByRole("img", { name: "奶茶鼠·开心" })
		).toBeInTheDocument();
		expect(
			screen.getByRole("img", { name: "奶茶鼠·自拍" })
		).toBeInTheDocument();
	});

	it("switches between the library, store, AI, recent, favorites, and sticker lab", () => {
		render(<StickersView />);

		fireEvent.click(screen.getByRole("button", { name: "商店" }));
		expect(screen.getByTestId("sticker-storefront")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "最近" }));
		expect(screen.getByText("No recent stickers yet")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "收藏" }));
		expect(screen.getByText("No favorite stickers")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "AI生成" }));
		expect(screen.getByTestId("ai-sticker-generator")).toBeInTheDocument();

		const sidebar = screen.getByTestId("sticker-sidebar");
		fireEvent.click(within(sidebar).getByRole("button", { name: "QCut 原创" }));
		expect(
			screen.getByTestId("local-sticker-reference-panel")
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "添加手绘弯箭头到时间线" })
		).toBeInTheDocument();
		expect(
			screen.getByTestId("sticker-lab-category-public-popular")
		).toHaveAttribute("aria-pressed", "true");

		// The reference slice is its own sidebar section named 贴纸实验室.
		fireEvent.click(
			within(sidebar).getByRole("button", { name: "贴纸实验室" })
		);
		expect(
			screen.getByTestId("sticker-lab-category-private-trending")
		).toHaveAttribute("aria-pressed", "true");

		fireEvent.click(screen.getByTestId("sticker-category-interaction"));
		expect(screen.getByTestId("sticker-category-grid")).toBeInTheDocument();
		expect(screen.queryByTestId("local-sticker-reference-panel")).toBeNull();
	});

	it("folds the QCut 原创 and 贴纸实验室 sections independently", () => {
		render(<StickersView />);
		const sidebar = screen.getByTestId("sticker-sidebar");
		const labHeader = within(sidebar).getByRole("button", {
			name: "贴纸实验室",
		});

		// First click enters the lab on the reference slice…
		fireEvent.click(labHeader);
		expect(
			screen.getByTestId("sticker-lab-category-private-trending")
		).toHaveAttribute("aria-pressed", "true");

		// …and the second click only folds the section.
		fireEvent.click(labHeader);
		expect(labHeader).toHaveAttribute("aria-expanded", "false");
		expect(
			screen.queryByTestId("sticker-lab-category-private-trending")
		).toBeNull();
		expect(
			screen.getByTestId("sticker-lab-category-public-popular")
		).toBeInTheDocument();

		fireEvent.click(labHeader);
		expect(labHeader).toHaveAttribute("aria-expanded", "true");
		expect(
			screen.getByTestId("sticker-lab-category-private-trending")
		).toBeInTheDocument();
	});

	it("opens the shape library from the sidebar entry below the lab", () => {
		render(<StickersView />);

		const sidebar = screen.getByTestId("sticker-sidebar");
		const labEntry = screen.getByTestId("sticker-reference-lab-entry");
		const shapesEntry = screen.getByTestId("sticker-shapes-entry");
		// 图形库 sits below the sticker lab section, Jianying-style.
		expect(
			labEntry.compareDocumentPosition(shapesEntry) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();

		fireEvent.click(within(sidebar).getByRole("button", { name: "图形库" }));
		expect(screen.getByTestId("sticker-shape-library")).toBeInTheDocument();
		expect(
			screen.getAllByTestId("sticker-shape-item").length
		).toBeGreaterThanOrEqual(7);
	});

	it("keeps the shape library available without a sticker lab catalog", () => {
		localCatalogMock.current.isAvailable = false;
		render(<StickersView />);

		fireEvent.click(screen.getByRole("button", { name: "图形库" }));
		expect(screen.getByTestId("sticker-shape-library")).toBeInTheDocument();
	});

	it("hides both lab sections when no local catalog is configured", () => {
		localCatalogMock.current.isAvailable = false;
		render(<StickersView />);

		expect(screen.queryByRole("button", { name: "贴纸实验室" })).toBeNull();
		expect(screen.queryByRole("button", { name: "QCut 原创" })).toBeNull();
	});

	it("surfaces a failed local reference upload as a retryable card error", async () => {
		stickerSelectMocks.upload.mockResolvedValue(undefined);
		render(<StickersView />);
		fireEvent.click(screen.getByRole("button", { name: "QCut 原创" }));

		const referenceButton = await screen.findByRole("button", {
			name: "添加手绘弯箭头到时间线",
		});
		await waitFor(() => expect(referenceButton).toBeEnabled());
		fireEvent.click(referenceButton);

		expect(
			await screen.findByText("无法添加到时间线，请重试")
		).toBeInTheDocument();
		expect(stickerSelectMocks.upload).toHaveBeenCalledTimes(1);
	});
});
