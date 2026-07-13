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
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { StickerItem } from "../components/sticker-item";

describe("StickerItem", () => {
	beforeEach(() => {
		useAssetLibraryStore.getState().resetLibrary();
	});

	it("selects, favorites, and displays versioned cache state", async () => {
		const onSelect = vi.fn();
		render(
			<TooltipProvider>
				<StickerItem
					icon="star-pulsating-filled-loop"
					name="Pulsating star"
					collection="line-md"
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
	});
});
