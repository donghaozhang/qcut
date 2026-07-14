import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { resolveIconifyStickerAssetEntry } from "@/lib/assets/qcut-asset-manifest";
import { createCachedStickerPreviewUrl } from "@/lib/stickers/sticker-resource";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { StickerItem } from "../components/sticker-item";

vi.mock("@/lib/stickers/sticker-resource", () => ({
	createCachedStickerPreviewUrl: vi.fn(async () => undefined),
}));

describe("StickerItem", () => {
	beforeEach(() => {
		useAssetLibraryStore.getState().resetLibrary();
		vi.mocked(createCachedStickerPreviewUrl).mockReset();
		vi.mocked(createCachedStickerPreviewUrl).mockResolvedValue(undefined);
	});

	it("selects, favorites, and displays versioned cache state", async () => {
		const onDownload = vi.fn();
		const onSelect = vi.fn();
		render(
			<TooltipProvider>
				<StickerItem
					icon="star-pulsating-filled-loop"
					name="Pulsating star"
					collection="line-md"
					layout="catalog"
					onDownload={onDownload}
					onSelect={onSelect}
				/>
			</TooltipProvider>
		);

		const stickerButton = screen.getByRole("button", {
			name: "Pulsating star (line-md)",
		});
		fireEvent.load(screen.getByRole("img", { name: "Pulsating star" }));
		fireEvent.click(stickerButton);
		expect(onSelect).toHaveBeenCalledWith(
			"line-md:star-pulsating-filled-loop",
			"Pulsating star"
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Download Pulsating star" })
		);
		expect(onDownload).toHaveBeenCalledWith(
			"line-md:star-pulsating-filled-loop",
			"Pulsating star"
		);
		expect(onSelect).toHaveBeenCalledTimes(1);

		fireEvent.click(
			screen.getByRole("button", { name: "Favorite Pulsating star" })
		);
		expect(
			useAssetLibraryStore.getState().favorites[
				"sticker:line-md:star-pulsating-filled-loop"
			]
		).toBe(true);
		expect(
			screen.getByRole("button", {
				name: "Remove Pulsating star from favorites",
			})
		).toBeInTheDocument();

		const asset = resolveIconifyStickerAssetEntry({
			collectionPrefix: "line-md",
			icon: "star-pulsating-filled-loop",
		});
		act(() => {
			useAssetLibraryStore.getState().updateRuntimeState({
				asset,
				patch: {
					downloadStatus: "downloaded",
					cacheStatus: "cached",
					progress: 1,
				},
			});
		});
		await waitFor(() =>
			expect(screen.getByTitle("Sticker cached")).toBeInTheDocument()
		);
		expect(
			screen.getByRole("button", { name: "Pulsating star cached" })
		).toBeDisabled();
	});

	it("previews cached remote sticker blobs and releases object URLs", async () => {
		vi.mocked(createCachedStickerPreviewUrl).mockResolvedValue({
			revoke: true,
			url: "blob:cached-sticker-preview",
		});
		const revokeObjectUrl = vi
			.spyOn(URL, "revokeObjectURL")
			.mockImplementation(() => {});
		const asset = resolveIconifyStickerAssetEntry({
			collectionPrefix: "line-md",
			icon: "loading-twotone-loop",
		});
		act(() => {
			useAssetLibraryStore.getState().updateRuntimeState({
				asset,
				patch: {
					downloadStatus: "downloaded",
					cacheStatus: "cached",
					progress: 1,
				},
			});
		});

		const { unmount } = render(
			<TooltipProvider>
				<StickerItem
					icon="loading-twotone-loop"
					name="Loading"
					collection="line-md"
					layout="catalog"
					onSelect={vi.fn()}
				/>
			</TooltipProvider>
		);

		await waitFor(() =>
			expect(screen.getByRole("img", { name: "Loading" })).toHaveAttribute(
				"src",
				"blob:cached-sticker-preview"
			)
		);
		expect(createCachedStickerPreviewUrl).toHaveBeenCalledWith({
			collection: "line-md",
			icon: "loading-twotone-loop",
		});

		unmount();

		expect(revokeObjectUrl).toHaveBeenCalledWith("blob:cached-sticker-preview");
		revokeObjectUrl.mockRestore();
	});

	it("previews bundled motion stickers from the asset manifest", async () => {
		render(
			<TooltipProvider>
				<StickerItem
					icon="attention-pulse"
					name="Attention pulse"
					collection="qcut-motion-emphasis"
					animated
					layout="catalog"
					onSelect={vi.fn()}
				/>
			</TooltipProvider>
		);

		const preview = await screen.findByRole("img", {
			name: "Attention pulse",
		});
		expect(preview).toHaveAttribute(
			"src",
			expect.stringContaining(
				"stickers/qcut-motion/qcut-motion-emphasis/attention-pulse.png"
			)
		);
		expect(preview.getAttribute("src")).not.toContain("api.iconify.design");
		expect(createCachedStickerPreviewUrl).not.toHaveBeenCalled();
	});
});
