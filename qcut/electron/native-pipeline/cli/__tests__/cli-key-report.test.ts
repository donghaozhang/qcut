import { describe, expect, it } from "vitest";
import type { KeyStatus } from "../../infra/key-manager";
import {
	buildKeyReport,
	normalizeKeyCategory,
	normalizeKeyFilter,
} from "../cli-key-report";

const SAMPLE_KEYS: KeyStatus[] = [
	{
		name: "QCUT_AUTH_TOKEN",
		configured: true,
		source: "env",
		masked: "qcut****oken",
	},
	{
		name: "FAL_KEY",
		configured: true,
		source: "envfile",
		masked: "fal_****1234",
	},
	{
		name: "OPENAI_API_KEY",
		configured: false,
		source: "none",
	},
	{
		name: "RUNWAY_API_KEY",
		configured: false,
		source: "none",
	},
];

describe("buildKeyReport", () => {
	it("adds summary and capability categories", () => {
		const report = buildKeyReport({ statuses: SAMPLE_KEYS });

		expect(report.summary).toEqual({
			configured: 2,
			missing: 2,
			total: 4,
		});
		expect(
			report.keys.find((key) => key.name === "FAL_KEY")?.requiredFor
		).toEqual(["image", "video", "audio"]);
	});

	it("filters configured keys", () => {
		const report = buildKeyReport({
			statuses: SAMPLE_KEYS,
			filter: "configured",
		});

		expect(report.summary).toEqual({
			configured: 2,
			missing: 0,
			total: 2,
		});
		expect(report.keys.every((key) => key.configured)).toBe(true);
	});

	it("filters missing keys", () => {
		const report = buildKeyReport({
			statuses: SAMPLE_KEYS,
			filter: "missing",
		});

		expect(report.summary).toEqual({
			configured: 0,
			missing: 2,
			total: 2,
		});
		expect(report.keys.map((key) => key.name)).toEqual([
			"OPENAI_API_KEY",
			"RUNWAY_API_KEY",
		]);
	});

	it("filters by capability category", () => {
		const report = buildKeyReport({
			statuses: SAMPLE_KEYS,
			category: "video",
		});

		expect(report.keys.map((key) => key.name)).toEqual([
			"FAL_KEY",
			"RUNWAY_API_KEY",
		]);
		expect(report.summary).toEqual({
			configured: 1,
			missing: 1,
			total: 2,
		});
	});

	it("returns recommended next steps for important missing keys", () => {
		const report = buildKeyReport({
			statuses: SAMPLE_KEYS,
			filter: "missing",
		});

		expect(report.recommendedNext).toContain(
			"Set OPENAI_API_KEY to enable OpenAI image, audio, and LLM commands."
		);
		expect(report.recommendedNext).toContain(
			"Set RUNWAY_API_KEY to enable Runway video commands."
		);
	});
});

describe("normalizeKeyFilter", () => {
	it("defaults to all keys", () => {
		expect(normalizeKeyFilter({})).toBe("all");
	});

	it("rejects conflicting filters", () => {
		expect(() =>
			normalizeKeyFilter({ configured: true, missing: true })
		).toThrow("Use only one of --configured or --missing");
	});
});

describe("normalizeKeyCategory", () => {
	it("accepts supported categories", () => {
		expect(normalizeKeyCategory({ category: "image" })).toBe("image");
	});

	it("rejects unknown categories", () => {
		expect(() => normalizeKeyCategory({ category: "billing" })).toThrow(
			"Unknown key category 'billing'"
		);
	});
});
