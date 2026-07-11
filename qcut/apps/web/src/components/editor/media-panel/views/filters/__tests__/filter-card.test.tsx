import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterCard } from "../filter-card";

function renderCard({
	selected = false,
	disabled = false,
	favorite,
	featured,
	reset,
	localizedName,
	onSelect = vi.fn(),
	onFavoriteChange,
}: {
	selected?: boolean;
	disabled?: boolean;
	favorite?: boolean;
	featured?: boolean;
	reset?: boolean;
	localizedName?: string;
	onSelect?: () => void;
	onFavoriteChange?: () => void;
} = {}) {
	return render(
		<FilterCard
			id="vivid"
			name="Vivid"
			localizedName={localizedName}
			thumbnail="/images/filter-previews/vivid.webp"
			selected={selected}
			disabled={disabled}
			favorite={favorite}
			featured={featured}
			reset={reset}
			onSelect={onSelect}
			onFavoriteChange={onFavoriteChange}
		/>
	);
}

describe("FilterCard", () => {
	it("selects the filter on click", () => {
		const onSelect = vi.fn();
		renderCard({ onSelect });

		fireEvent.click(screen.getByTestId("filter-card-vivid"));

		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it("ignores clicks and keyboard activation while disabled", () => {
		const onSelect = vi.fn();
		renderCard({ disabled: true, onSelect });

		const card = screen.getByTestId("filter-card-vivid");
		fireEvent.click(card);
		fireEvent.keyDown(card, { key: "Enter" });

		expect(onSelect).not.toHaveBeenCalled();
		expect(card).toHaveAttribute("aria-disabled", "true");
		expect(card).toHaveAttribute("tabindex", "-1");
	});

	it("selects the filter with Enter and Space but not other keys", () => {
		const onSelect = vi.fn();
		renderCard({ onSelect });

		const card = screen.getByTestId("filter-card-vivid");
		fireEvent.keyDown(card, { key: "Enter" });
		fireEvent.keyDown(card, { key: " " });
		fireEvent.keyDown(card, { key: "a" });
		fireEvent.keyDown(card, { key: "Escape" });

		expect(onSelect).toHaveBeenCalledTimes(2);
	});

	it("marks the selected state for assistive tech", () => {
		renderCard({ selected: true });

		expect(screen.getByTestId("filter-card-vivid")).toHaveAttribute(
			"aria-pressed",
			"true"
		);
	});

	it("toggles the favorite without selecting the filter", () => {
		const onSelect = vi.fn();
		const onFavoriteChange = vi.fn();
		renderCard({ onSelect, onFavoriteChange });

		fireEvent.click(screen.getByRole("button", { name: "Favorite Vivid" }));

		expect(onFavoriteChange).toHaveBeenCalledTimes(1);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("stops keyboard events on the favorite button from selecting the card", () => {
		const onSelect = vi.fn();
		const onFavoriteChange = vi.fn();
		renderCard({ onSelect, onFavoriteChange });

		fireEvent.keyDown(screen.getByRole("button", { name: "Favorite Vivid" }), {
			key: "Enter",
		});

		expect(onSelect).not.toHaveBeenCalled();
	});

	it("labels the favorite button for removal when already favorited", () => {
		renderCard({ favorite: true, onFavoriteChange: vi.fn() });

		expect(
			screen.getByRole("button", { name: "Remove Vivid from favorites" })
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Favorite Vivid" })
		).not.toBeInTheDocument();
	});

	it("hides the favorite button when no handler is provided", () => {
		renderCard();

		expect(screen.queryByTitle("Add to favorites")).not.toBeInTheDocument();
		expect(
			screen.queryByTitle("Remove from favorites")
		).not.toBeInTheDocument();
	});

	it("shows the featured badge only for new filters", () => {
		const { rerender } = renderCard({ featured: true });

		expect(screen.getByTitle("New filter")).toBeInTheDocument();

		rerender(
			<FilterCard
				id="vivid"
				name="Vivid"
				thumbnail="/images/filter-previews/vivid.webp"
				selected={false}
				disabled={false}
				onSelect={vi.fn()}
			/>
		);

		expect(screen.queryByTitle("New filter")).not.toBeInTheDocument();
	});

	it("renders the reset overlay for the None card", () => {
		const { container } = renderCard({ reset: true });

		expect(container.querySelector(".lucide-rotate-ccw")).not.toBeNull();
	});

	it("renders the localized name only when provided", () => {
		const { rerender } = renderCard({ localizedName: "鲜明" });

		expect(screen.getByText("鲜明")).toBeInTheDocument();

		rerender(
			<FilterCard
				id="vivid"
				name="Vivid"
				thumbnail="/images/filter-previews/vivid.webp"
				selected={false}
				disabled={false}
				onSelect={vi.fn()}
			/>
		);

		expect(screen.queryByText("鲜明")).not.toBeInTheDocument();
	});
});
