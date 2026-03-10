import { describe, it, expect } from "vitest";
import {
	createHistory,
	pushState,
	undo,
	redo,
	canUndo,
	canRedo,
	clearHistory,
} from "../commands/history.js";

describe("history stack", () => {
	it("starts empty", () => {
		const h = createHistory<string>();
		expect(h.past).toEqual([]);
		expect(h.future).toEqual([]);
		expect(canUndo(h)).toBe(false);
		expect(canRedo(h)).toBe(false);
	});

	it("pushState adds to past and clears future", () => {
		let h = createHistory<string>();
		h = pushState(h, "state1");
		expect(h.past).toEqual(["state1"]);
		expect(canUndo(h)).toBe(true);

		// Simulate redo stack
		h = { past: ["a"], future: ["b"] };
		h = pushState(h, "c");
		expect(h.future).toEqual([]);
		expect(h.past).toEqual(["a", "c"]);
	});

	it("undo restores previous state", () => {
		let h = createHistory<number>();
		h = pushState(h, 1);
		h = pushState(h, 2);

		const result = undo(h, 3);
		expect(result).not.toBeNull();
		expect(result!.restoredState).toBe(2);
		expect(result!.history.past).toEqual([1]);
		expect(result!.history.future).toEqual([3]);
	});

	it("undo returns null when nothing to undo", () => {
		const h = createHistory<number>();
		expect(undo(h, 0)).toBeNull();
	});

	it("redo restores undone state", () => {
		let h = createHistory<number>();
		h = pushState(h, 1);
		h = pushState(h, 2);

		// Undo once
		const undoResult = undo(h, 3)!;
		// Redo
		const redoResult = redo(undoResult.history, undoResult.restoredState);
		expect(redoResult).not.toBeNull();
		expect(redoResult!.restoredState).toBe(3);
	});

	it("redo returns null when nothing to redo", () => {
		const h = createHistory<number>();
		expect(redo(h, 0)).toBeNull();
	});

	it("clearHistory resets everything", () => {
		const h = clearHistory<string>();
		expect(h.past).toEqual([]);
		expect(h.future).toEqual([]);
	});
});
