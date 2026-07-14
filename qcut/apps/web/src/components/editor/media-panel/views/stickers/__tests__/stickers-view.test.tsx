import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
	STICKER_CATEGORIES,
	STICKER_CATEGORY_MINIMUM_SIZE,
} from "@/lib/stickers/sticker-catalog";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useStickerPackStore } from "@/stores/sticker-pack-store";
import { useStickersStore } from "@/stores/stickers-store";
import { StickersView } from "../stickers-view";

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

	it("renders at least five stickers in every creator category", () => {
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
	});

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

	it("switches between the library, store, AI, recent, and favorites", () => {
		render(<StickersView />);

		fireEvent.click(screen.getByRole("button", { name: "商店" }));
		expect(screen.getByTestId("sticker-storefront")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "最近" }));
		expect(screen.getByText("No recent stickers yet")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "收藏" }));
		expect(screen.getByText("No favorite stickers")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "AI生成" }));
		expect(screen.getByTestId("ai-sticker-generator")).toBeInTheDocument();

		fireEvent.click(screen.getByTestId("sticker-category-interaction"));
		expect(screen.getByTestId("sticker-category-grid")).toBeInTheDocument();
	});
});
