import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { JianyingTextStyleLabListResult } from "@/types/electron";
import { DEFAULT_TEXT_TEMPLATE_CATEGORY_ID } from "@/lib/text/text-template-registry";
import { TextLibraryNav } from "../text";

const RESULT: JianyingTextStyleLabListResult = {
	count: 12,
	styles: [],
	categories: [
		{ id: "popular", label: "热门", count: 7 },
		{ id: "latest", label: "最新", count: 4 },
		{ id: "purple", label: "紫色", count: 1 },
	],
	packageCount: 12,
	invalidPackageCount: 0,
};

function renderNav({ styleLabOpen }: { styleLabOpen: boolean }) {
	const onSelectStyleLabView = vi.fn();
	const onToggleStyleLabGroup = vi.fn();
	render(
		<TextLibraryNav
			activeCategoryId={DEFAULT_TEXT_TEMPLATE_CATEGORY_ID}
			expandedGroupIds={new Set()}
			onSelectCategory={vi.fn()}
			onSelectGroup={vi.fn()}
			onOpenStyleLab={vi.fn()}
			onSelectStyleLabView={onSelectStyleLabView}
			onToggleStyleLabGroup={onToggleStyleLabGroup}
			styleLabExpandedGroups={{ charts: true }}
			styleLabOpen={styleLabOpen}
			styleLabResult={RESULT}
			styleLabView="trial"
		/>
	);
	return { onSelectStyleLabView, onToggleStyleLabGroup };
}

describe("TextLibraryNav", () => {
	it("keeps the lab categories out of the rail until the lab is open", () => {
		renderNav({ styleLabOpen: false });
		expect(
			screen.getByRole("button", { name: "花字实验室" })
		).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /全部/ })).toBeNull();
		expect(screen.queryByRole("button", { name: /热门/ })).toBeNull();
	});

	it("nests the lab categories under the lab entry once it opens", () => {
		const { onSelectStyleLabView, onToggleStyleLabGroup } = renderNav({
			styleLabOpen: true,
		});
		const labEntry = screen.getByRole("button", { name: "花字实验室" });
		const category = screen.getByRole("button", {
			name: "热门，7 个本地花字",
		});
		// The categories belong to the lab, so they must follow its rail entry
		// rather than sitting beside the template groups above it.
		expect(
			labEntry.compareDocumentPosition(category) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();

		fireEvent.click(category);
		expect(onSelectStyleLabView).toHaveBeenCalledWith("popular");

		// 颜色 is folded by default, so 紫色 only exists after the group opens.
		expect(screen.queryByRole("button", { name: /紫色/ })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: /颜色/ }));
		expect(onToggleStyleLabGroup).toHaveBeenCalledWith("colors");
	});
});
