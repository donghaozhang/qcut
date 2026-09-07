import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createCoverText,
	type CoverTextLayerV1,
} from "@qcut/editor-core/cover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CoverTextStyleControls } from "./cover-text-style-controls";

vi.mock("@/lib/i18n", () => ({ useTranslation: () => ({ locale: "zh" }) }));
const canvas = { width: 1920, height: 1080, backgroundColor: "#000000" };
const initial = {
	...createCoverText({ canvas, id: "one", content: "Title" }),
	stroke: true,
	textStyle: {
		strokeWidth: 6,
		shadowBlur: 12,
		glowEnabled: true,
		glowOpacity: 0.65,
	},
};
afterEach(cleanup);

function Harness() {
	const [layer, setLayer] = useState<CoverTextLayerV1>(initial);
	return (
		<>
			<CoverTextStyleControls
				layer={layer}
				canvas={canvas}
				disabled={false}
				onChange={(changes) =>
					setLayer((current) => ({ ...current, ...changes }))
				}
			/>
			<output data-testid="state">{JSON.stringify(layer)}</output>
		</>
	);
}

describe("cover style controls", () => {
	it("edits bounded parameters without dropping other style overrides", () => {
		render(<Harness />);
		fireEvent.click(screen.getByTestId("cover-style-stroke"));
		fireEvent.change(
			screen.getByRole("spinbutton", { name: "描边 粗细 数值" }),
			{ target: { value: "100" } }
		);
		expect(
			JSON.parse(screen.getByTestId("state").textContent ?? "{}").textStyle
		).toMatchObject({ strokeWidth: 40, shadowBlur: 12 });
		fireEvent.change(
			screen.getByRole("spinbutton", { name: "描边 粗细 数值" }),
			{ target: { value: "" } }
		);
		expect(
			JSON.parse(screen.getByTestId("state").textContent ?? "{}").textStyle
				.strokeWidth
		).toBe(40);
		fireEvent.click(screen.getByRole("checkbox", { name: "启用描边" }));
		expect(
			screen
				.getByRole("spinbutton", { name: "描边 粗细 数值" })
				.closest("fieldset")?.disabled
		).toBe(true);
		fireEvent.click(screen.getByRole("checkbox", { name: "启用描边" }));
		expect(
			screen
				.getByRole("spinbutton", { name: "描边 粗细 数值" })
				.getAttribute("value")
		).toBe("40");
	});
	it("toggles glow without losing its configured intensity", () => {
		render(<Harness />);
		fireEvent.click(screen.getByTestId("cover-style-glow"));
		fireEvent.click(screen.getByRole("checkbox", { name: "启用发光" }));
		expect(
			JSON.parse(screen.getByTestId("state").textContent ?? "{}").textStyle
		).toMatchObject({ glowEnabled: false, glowOpacity: 0.65 });
	});
	it("closes the popover when selecting a different text layer", () => {
		const props = { canvas, disabled: false, onChange: vi.fn() };
		const view = render(<CoverTextStyleControls {...props} layer={initial} />);
		fireEvent.click(screen.getByTestId("cover-style-stroke"));
		expect(screen.getByRole("checkbox", { name: "启用描边" })).toBeDefined();
		view.rerender(
			<CoverTextStyleControls {...props} layer={{ ...initial, id: "two" }} />
		);
		expect(screen.queryByRole("checkbox", { name: "启用描边" })).toBeNull();
	});
	it("does not open while busy or without a selected layer", () => {
		const view = render(
			<CoverTextStyleControls
				layer={initial}
				canvas={canvas}
				disabled
				onChange={vi.fn()}
			/>
		);
		fireEvent.click(screen.getByTestId("cover-style-stroke"));
		expect(screen.queryByRole("checkbox")).toBeNull();
		view.rerender(
			<CoverTextStyleControls
				canvas={canvas}
				disabled={false}
				onChange={vi.fn()}
			/>
		);
		expect(screen.queryByTestId("cover-style-stroke")).toBeNull();
	});
	it("Escape dismisses only the parameter popover, not the cover dialog", () => {
		const onOpenChange = vi.fn();
		render(
			<Dialog open onOpenChange={onOpenChange}>
				<DialogContent aria-describedby={undefined}>
					<DialogTitle>Cover</DialogTitle>
					<Harness />
				</DialogContent>
			</Dialog>
		);
		fireEvent.click(screen.getByTestId("cover-style-stroke"));
		fireEvent.keyDown(
			screen.getByRole("spinbutton", { name: "描边 粗细 数值" }),
			{ key: "Escape" }
		);
		expect(screen.queryByRole("checkbox", { name: "启用描边" })).toBeNull();
		expect(onOpenChange).not.toHaveBeenCalled();
	});
});
