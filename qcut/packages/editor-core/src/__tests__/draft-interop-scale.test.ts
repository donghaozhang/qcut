import { describe, expect, it } from "vitest";
import {
	diffDraftInteropDocuments,
	parseQCutImportBundleV1,
	type DraftSourceDescriptor,
} from "../draft-interop/index.js";
import {
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
	readRawDraftGraph,
	validateRawDraftGraph,
} from "../jianying-draft/index.js";

/**
 * JYI-018 acceptance (pure-pipeline side): a 10k-segment draft flows
 * through read → validate → normalize → map with zero issues, and every
 * stage stays inside a generous per-stage budget — the assertions catch
 * accidental quadratic blowups, not machine speed.
 */

const TRACK_COUNT = 10;
const SEGMENTS_PER_TRACK = 1000;
const SEGMENT_COUNT = TRACK_COUNT * SEGMENTS_PER_TRACK;
const SEGMENT_DURATION_US = 2_000_000;
/** Generous per-stage ceiling; a linear pipeline runs each stage <1s. */
const STAGE_BUDGET_MS = 10_000;

function createScaleContent(): Record<string, unknown> {
	const tracks: unknown[] = [];
	const videos: unknown[] = [];
	const speeds: unknown[] = [];
	for (let trackIndex = 0; trackIndex < TRACK_COUNT; trackIndex += 1) {
		const segments: unknown[] = [];
		for (
			let segmentIndex = 0;
			segmentIndex < SEGMENTS_PER_TRACK;
			segmentIndex += 1
		) {
			const ordinal = trackIndex * SEGMENTS_PER_TRACK + segmentIndex;
			const materialId = `mat-${ordinal}`;
			const speedId = `speed-${ordinal}`;
			videos.push({
				id: materialId,
				type: "video",
				material_name: `clip-${ordinal}.mp4`,
				duration: SEGMENT_DURATION_US,
				path: `/restricted/assets/clip-${ordinal}.mp4`,
				width: 1920,
				height: 1080,
			});
			speeds.push({ id: speedId, type: "speed", speed: 1, mode: 0 });
			segments.push({
				id: `seg-${ordinal}`,
				material_id: materialId,
				extra_material_refs: [speedId],
				speed: 1,
				source_timerange: { start: 0, duration: SEGMENT_DURATION_US },
				target_timerange: {
					start: segmentIndex * SEGMENT_DURATION_US,
					duration: SEGMENT_DURATION_US,
				},
			});
		}
		tracks.push({ id: `track-${trackIndex}`, type: "video", segments });
	}
	return {
		id: "scale-draft",
		name: "Scale Fixture",
		canvas_config: { width: 1920, height: 1080, ratio: "original" },
		fps: 30,
		duration: SEGMENTS_PER_TRACK * SEGMENT_DURATION_US,
		tracks,
		materials: { videos, speeds },
	};
}

function createSource(): DraftSourceDescriptor {
	return {
		product: "jianying",
		profileId: "jianying-synthetic-plaintext-5.9",
		platform: "macos",
		files: [
			{
				relativePath: "draft_info.json",
				byteLength: 1,
				sha256: "a".repeat(64),
				role: "content",
				classification: "plaintext-json",
			},
		],
	};
}

function timed<Value>({
	label,
	run,
}: {
	label: string;
	run: () => Value;
}): Value {
	const startedAt = performance.now();
	const value = run();
	const elapsedMs = performance.now() - startedAt;
	expect(
		elapsedMs,
		`${label} exceeded its ${STAGE_BUDGET_MS}ms budget`
	).toBeLessThan(STAGE_BUDGET_MS);
	return value;
}

describe("draft interop pipeline at 10k segments", () => {
	it(
		"stays clean and inside per-stage budgets end to end",
		{ timeout: 120_000 },
		() => {
			const content = createScaleContent();

			const graph = timed({
				label: "graph-reader",
				run: () => readRawDraftGraph({ content }),
			});
			expect(graph.segmentsById.size).toBe(SEGMENT_COUNT);
			expect(graph.materialsById.size).toBe(SEGMENT_COUNT * 2);
			expect(graph.readIssues).toEqual([]);
			expect(graph.duplicateIds).toEqual([]);

			const validationIssues = timed({
				label: "validation",
				run: () => validateRawDraftGraph({ graph }),
			});
			expect(validationIssues).toEqual([]);

			const normalized = timed({
				label: "normalize",
				run: () =>
					normalizeRawDraft({
						content,
						source: createSource(),
						contentFileName: "draft_info.json",
					}),
			});
			const document = normalized.document;
			expect(document.issues).toEqual([]);
			expect(
				document.timelines[0].tracks.reduce(
					(total, track) => total + track.segments.length,
					0
				)
			).toBe(SEGMENT_COUNT);
			expect(document.resources).toHaveLength(SEGMENT_COUNT);
			expect(
				Object.keys(normalized.restrictedSourcePathsByResourceId)
			).toHaveLength(SEGMENT_COUNT);
			// RESTRICTED paths stay out of the document even at scale.
			expect(JSON.stringify(document)).not.toContain("/restricted/");

			const plan = timed({
				label: "qcut-mapping",
				run: () => mapInteropDocumentToQCutPlan({ document }),
			});
			expect(plan.tracks).toHaveLength(TRACK_COUNT);
			expect(
				plan.tracks.reduce((total, track) => total + track.elements.length, 0)
			).toBe(SEGMENT_COUNT);
			expect(plan.skipped).toEqual([]);
			expect(plan.resourceIds).toHaveLength(SEGMENT_COUNT);

			const diff = timed({
				label: "semantic-diff",
				run: () =>
					diffDraftInteropDocuments({
						left: document,
						right: JSON.parse(JSON.stringify(document)),
					}),
			});
			expect(diff.identical).toBe(true);
		}
	);

	it(
		"round-trips a 10k-element bundle through the shared parser in budget",
		{ timeout: 120_000 },
		() => {
			const content = createScaleContent();
			const normalized = normalizeRawDraft({
				content,
				source: createSource(),
				contentFileName: "draft_info.json",
			});
			const timelinePlan = mapInteropDocumentToQCutPlan({
				document: normalized.document,
			});
			const internalIdBySemanticId: Record<string, string> = {};
			for (const track of timelinePlan.tracks) {
				internalIdBySemanticId[track.id] = `qcut-${track.id}`;
				for (const element of track.elements) {
					internalIdBySemanticId[element.id] = `qcut-${element.id}`;
				}
			}
			for (const resourceId of timelinePlan.resourceIds) {
				internalIdBySemanticId[resourceId] = `qcut-${resourceId}`;
			}
			const bundle = {
				schemaVersion: 1,
				bundleDigest: "0".repeat(64),
				planToken: "scale-token",
				buildIdentity: { appVersion: "test", interopSchemaVersion: 1 },
				createdAtUnixMilliseconds: 0,
				conflictPolicy: { projectName: "rename" },
				document: normalized.document,
				timelinePlan,
				resourceStaging: timelinePlan.resourceIds.map((resourceId) => ({
					resourceId,
					stagingKey: `import-${resourceId}`,
					kind: "video",
					status: "pending",
				})),
				internalIdBySemanticId,
			};

			const parsed = timed({
				label: "bundle-parse",
				run: () => parseQCutImportBundleV1(JSON.parse(JSON.stringify(bundle))),
			});
			expect(parsed.ok).toBe(true);
			if (parsed.ok) {
				expect(parsed.bundle.resourceStaging).toHaveLength(SEGMENT_COUNT);
			}
		}
	);
});
