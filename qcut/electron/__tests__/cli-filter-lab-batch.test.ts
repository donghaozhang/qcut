// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { FilterLabVerificationReport } from "../native-pipeline/filters/filter-lab-verification";
import {
	handleFilterLabCoverage,
	handleFilterLabVerifyBatch,
} from "../native-pipeline/cli/cli-handlers-filter-lab-batch";

function report({
	status,
	rgbRmse,
}: {
	status: "verified" | "close" | "unverified";
	rgbRmse: number;
}): FilterLabVerificationReport {
	return {
		status,
		rgbRmse,
		psnr: 48,
		ssim: 0.999,
		deltaE: 0.5,
		deltaESamples: 1000,
		width: 16,
		height: 9,
		referenceSha256: "a".repeat(64),
		candidateSha256: "b".repeat(64),
		verifiedAt: "2026-08-12T00:00:00.000Z",
	} as FilterLabVerificationReport;
}

const manifest = JSON.stringify({
	entries: [
		{
			resourceId: "one",
			filterVersion: "v1",
			referenceFrame: "/evidence/one-ref.png",
			candidateFrame: "/evidence/one-cand.png",
		},
		{
			resourceId: "two",
			filterVersion: "v1",
			referenceFrame: "/evidence/two-ref.png",
			candidateFrame: "/evidence/two-cand.png",
		},
	],
});

describe("filter-lab verify-batch", () => {
	it("verifies every entry and never aborts on one failure", async () => {
		const save = vi.fn(async () => "/store.json");
		const verify = vi
			.fn()
			.mockResolvedValueOnce(report({ status: "verified", rgbRmse: 0.4 }))
			.mockRejectedValueOnce(new Error("candidate PNG missing"));
		const result = await handleFilterLabVerifyBatch(
			{ manifest: "runs.json" },
			{ readManifest: async () => manifest, verify, save }
		);
		expect(result.success).toBe(true);
		const data = result.data as {
			total: number;
			succeeded: number;
			failed: number;
			statusCounts: Record<string, number>;
			results: Array<Record<string, unknown>>;
		};
		expect(data.total).toBe(2);
		expect(data.succeeded).toBe(1);
		expect(data.failed).toBe(1);
		expect(data.statusCounts).toEqual({ verified: 1 });
		expect(data.results[1]).toMatchObject({
			resourceId: "two",
			ok: false,
			error: "candidate PNG missing",
		});
		expect(save).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith({
			record: expect.objectContaining({ resourceId: "one", version: "v1" }),
		});
	});

	it("rejects a manifest entry missing required fields", async () => {
		const result = await handleFilterLabVerifyBatch(
			{ manifest: "runs.json" },
			{
				readManifest: async () =>
					JSON.stringify({ entries: [{ resourceId: "only-id" }] }),
				verify: vi.fn(),
				save: vi.fn(),
			}
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("entry 0");
	});

	it("requires --manifest", async () => {
		const result = await handleFilterLabVerifyBatch({});
		expect(result.success).toBe(false);
		expect(result.error).toContain("--manifest");
	});
});

describe("filter-lab coverage", () => {
	it("joins the store against the catalog into a stratified report", async () => {
		const result = await handleFilterLabCoverage(
			{ stratify: "implementation" },
			{
				exportCatalog: async () => ({
					count: 2,
					cards: [
						{
							resourceId: "one",
							title: "一",
							categories: [],
							version: "v1",
							implementation: "single-lut" as const,
							cacheStatus: "cached" as const,
							available: true,
							verification: "unverified" as const,
							lutCount: 1,
						},
						{
							resourceId: "two",
							title: "二",
							categories: [],
							implementation: "shader" as const,
							cacheStatus: "cached" as const,
							available: true,
							verification: "unverified" as const,
							lutCount: 1,
						},
					],
				}),
				readRecords: async () => [
					{
						resourceId: "one",
						version: "v1",
						status: "verified" as const,
						rgbRmse: 0.2,
						width: 16,
						height: 9,
						referenceSha256: "a".repeat(64),
						candidateSha256: "b".repeat(64),
						verifiedAt: "2026-08-12T00:00:00.000Z",
					},
				],
			}
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			stratify: ["implementation"],
			totals: { cards: 2, verified: 1, unverified: 1, recordedRuns: 1 },
		});
	});

	it("rejects unknown stratify fields", async () => {
		const result = await handleFilterLabCoverage({ stratify: "bogus" });
		expect(result.success).toBe(false);
		expect(result.error).toContain("bogus");
	});
});
