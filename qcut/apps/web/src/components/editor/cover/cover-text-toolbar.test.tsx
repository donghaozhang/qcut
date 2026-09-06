import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCoverText } from "@qcut/editor-core/cover";
import type { TextFontAssetReference } from "@qcut/editor-core";
import { CoverTextToolbar } from "./cover-text-toolbar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const font: TextFontAssetReference = {
	kind: "local-font",
	source: "jianying-cache",
	assetId: `sha256:${"a".repeat(64)}`,
	cssFamily: `QCutLocal_${"a".repeat(20)}`,
	familyName: "Lab Font",
	fullName: "Lab Font",
	postscriptName: "LabFont",
};
vi.mock("@/lib/i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key, locale: "zh" }),
}));
vi.mock("../properties-panel/jianying-font-lab-dialog", () => ({
	JianyingFontLabDialog: ({
		onApply,
		disabled,
		initialSample,
	}: {
		onApply: (value: { asset: TextFontAssetReference }) => void;
		disabled: boolean;
		initialSample: string;
	}) => (
		<button
			type="button"
			disabled={disabled}
			onClick={() => onApply({ asset: font })}
		>
			Font lab: {initialSample}
		</button>
	),
}));
const layer = createCoverText({
	canvas: { width: 1280, height: 720, backgroundColor: "#000000" },
	content: "Cover title",
	id: "title",
});
afterEach(cleanup);

