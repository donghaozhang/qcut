import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("Sticker Lab CLI exit status", () => {
	test("returns a non-zero status for an unavailable configured root", () => {
		const cliPath = resolve(
			process.cwd(),
			"electron/native-pipeline/cli/cli.ts"
		);
		const result = spawnSync(
			"bun",
			[cliPath, "sticker-lab", "catalogs", "--json", "--quiet"],
			{
				encoding: "utf8",
				env: {
					...process.env,
					QCUT_STICKER_LAB_ROOT: "/definitely/not/a/qcut-sticker-root",
				},
				timeout: 10_000,
			}
		);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(JSON.parse(result.stdout)).toMatchObject({
			status: "error",
			code: "sticker-lab-catalogs:failed",
			error: expect.stringContaining("root override has no usable catalogs"),
		});
	});
});
