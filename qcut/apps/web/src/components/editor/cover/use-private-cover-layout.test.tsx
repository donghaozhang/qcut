import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoverDesignV1 } from "@qcut/editor-core/cover";
import { usePrivateCoverLayout } from "./use-private-cover-layout";

const mocks = vi.hoisted(() => ({
	load: vi.fn(),
	fonts: vi.fn(),
	apply: vi.fn(),
	paint: vi.fn(),
}));
vi.mock("@/lib/cover/private-cover-layout", () => ({
	loadPrivateCoverTextLayout: mocks.load,
	loadCoverLayoutFonts: mocks.fonts,
	applyPrivateCoverTextLayout: mocks.apply,
}));
vi.mock("@/lib/cover/cover-renderer", () => ({
	paintCoverDesign: mocks.paint,
}));
vi.mock("@/lib/cover/cover-repository", () => ({
	coverRepository: { readAsset: vi.fn() },
}));
const design = { version: 1, layers: [] } as unknown as CoverDesignV1;
const next = {
	...design,
	templateId: "jianying:fixture",
	layers: [{ id: "text", kind: "text", templateId: "jianying:fixture" }],
} as unknown as CoverDesignV1;

function setup() {
	const callbacks = { onEdit: vi.fn(), onSelect: vi.fn(), onError: vi.fn() };
	const initialProps = {
		design,
		disabled: false,
		projectId: "project",
		...callbacks,
	};
	return {
		...renderHook((props) => usePrivateCoverLayout(props), { initialProps }),
		initialProps,
		...callbacks,
	};
}

describe("cover layout import lifecycle", () => {
	afterEach(() => vi.restoreAllMocks());
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
			() => ({}) as never
		);
		mocks.load.mockResolvedValue({ texts: [] });
		mocks.fonts.mockResolvedValue(undefined);
		mocks.apply.mockReturnValue(next);
		mocks.paint.mockResolvedValue(undefined);
	});
	it("commits only after the font and render preflight, then selects imported text", async () => {
		const test = setup();
		await act(() => test.result.current.apply({ packageHash: "a".repeat(32) }));
		expect(mocks.paint).toHaveBeenCalledWith(
			expect.objectContaining({ design: next, signal: expect.any(AbortSignal) })
		);
		expect(test.onEdit).toHaveBeenCalledExactlyOnceWith(next);
		expect(test.onSelect).toHaveBeenCalledWith("text");
		expect(test.result.current.importing).toBe(false);
	});
	it.each([
		"edit",
		"project",
		"disabled",
		"unmount",
	])("does not overwrite after %s during preparation", async (change) => {
		let resolve!: (value: unknown) => void;
		mocks.load.mockImplementation(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const test = setup();
		let pending!: Promise<void>;
		act(() => {
			pending = test.result.current.apply({ packageHash: "a".repeat(32) });
		});
		if (change === "unmount") test.unmount();
		else
			test.rerender({
				...test.initialProps,
				...(change === "edit"
					? { design: { ...design } }
					: change === "project"
						? { projectId: "other" }
						: { disabled: true }),
			});
		await act(async () => {
			resolve({ texts: [] });
			await pending;
		});
		expect(test.onEdit).not.toHaveBeenCalled();
		expect(test.onError).not.toHaveBeenCalled();
		expect(mocks.paint).not.toHaveBeenCalled();
	});
	it("preserves the design on native render failure and allows retry", async () => {
		mocks.paint.mockRejectedValueOnce(new Error("Native word art failed"));
		const test = setup();
		await act(() => test.result.current.apply({ packageHash: "a".repeat(32) }));
		expect(test.onEdit).not.toHaveBeenCalled();
		expect(test.onError).toHaveBeenCalledWith(
			expect.stringContaining("Native word art failed")
		);
		await act(() => test.result.current.apply({ packageHash: "a".repeat(32) }));
		await waitFor(() => expect(test.onEdit).toHaveBeenCalledOnce());
	});
});
