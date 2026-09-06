import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndependentFilterShelf } from "../independent-filter-shelf";
import type { JianyingFilterLabLoadRendererResult } from "@/types/electron";

vi.mock("../use-jianying-filter-thumbnail", () => ({
	useJianyingFilterThumbnail: () => ({
		containerRef: null,
		state: "unavailable",
	}),
}));
const settings: JianyingFilterLabLoadRendererResult = {
	resourceId: "7160594413847203085",
	version: "v1",
	name: "迷雾 · QCut Metal",
	enabled: true,
	presetId: "qcut-independent-fog-v1",
	intensity: 100,
	fidelity: "native-local",
	nativeEffect: {
		provider: "qcut-metal-fog-v1",
		resourceId: "7160594413847203085",
		version: "v1",
	},
	passes: [],
};
const load = vi.fn(async () => settings);
beforeEach(() => {
	load.mockReset().mockResolvedValue(settings);
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: { qcutIndependentFilter: { load } },
	});
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe("QCut independent shelf", () => {
	it("checks readiness and applies the new descriptor", async () => {
		const apply = vi.fn();
		render(
			<IndependentFilterShelf
				targetName="clip"
				onApply={vi.fn()}
				onApplyMultiPass={apply}
			/>
		);
		const button = screen.getByRole("button", { name: "应用 迷雾 QCut Metal" });
		await waitFor(() => expect(button).toBeEnabled());
		fireEvent.click(button);
		expect(apply).toHaveBeenCalledWith({ settings, layerName: settings.name });
	});
	it("allows the existing adjustment-layer flow to create a target", async () => {
		render(
			<IndependentFilterShelf onApply={vi.fn()} onApplyMultiPass={vi.fn()} />
		);
		await screen.findByText(/LUT 已校验/);
		expect(
			screen.getByRole("button", { name: "应用 迷雾 QCut Metal" })
		).toBeEnabled();
	});
	it("shows a missing-LUT error and can retry", async () => {
		load.mockRejectedValueOnce(new Error("Local LUT missing"));
		render(
			<IndependentFilterShelf
				targetName="clip"
				onApply={vi.fn()}
				onApplyMultiPass={vi.fn()}
			/>
		);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Local LUT missing"
		);
		fireEvent.click(
			screen.getByRole("button", { name: "重新检查 QCut Metal" })
		);
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "应用 迷雾 QCut Metal" })
			).toBeEnabled()
		);
	});
});
