import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useStickersStore } from "@/stores/stickers-store";
import { StickersView } from "../stickers-view";

describe("StickersView", () => {
	beforeEach(() => {
		useAssetLibraryStore.getState().resetLibrary();
		useStickersStore.setState({
			searchResults: [],
			recentStickers: [],
			error: null,
			isLoading: false,
		});
	});

	it("uses creator categories and opens real motion collections first", () => {
		render(<StickersView />);

		expect(screen.getByRole("tab", { name: /Motion/ })).toHaveAttribute(
			"data-state",
			"active"
		);
		expect(screen.getByText("Material Line Motion")).toBeInTheDocument();
		expect(screen.getByText("SVG Motion Loops")).toBeInTheDocument();
		expect(
			screen.queryByRole("tab", { name: "Tabler" })
		).not.toBeInTheDocument();
	});

	it("switches between essentials, brands, recent, and favorites", () => {
		render(<StickersView />);
		fireEvent.mouseDown(screen.getByRole("tab", { name: /Essentials/ }), {
			button: 0,
			ctrlKey: false,
		});
		expect(screen.getByText("Tabler Icons")).toBeInTheDocument();

		fireEvent.mouseDown(screen.getByRole("tab", { name: /Brands/ }), {
			button: 0,
			ctrlKey: false,
		});
		expect(screen.getByText("Simple Icons (Brands)")).toBeInTheDocument();

		fireEvent.mouseDown(screen.getByRole("tab", { name: /Recent/ }), {
			button: 0,
			ctrlKey: false,
		});
		expect(screen.getByText("No recent stickers yet")).toBeInTheDocument();

		fireEvent.mouseDown(screen.getByRole("tab", { name: /Favorites/ }), {
			button: 0,
			ctrlKey: false,
		});
		expect(screen.getByText("No favorite stickers")).toBeInTheDocument();
	});
});
