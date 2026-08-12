// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildFilterLabCoverageReport } from "../native-pipeline/filters/filter-lab-coverage";

const strataOf = (card: { implementation?: unknown }) =>
	`implementation=${String(card.implementation ?? "none")}`;

describe("buildFilterLabCoverageReport", () => {
	const cards = [
		{ resourceId: "a", version: "v1", implementation: "single-lut" },
		{ resourceId: "b", version: "v1", implementation: "single-lut" },
		{ resourceId: "c", version: "v2", implementation: "shader" },
	];

	it("counts the latest matching record per card and strata totals", () => {
		const report = buildFilterLabCoverageReport({
			cards,
			records: [
				{
					resourceId: "a",
					version: "v1",
					status: "close",
					rgbRmse: 3,
					verifiedAt: "2026-08-10T00:00:00Z",
				},
				{
					resourceId: "a",
					version: "v1",
					status: "verified",
					rgbRmse: 0.5,
					verifiedAt: "2026-08-12T00:00:00Z",
				},
				{
					resourceId: "c",
					version: "v2",
					status: "close",
					rgbRmse: 2,
					verifiedAt: "2026-08-11T00:00:00Z",
				},
			],
			strataOf,
		});
		expect(report.totals).toEqual({
			cards: 3,
			verified: 1,
			close: 1,
			unverified: 1,
			recordedRuns: 3,
		});
		expect(report.strata).toEqual([
			{
				key: "implementation=shader",
				total: 1,
				verified: 0,
				close: 1,
				unverified: 0,
				bestRmse: 2,
				worstRmse: 2,
			},
			{
				key: "implementation=single-lut",
				total: 2,
				verified: 1,
				close: 0,
				unverified: 1,
				bestRmse: 0.5,
				worstRmse: 0.5,
			},
		]);
	});

	it("ignores records whose version does not match the card", () => {
		const report = buildFilterLabCoverageReport({
			cards,
			records: [
				{
					resourceId: "a",
					version: "STALE",
					status: "verified",
					verifiedAt: "2026-08-12T00:00:00Z",
				},
			],
			strataOf,
		});
		expect(report.totals.verified).toBe(0);
		expect(report.totals.unverified).toBe(3);
		// The stale run still shows up as recorded work.
		expect(report.totals.recordedRuns).toBe(1);
	});

	it("counts versionless records against any card version", () => {
		const report = buildFilterLabCoverageReport({
			cards,
			records: [
				{
					resourceId: "c",
					status: "verified",
					verifiedAt: "2026-08-12T00:00:00Z",
				},
			],
			strataOf,
		});
		expect(report.totals.verified).toBe(1);
	});

	it("handles an empty catalog", () => {
		const report = buildFilterLabCoverageReport({
			cards: [],
			records: [],
			strataOf,
		});
		expect(report.totals.cards).toBe(0);
		expect(report.strata).toEqual([]);
	});
});
