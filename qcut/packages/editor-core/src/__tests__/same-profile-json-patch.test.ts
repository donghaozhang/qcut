import { describe, expect, it } from "vitest";
import {
	applySameProfileScalarPatches,
	type SameProfileScalarPatch,
} from "../draft-interop/index.js";

function sourceBytes(): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify({
			id: "draft-1",
			unknownTopLevel: {
				kind: "qcut-sentinel",
				payload: [1, { nested: true }],
			},
			tracks: [
				{
					id: "track-1",
					segments: [
						{
							id: "segment-1",
							target_timerange: { start: 0, duration: 3_000_000 },
							unknownSegmentField: {
								styleToken: "preserve-me",
							},
						},
					],
				},
			],
		})
	);
}

function timingPatch(
	overrides: Partial<SameProfileScalarPatch> = {}
): SameProfileScalarPatch {
	return {
		foreignRef: "segment-1:duration",
		file: "draft_info.json",
		jsonPointer: "/tracks/0/segments/0/target_timerange/duration",
		ownerSemanticId: "segment-1",
		domain: "timing",
		expectedValue: 3_000_000,
		nextValue: 4_000_000,
		...overrides,
	};
}

describe("same-profile scalar JSON patch", () => {
	it("patches a known leaf while preserving unknown subtrees and identities", () => {
		const result = applySameProfileScalarPatches({
			patches: [timingPatch()],
			relativePath: "draft_info.json",
			sourceBytes: sourceBytes(),
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const document = JSON.parse(new TextDecoder().decode(result.outputBytes));
		expect(document).toMatchObject({
			id: "draft-1",
			unknownTopLevel: {
				kind: "qcut-sentinel",
				payload: [1, { nested: true }],
			},
			tracks: [
				{
					id: "track-1",
					segments: [
						{
							id: "segment-1",
							target_timerange: { start: 0, duration: 4_000_000 },
							unknownSegmentField: { styleToken: "preserve-me" },
						},
					],
				},
			],
		});
	});

	it("blocks edits that conflict with declared unknown ownership", () => {
		expect(
			applySameProfileScalarPatches({
				patches: [timingPatch()],
				relativePath: "draft_info.json",
				sourceBytes: sourceBytes(),
				unknownSubtrees: [
					{
						foreignRef: "segment-1:opaque-timing",
						ownerSemanticId: "segment-1",
						ownedDomains: ["timing"],
					},
				],
			})
		).toMatchObject({
			ok: false,
			code: "UNKNOWN_SUBTREE_CONFLICT",
			foreignRef: "segment-1:opaque-timing",
		});
	});

	it("allows an unrelated owner domain and keeps its opaque value", () => {
		const result = applySameProfileScalarPatches({
			patches: [timingPatch()],
			relativePath: "draft_info.json",
			sourceBytes: sourceBytes(),
			unknownSubtrees: [
				{
					foreignRef: "segment-1:opaque-style",
					ownerSemanticId: "segment-1",
					ownedDomains: ["style"],
				},
			],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			JSON.parse(new TextDecoder().decode(result.outputBytes))
		).toMatchObject({
			tracks: [
				{
					segments: [{ unknownSegmentField: { styleToken: "preserve-me" } }],
				},
			],
		});
	});

	it("fails atomically when an imported value has drifted", () => {
		const result = applySameProfileScalarPatches({
			patches: [
				timingPatch(),
				timingPatch({
					foreignRef: "segment-1:start",
					jsonPointer: "/tracks/0/segments/0/target_timerange/start",
					expectedValue: 99,
					nextValue: 1_000_000,
				}),
			],
			relativePath: "draft_info.json",
			sourceBytes: sourceBytes(),
		});

		expect(result).toMatchObject({
			ok: false,
			code: "PATCH_PRECONDITION_FAILED",
			foreignRef: "segment-1:start",
		});
	});

	it.each([
		{
			name: "missing path",
			patch: timingPatch({ jsonPointer: "/tracks/9/id" }),
			code: "PATCH_POINTER_MISSING",
		},
		{
			name: "unsafe segment",
			patch: timingPatch({ jsonPointer: "/__proto__/polluted" }),
			code: "PATCH_POINTER_UNSAFE",
		},
		{
			name: "document root",
			patch: timingPatch({ jsonPointer: "" }),
			code: "PATCH_POINTER_INVALID",
		},
		{
			name: "object target",
			patch: timingPatch({
				jsonPointer: "/tracks/0/segments/0/target_timerange",
			}),
			code: "PATCH_TARGET_NOT_SCALAR",
		},
	])("rejects $name", ({ code, patch }) => {
		expect(
			applySameProfileScalarPatches({
				patches: [patch],
				relativePath: "draft_info.json",
				sourceBytes: sourceBytes(),
			})
		).toMatchObject({ ok: false, code });
	});

	it("rejects overlapping and cross-file operations", () => {
		expect(
			applySameProfileScalarPatches({
				patches: [timingPatch(), timingPatch()],
				relativePath: "draft_info.json",
				sourceBytes: sourceBytes(),
			})
		).toMatchObject({ ok: false, code: "PATCH_POINTER_OVERLAP" });

		expect(
			applySameProfileScalarPatches({
				patches: [timingPatch({ file: "draft_content.json" })],
				relativePath: "draft_info.json",
				sourceBytes: sourceBytes(),
			})
		).toMatchObject({ ok: false, code: "PATCH_FILE_MISMATCH" });
	});

	it("rejects scalar type changes", () => {
		expect(
			applySameProfileScalarPatches({
				patches: [timingPatch({ nextValue: "4000000" })],
				relativePath: "draft_info.json",
				sourceBytes: sourceBytes(),
			})
		).toMatchObject({ ok: false, code: "PATCH_VALUE_TYPE_MISMATCH" });
	});
});
