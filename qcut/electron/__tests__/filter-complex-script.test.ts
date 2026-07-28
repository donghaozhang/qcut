import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prepareFFmpegFilterComplexScripts } from "../ffmpeg/filter-complex-script";

function createTemporaryRoot(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "qcut-filter-test-"));
}

describe("FFmpeg filter complex scripts", () => {
	it("leaves commands without complex filters unchanged", () => {
		const prepared = prepareFFmpegFilterComplexScripts({
			args: ["-i", "input.mp4", "-vf", "scale=320:240", "output.mp4"],
		});

		expect(prepared.args).toEqual([
			"-i",
			"input.mp4",
			"-vf",
			"scale=320:240",
			"output.mp4",
		]);
		expect(prepared.scriptPaths).toEqual([]);
		prepared.cleanup();
	});

	it("keeps short complex filters inline", () => {
		const temporaryRoot = createTemporaryRoot();
		try {
			const args = [
				"-i",
				"input.mp4",
				"-filter_complex",
				"[0:v]scale=320:240[out]",
				"-map",
				"[out]",
				"output.mp4",
			];
			const prepared = prepareFFmpegFilterComplexScripts({
				args,
				temporaryDirectory: temporaryRoot,
			});

			expect(prepared.args).toEqual(args);
			expect(prepared.scriptPaths).toEqual([]);
			expect(fs.readdirSync(temporaryRoot)).toEqual([]);
			prepared.cleanup();
		} finally {
			fs.rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});

	it("moves every complex graph out of the process arguments", () => {
		const temporaryRoot = createTemporaryRoot();
		try {
			const longGraph = `[0:v]${"null,".repeat(20_000)}null[first]`;
			const graphs = [longGraph, "[0:a][1:a]amix=inputs=2[aout]"];
			const prepared = prepareFFmpegFilterComplexScripts({
				args: [
					"-i",
					"input.mp4",
					"-filter_complex",
					graphs[0],
					"-map",
					"[first]",
					"-filter_complex",
					graphs[1],
					"-map",
					"[aout]",
					"output.mp4",
				],
				temporaryDirectory: temporaryRoot,
			});

			expect(prepared.args).not.toContain("-filter_complex");
			expect(
				prepared.args.filter((value) => value === "-filter_complex_script")
			).toHaveLength(2);
			expect(Buffer.byteLength(longGraph)).toBeGreaterThan(32_767);
			expect(Buffer.byteLength(prepared.args.join("\0"))).toBeLessThan(1_000);
			expect(
				prepared.scriptPaths.map((scriptPath) =>
					fs.readFileSync(scriptPath, "utf8")
				)
			).toEqual(graphs);
			if (process.platform !== "win32") {
				for (const scriptPath of prepared.scriptPaths) {
					expect(fs.statSync(scriptPath).mode & 0o777).toBe(0o600);
				}
			}

			const [directory] = prepared.scriptPaths.map((scriptPath) =>
				path.dirname(scriptPath)
			);
			prepared.cleanup();
			prepared.cleanup();
			expect(fs.existsSync(directory)).toBe(false);
		} finally {
			fs.rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});

	it("rejects a missing graph without leaking its temporary directory", () => {
		const temporaryRoot = createTemporaryRoot();
		try {
			expect(() =>
				prepareFFmpegFilterComplexScripts({
					args: ["-i", "input.mp4", "-filter_complex"],
					temporaryDirectory: temporaryRoot,
				})
			).toThrowError("FFmpeg filter_complex is missing its graph");
			expect(fs.readdirSync(temporaryRoot)).toEqual([]);
		} finally {
			fs.rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});
});
