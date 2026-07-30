import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	STICKER_CATEGORIES,
	STICKER_CATEGORY_MINIMUM_SIZE,
} from "@/lib/stickers/sticker-catalog";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useStickerPackStore } from "@/stores/sticker-pack-store";
import { useStickersStore } from "@/stores/stickers-store";
import { StickersView } from "../stickers-view";

vi.mock("@/lib/stickers/local-sticker-reference", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/lib/stickers/local-sticker-reference")
		>();
	return {
		...actual,
		getLocalStickerReferences: () => [
			{
				id: "hand-drawn-curved-arrow",
				displayName: "手绘弯箭头",
				fileName: "hand-drawn-curved-arrow.png",
				filePath: "/tmp/hand-drawn-curved-arrow.png",
				mimeType: "image/png",
				frameCount: 4,
				frameRate: 5,
				cycleDuration: 0.8,
			},
		],
		loadLocalStickerReferenceFile: async () =>
			new File([new Uint8Array([137, 80, 78, 71])], "arrow.png", {
				type: "image/png",
			}),
	};
});

describe("StickersView", () => {
	beforeEach(() => {
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
		const sidebarButtons = within(sidebar).getAllByRole("button");
		expect(sidebarButtons.at(-1)).toHaveAccessibleName("贴纸实验室");
		fireEvent.click(
			within(sidebar).getByRole("button", { name: "贴纸实验室" })
		);
		expect(
			screen.getByTestId("local-sticker-reference-panel")
		).toBeInTheDocument();
		expect(screen.getByText("手绘弯箭头")).toBeInTheDocument();

		fireEvent.click(screen.getByTestId("sticker-category-interaction"));
		expect(screen.getByTestId("sticker-category-grid")).toBeInTheDocument();
	});
});
