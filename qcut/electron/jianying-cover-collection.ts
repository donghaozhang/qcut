import { createHash } from "node:crypto";
import { z } from "zod";
import {
	JIANYING_COVER_CATEGORIES,
	coverObservationsSchema,
	type CoverCachedEntry,
	type CoverObservation,
} from "./jianying-cover-contract.js";

export const coverVerificationSchema = z.object({
	packageHash: z.string().regex(/^[a-f0-9]{32}$/),
	fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
	scope: z.literal("text-layout-render-save-reopen"),
	verifiedAt: z.string().datetime(),
	runtime: z.string().min(1),
	artifacts: z
		.array(
			z.object({
				path: z.string().min(1),
				sha256: z.string().regex(/^[a-f0-9]{64}$/),
			})
		)
		.min(1),
});
export type CoverVerification = z.infer<typeof coverVerificationSchema>;

export function mergeCoverObservations({
	previous,
	incoming,
}: {
	previous: unknown;
	incoming: unknown;
}): CoverObservation[] {
	const entries = new Map<string, CoverObservation>();
	for (const item of [
		...coverObservationsSchema.parse(previous),
		...coverObservationsSchema.parse(incoming),
	]) {
		const existing = entries.get(item.packageHash);
		if (
			existing &&
			(existing.previewHash !== item.previewHash ||
				existing.title !== item.title)
		) {
			throw new Error(
				`Conflicting identity for cover package ${item.packageHash}`
			);
		}
		entries.set(item.packageHash, {
			...item,
			categories: [
				...new Set([...(existing?.categories ?? []), ...item.categories]),
			],
		});
	}
	return [...entries.values()];
}

export function planCoverCollectionBatches({
	observations,
	batchSize = 5,
}: {
	observations: unknown;
	batchSize?: number;
}) {
	if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) {
		throw new Error("Batch size must be an integer from 1 to 25");
	}
	const unique = mergeCoverObservations({
		previous: [],
		incoming: observations,
	});
	const assigned = new Set<string>();
	const batches: { category: string; entries: CoverObservation[] }[] = [];
	for (const category of JIANYING_COVER_CATEGORIES) {
		if (category.id === "default") continue;
		const entries = unique.filter(
			(entry) =>
				entry.categories.includes(category.id) &&
				!assigned.has(entry.packageHash)
		);
		for (const entry of entries) assigned.add(entry.packageHash);
		for (let index = 0; index < entries.length; index += batchSize) {
			batches.push({
				category: category.id,
				entries: entries.slice(index, index + batchSize),
			});
		}
	}
	return batches;
}

export function coverCollectionFingerprint({
	entry,
}: {
	entry: CoverCachedEntry;
}) {
	const dependencies = entry.dependencies
		.map((dependency) => ({
			reference: dependency.reference,
			status: dependency.status,
			files: dependency.files
				.map((file) => [file.logicalPath, file.sha256, file.bytes])
				.sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
		}))
		.sort((a, b) => a.reference.localeCompare(b.reference));
	return createHash("sha256")
		.update(
			JSON.stringify({
				definition: entry.definition.sha256,
				preview: entry.preview.sha256,
				dependencies,
			})
		)
		.digest("hex");
}

export function summarizeCoverCollection({
	observations,
	cachedEntries,
	preparedHashes,
	verifications,
}: {
	observations: unknown;
	cachedEntries: CoverCachedEntry[];
	preparedHashes: string[];
	verifications: CoverVerification[];
}) {
	const unique = mergeCoverObservations({
		previous: [],
		incoming: observations,
	});
	const cached = new Map(
		cachedEntries.map((entry) => [entry.packageHash, entry])
	);
	const prepared = new Set(preparedHashes);
	const evidence = z.array(coverVerificationSchema).parse(verifications);
	const entries = unique.map((observation) => {
		const entry = cached.get(observation.packageHash);
		const fingerprint = entry ? coverCollectionFingerprint({ entry }) : null;
		const applicable = Boolean(entry && prepared.has(observation.packageHash));
		const verification = applicable
			? evidence.find(
					(item) =>
						item.packageHash === observation.packageHash &&
						item.fingerprint === fingerprint
				)
			: undefined;
		return {
			...observation,
			discovered: true,
			cached: Boolean(entry),
			dependenciesComplete: Boolean(
				entry &&
					entry.dependencies.every(
						(item) => item.status === "cached" && item.files.length > 0
					)
			),
			applicable,
			verified: Boolean(verification),
			fingerprint,
			verification: verification ?? null,
			missingDependencies:
				entry?.dependencies
					.filter((item) => item.status !== "cached")
					.map((item) => ({
						reference: item.reference,
						reason: item.reason ?? item.status,
					})) ?? [],
		};
	});
	const count = ({ values }: { values: typeof entries }) => ({
		discovered: values.length,
		cached: values.filter((item) => item.cached).length,
		dependenciesComplete: values.filter((item) => item.dependenciesComplete)
			.length,
		applicable: values.filter((item) => item.applicable).length,
		verified: values.filter((item) => item.verified).length,
	});
	return {
		schema: "qcut.private-cover-collection" as const,
		version: 1,
		coverage: "observed-subset-not-full-online-catalog" as const,
		applicableScope: "prepared-text-layout-not-full-template" as const,
		verifiedScope: "text-layout-render-save-reopen" as const,
		totals: count({ values: entries }),
		categories: JIANYING_COVER_CATEGORIES.map((category) => ({
			...category,
			...count({
				values:
					category.id === "default"
						? entries
						: entries.filter((entry) =>
								entry.categories.some((id) => id === category.id)
							),
			}),
		})),
		entries,
	};
}