describe("cover native text toolbar", () => {
	it("opens geometry on demand and bounds dimensions and rotation", () => {
		const onChange = vi.fn();
		render(
			<CoverTextToolbar
				layer={layer}
				disabled={false}
				onChange={onChange}
				onDelete={vi.fn()}
				onOrder={vi.fn()}
			/>
		);
		expect(screen.queryByLabelText("editor.cover.textWidth 数值")).toBeNull();
		fireEvent.keyDown(screen.getByTestId("cover-geometry"), { key: "Enter" });
		fireEvent.change(screen.getByLabelText("editor.cover.textWidth 数值"), {
			target: { value: "120" },
		});
		expect(onChange).toHaveBeenLastCalledWith({ width: 1 });
		fireEvent.change(screen.getByLabelText("editor.cover.textHeight 数值"), {
			target: { value: "0" },
		});
		expect(onChange).toHaveBeenLastCalledWith({ height: 0.05 });
		fireEvent.change(
			screen.getByRole("slider", { name: "editor.cover.textHeight" }),
			{ target: { value: "35" } }
		);
		expect(onChange).toHaveBeenLastCalledWith({ height: 0.35 });
		fireEvent.change(screen.getByLabelText("editor.cover.rotation 数值"), {
			target: { value: "270" },
		});
		expect(onChange).toHaveBeenLastCalledWith({ rotation: 180 });
		fireEvent.change(screen.getByLabelText("editor.cover.rotation 数值"), {
			target: { value: "-270" },
		});
		expect(onChange).toHaveBeenLastCalledWith({ rotation: -180 });
		onChange.mockClear();
		fireEvent.change(screen.getByLabelText("editor.cover.rotation 数值"), {
			target: { value: "" },
		});
		expect(onChange).not.toHaveBeenCalled();
	});
	it("closes geometry on layer changes and disables it when unavailable", () => {
		const props = {
			disabled: false,
			onChange: vi.fn(),
			onDelete: vi.fn(),
			onOrder: vi.fn(),
		};
		const view = render(<CoverTextToolbar {...props} layer={layer} />);
		fireEvent.click(screen.getByTestId("cover-geometry"));
		expect(screen.getByLabelText("editor.cover.rotation 数值")).toBeDefined();
		view.rerender(
			<CoverTextToolbar {...props} layer={{ ...layer, id: "two" }} />
		);
		expect(screen.queryByLabelText("editor.cover.rotation 数值")).toBeNull();
		fireEvent.click(screen.getByTestId("cover-geometry"));
		view.rerender(
			<CoverTextToolbar {...props} layer={{ ...layer, id: "two" }} disabled />
		);
		expect(screen.queryByLabelText("editor.cover.rotation 数值")).toBeNull();
		expect(screen.getByTestId("cover-geometry")).toBeDisabled();
		view.rerender(
			<CoverTextToolbar {...props} layer={{ ...layer, id: "two" }} />
		);
		expect(screen.queryByLabelText("editor.cover.rotation 数值")).toBeNull();
		view.rerender(<CoverTextToolbar {...props} />);
		expect(screen.getByTestId("cover-geometry")).toBeDisabled();
	});
	it("dismisses geometry with Escape without dismissing the cover editor", async () => {
		const onOpenChange = vi.fn();
		render(
			<Dialog open onOpenChange={onOpenChange}>
				<DialogContent>
					<DialogTitle>Cover</DialogTitle>
					<CoverTextToolbar
						layer={layer}
						disabled={false}
						onChange={vi.fn()}
						onDelete={vi.fn()}
						onOrder={vi.fn()}
					/>
				</DialogContent>
			</Dialog>
		);
		fireEvent.click(screen.getByTestId("cover-geometry"));
		fireEvent.keyDown(screen.getByLabelText("editor.cover.rotation 数值"), {
			key: "Escape",
		});
		await waitFor(() =>
			expect(screen.queryByLabelText("editor.cover.rotation 数值")).toBeNull()
		);
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(screen.getByRole("dialog", { name: "Cover" })).toBeDefined();
	});
	it("reuses the font picker for the selected text and clears the asset on generic font selection", () => {
		const onChange = vi.fn();
		const props = {
			layer,
			disabled: false,
			onChange,
			onDelete: vi.fn(),
			onOrder: vi.fn(),
		};
		const view = render(<CoverTextToolbar {...props} />);
		fireEvent.click(
			screen.getByRole("button", { name: "Font lab: Cover title" })
		);
		expect(onChange).toHaveBeenLastCalledWith({ fontAsset: font });
		view.rerender(
			<CoverTextToolbar {...props} layer={{ ...layer, fontAsset: font }} />
		);
		expect(screen.getByLabelText("editor.cover.font")).toHaveValue(
			font.assetId
		);
		fireEvent.change(screen.getByLabelText("editor.cover.font"), {
			target: { value: "serif" },
		});
		expect(onChange).toHaveBeenLastCalledWith({
			fontFamily: "serif",
			fontAsset: undefined,
		});
	});
	it("edits the native frame while disabling unsupported flat paint controls", () => {
		const onChange = vi.fn();
		render(
			<CoverTextToolbar
				layer={{
					...layer,
					jianyingTextStyle: {
						schemaVersion: 1,
						source: "jianying-cache",
						packageKind: "InfoSticker",
						resourceId: "123",
						packageHash: "a".repeat(32),
						editMode: "runtime-with-preload-fallback",
						slotMapping: "line-to-widget",
						timeMapping: "stretch",
						templateDuration: 3,
					},
				}}
				disabled={false}
				onChange={onChange}
				onDelete={vi.fn()}
				onOrder={vi.fn()}
			/>
		);
		expect(screen.getByLabelText("editor.cover.color")).toBeEnabled();
		fireEvent.change(screen.getByLabelText("editor.cover.color"), {
			target: { value: "#047bff" },
		});
		expect(onChange).toHaveBeenLastCalledWith({
			color: "#047bff",
			nativeUseEffectDefaultColor: false,
		});
		expect(
			screen.getByRole("button", { name: "editor.cover.bold" })
		).toBeDisabled();
		expect(screen.getByLabelText("editor.cover.textContent")).toBeEnabled();
		fireEvent.change(screen.getByLabelText("取帧 (秒)"), {
			target: { value: "2.1" },
		});
		expect(onChange).toHaveBeenLastCalledWith({ nativeFrameTime: 2.1 });
		fireEvent.click(screen.getByRole("button", { name: "移除原生花字" }));
		expect(onChange).toHaveBeenLastCalledWith({
			jianyingTextStyle: undefined,
			nativeFrameTime: undefined,
			nativeUseEffectDefaultColor: undefined,
		});
	});
	it("does not allow applying fonts with no text selection", () => {
		const onChange = vi.fn();
		render(
			<CoverTextToolbar
				disabled={false}
				onChange={onChange}
				onDelete={vi.fn()}
				onOrder={vi.fn()}
			/>
		);
		fireEvent.click(screen.getByRole("button", { name: "Font lab:" }));
		expect(onChange).not.toHaveBeenCalled();
	});
});
