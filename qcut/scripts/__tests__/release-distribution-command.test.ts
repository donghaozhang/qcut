// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getReleaseDistributionCommand } from "../release.js";

describe("release distribution command", () => {
	it("routes macOS releases through the complete packaged-runtime pipeline", () => {
		expect(getReleaseDistributionCommand({ platform: "darwin" })).toBe(
			"bun run dist:mac"
		);

		const packageJson = JSON.parse(
			readFileSync(new URL("../../package.json", import.meta.url), "utf8")
		) as { scripts: Record<string, string> };
		expect(packageJson.scripts["dist:mac"]).toContain("stage:all-binaries");
		expect(packageJson.scripts["dist:mac"]).toContain(
			"verify:packaged-jianying-runtime-bridges"
		);
	});

	it("preserves the existing platform-specific non-macOS commands", () => {
		expect(getReleaseDistributionCommand({ platform: "linux" })).toContain(
			"electron-builder --linux"
		);
		expect(getReleaseDistributionCommand({ platform: "win32" })).toBe(
			"bun run dist:win:release"
		);
	});
});
