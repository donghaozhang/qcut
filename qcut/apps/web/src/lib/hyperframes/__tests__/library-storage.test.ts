import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	loadHyperframesLibrary,
	saveHyperframesLibrary,
} from "../library-storage";
import type { HyperframesComposition } from "../types";

const composition: HyperframesComposition = {
	id: "main",
	name: "Main",
	sourcePath: "/project/index.html",
	projectPath: "/project",
	duration: 5,
	durationIsEstimated: false,
	width: 1920,
	height: 1080,
	fps: 30,
	variables: [],
	defaultVariableValues: {},
	warnings: [],
};

describe("HyperFrames library storage", () => {
	beforeEach(() => {
		const values = new Map<string, string>();
		vi.mocked(localStorage.getItem).mockImplementation(
			(key) => values.get(key) ?? null
		);
		vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
			values.set(key, value);
		});
		vi.mocked(localStorage.removeItem).mockImplementation((key) => {
			values.delete(key);
		});
		vi.mocked(localStorage.clear).mockImplementation(() => {
			values.clear();
		});
	});

	it("round trips compositions", () => {
		saveHyperframesLibrary({ compositions: [composition] });
		expect(loadHyperframesLibrary()).toEqual([composition]);
	});

	it("drops malformed records without losing valid records", () => {
		localStorage.setItem(
			"qcut:hyperframes-library:v1",
			JSON.stringify([{ nope: true }, composition])
		);
		expect(loadHyperframesLibrary()).toEqual([composition]);
	});
});
