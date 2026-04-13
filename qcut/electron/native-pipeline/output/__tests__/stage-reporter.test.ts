import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	estimateCharacters,
	estimatePortraits,
	estimateNovel2Script,
	formatDuration,
	formatUsd,
	startStep,
	describeArtifact,
} from "../stage-reporter";

describe("formatDuration", () => {
	it("uses seconds when under one minute", () => {
		expect(formatDuration(0)).toBe("0.0s");
		expect(formatDuration(45.25)).toBe("45.3s");
	});

	it("formats MMm SSs for >= 60s", () => {
		expect(formatDuration(60)).toBe("1m 0s");
		expect(formatDuration(125)).toBe("2m 5s");
		expect(formatDuration(3601)).toBe("60m 1s");
	});
});

describe("formatUsd", () => {
	it("always prints three decimal places", () => {
		expect(formatUsd(0)).toBe("$0.000");
		expect(formatUsd(0.0123)).toBe("$0.012");
		expect(formatUsd(1.2)).toBe("$1.200");
	});
});

describe("estimateCharacters", () => {
	it("reports a sub-minute range and is size-independent beyond 50K", () => {
		const small = estimateCharacters(4_000);
		const huge = estimateCharacters(500_000);
		expect(small.estLowSeconds).toBe(huge.estLowSeconds);
		expect(small.estHighSeconds).toBe(huge.estHighSeconds);
		expect(small.estHighSeconds).toBeLessThanOrEqual(30);
	});
});

describe("estimatePortraits", () => {
	it("scales linearly with character count and view count", () => {
		const one = estimatePortraits(1, 1);
		const five = estimatePortraits(5, 1);
		expect(five.estLowCostUsd).toBeCloseTo(one.estLowCostUsd * 5, 5);
		expect(five.estHighCostUsd).toBeCloseTo(one.estHighCostUsd * 5, 5);

		const multiView = estimatePortraits(1, 4);
		expect(multiView.estLowSeconds).toBeCloseTo(one.estLowSeconds * 4, 5);
	});
});

describe("estimateNovel2Script", () => {
	it("computes chunk count from stride (chunk_size - overlap)", () => {
		const e = estimateNovel2Script(10_000, 2_000, 200);
		// stride = 1800, ceil(10000/1800) = 6
		expect(e.inputSummary).toContain("6 chunks");
	});

	it("never reports zero chunks even for tiny input", () => {
		const e = estimateNovel2Script(50, 2_000, 200);
		expect(e.inputSummary).toContain("1 chunks");
	});
});

describe("startStep", () => {
	it("measures elapsed time in seconds", async () => {
		const step = startStep("demo");
		await new Promise((r) => setTimeout(r, 20));
		const elapsed = step.elapsedSeconds();
		expect(elapsed).toBeGreaterThanOrEqual(0.015);
		expect(elapsed).toBeLessThan(5);
	});
});

describe("describeArtifact", () => {
	it("resolves to absolute path and captures file size", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-"));
		try {
			const p = path.join(dir, "hello.txt");
			fs.writeFileSync(p, "hello world");
			const art = describeArtifact(p, "greeting");
			expect(path.isAbsolute(art.path)).toBe(true);
			expect(art.label).toBe("greeting");
			expect(art.bytes).toBe(11);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("returns undefined bytes for non-existent files without throwing", () => {
		const art = describeArtifact("/tmp/definitely-not-a-real-file-qcut.xyz");
		expect(art.bytes).toBeUndefined();
	});
});
