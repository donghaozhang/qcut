import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");

describe("root check-types script", () => {
	it("runs the explicit TypeScript project matrix instead of an empty turbo task", () => {
		const packageJson = JSON.parse(
			readFileSync(join(ROOT, "package.json"), "utf8")
		) as { scripts: Record<string, string> };
		const script = readFileSync(join(ROOT, "scripts/check-types.ts"), "utf8");

		expect(packageJson.scripts["check-types"]).toBe(
			"bun scripts/check-types.ts"
		);
		expect(script).toContain("apps/web/tsconfig.json");
		expect(script).toContain("packages/platform-web/tsconfig.json");
		expect(script).toContain("scripts/tsconfig.json");
		expect(script).not.toContain("turbo run check-types");
	});
});
