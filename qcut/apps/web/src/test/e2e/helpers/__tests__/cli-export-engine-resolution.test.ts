import { describe, expect, it } from "vitest";
import { resolveSelectedEngine } from "../cli-export-benchmark";

describe("export engine resolution from renderer logs", () => {
	it("reads the engine the factory actually chose", () => {
		expect(
			resolveSelectedEngine({
				lines: [
					"🚀 EXPORT ENGINE SELECTION: CLI FFmpeg chosen for Electron environment",
				],
			})
		).toBe("cli");
	});

	it("ignores the panel's own selection line", () => {
		// The desktop panel commonly reports `auto`, which the factory then
		// resolves to CLI. A benchmark trusting this line would claim the wrong
		// engine — this is the exact mistake the resolver exists to prevent.
		expect(
			resolveSelectedEngine({
				lines: ["  - User selected engine: auto"],
			})
		).toBeNull();
	});

	it("uses the most recent selection when several exports ran", () => {
		expect(
			resolveSelectedEngine({
				lines: [
					"🚀 EXPORT ENGINE SELECTION: CLI FFmpeg chosen for Electron environment",
					"🚀 EXPORT ENGINE SELECTION: Remotion engine chosen",
				],
			})
		).toBe("remotion");
	});

	it("returns null when nothing announced an engine", () => {
		expect(resolveSelectedEngine({ lines: [] })).toBeNull();
		expect(
			resolveSelectedEngine({ lines: ["some unrelated renderer log"] })
		).toBeNull();
	});

	it("does not mistake one engine's line for another", () => {
		expect(
			resolveSelectedEngine({
				lines: ["🚀 EXPORT ENGINE SELECTION: Standard canvas engine chosen"],
			})
		).toBe("standard");
	});
});
