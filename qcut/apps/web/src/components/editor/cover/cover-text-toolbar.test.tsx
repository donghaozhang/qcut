import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCoverText } from "@qcut/editor-core/cover";
import type { TextFontAssetReference } from "@qcut/editor-core";
import { CoverTextToolbar } from "./cover-text-toolbar";

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
		expect(screen.getByLabelText("editor.cover.color")).toBeDisabled();
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
