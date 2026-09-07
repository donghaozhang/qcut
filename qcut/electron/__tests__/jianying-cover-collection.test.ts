import { describe, expect, it } from "vitest";
import type {
	CoverCachedEntry,
	CoverObservation,
} from "../jianying-cover-contract";
import {
	coverCollectionFingerprint,
	mergeCoverObservations,
	planCoverCollectionBatches,
	summarizeCoverCollection,
} from "../jianying-cover-collection";

const observation: CoverObservation = {
	packageHash: "a".repeat(32),
	previewHash: "b".repeat(32),
	title: "Cover",
	categories: ["life"],
	evidence: "native-ui-and-template-content",
};
const file = {
	path: `objects/${"c".repeat(64)}`,
	sha256: "c".repeat(64),
	bytes: 5,
	logicalPath: "template.json",
};
const cached: CoverCachedEntry = {
	...observation,
	definition: file,
	preview: { ...file, logicalPath: "preview.webp" },
	dependencies: [
		{ reference: `filter/${"d".repeat(32)}`, status: "missing", files: [] },
	],
	cacheStatus: "missing-dependencies",
	renderStatus: "native-renderer-required",
	textCount: 1,
};
const verification = {
	packageHash: observation.packageHash,
	fingerprint: coverCollectionFingerprint({ entry: cached }),
	scope: "text-layout-render-save-reopen" as const,
	verifiedAt: "2026-09-06T05:00:00.000Z",
	runtime: "desktop-build-1",
	artifacts: [{ path: "evidence.png", sha256: "e".repeat(64) }],
};

describe("cover collection accounting", () => {
	it("deduplicates packages while preserving multi-category membership", () => {
		const entries = mergeCoverObservations({
			previous: [observation],
			incoming: [{ ...observation, categories: ["recommended"] }, observation],
		});
		expect(entries).toHaveLength(1);
		expect(entries[0].categories).toEqual(["life", "recommended"]);
	});
	it("rejects conflicting names and previews rather than guessing identity", () => {
		for (const changed of [
			{ title: "Other" },
			{ previewHash: "d".repeat(32) },
		]) {
			expect(() =>
				mergeCoverObservations({
					previous: [observation],
					incoming: [{ ...observation, ...changed }],
				})
			).toThrow("Conflicting identity");
		}
	});
	it("does not collapse equal titles with different package versions", () => {
		expect(
			mergeCoverObservations({
				previous: [observation],
				incoming: [{ ...observation, packageHash: "d".repeat(32) }],
			})
		).toHaveLength(2);
	});
	it("plans bounded category batches without downloading cross-listed items twice", () => {
		const entries = Array.from({ length: 7 }, (_, index) => ({
			...observation,
			packageHash: index.toString(16).repeat(32),
			categories: ["life", "recommended"],
		}));
		const batches = planCoverCollectionBatches({
			observations: entries,
			batchSize: 3,
		});
		expect(batches.map((batch) => batch.entries.length)).toEqual([3, 3, 1]);
		expect(batches.every((batch) => batch.category === "recommended")).toBe(
			true
		);
	});
	it("rejects invalid batch sizes", () => {
		for (const batchSize of [0, -1, 26, 1.5, Number.NaN]) {
			expect(() =>
				planCoverCollectionBatches({ observations: [], batchSize })
			).toThrow("Batch size");
		}
	});
	it("keeps discovery, cache, dependency completeness, applicability and verification separate", () => {
		const report = summarizeCoverCollection({
			observations: [observation],
			cachedEntries: [cached],
			preparedHashes: [],
			verifications: [verification],
		});
		expect(report.totals).toEqual({
			discovered: 1,
			cached: 1,
			dependenciesComplete: 0,
			applicable: 0,
			verified: 0,
		});
	});
	it("accepts matching render receipts only after resource preparation", () => {
		const report = summarizeCoverCollection({
			observations: [observation],
			cachedEntries: [cached],
			preparedHashes: [observation.packageHash],
			verifications: [verification],
		});
		expect(report.totals).toEqual({
			discovered: 1,
			cached: 1,
			dependenciesComplete: 0,
			applicable: 1,
			verified: 1,
		});
	});
	it("invalidates verification when definitions or dependency bytes change", () => {
		for (const entry of [
			{ ...cached, definition: { ...file, sha256: "d".repeat(64) } },
			{
				...cached,
				dependencies: [
					{ reference: "text/font", status: "cached" as const, files: [file] },
				],
			},
		]) {
			const report = summarizeCoverCollection({
				observations: [observation],
				cachedEntries: [entry],
				preparedHashes: [observation.packageHash],
				verifications: [verification],
			});
			expect(report.totals.verified).toBe(0);
		}
	});
	it("counts category memberships separately and the default view as a deduplicated union", () => {
		const report = summarizeCoverCollection({
			observations: [{ ...observation, categories: ["life", "recommended"] }],
			cachedEntries: [],
			preparedHashes: [],
			verifications: [],
		});
		expect(report.totals.discovered).toBe(1);
		expect(
			report.categories
				.filter((category) => category.discovered)
				.map((category) => category.id)
		).toEqual(["default", "recommended", "life"]);
	});
	it("does not count cached packages absent from the observed directory", () => {
		expect(
			summarizeCoverCollection({
				observations: [],
				cachedEntries: [cached],
				preparedHashes: [cached.packageHash],
				verifications: [verification],
			}).totals.discovered
		).toBe(0);
	});
});
