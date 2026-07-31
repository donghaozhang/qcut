import { describe, expect, it } from "vitest";
import {
	buildCapCut81Draft,
	buildJianyingDraft,
	composeCapCut81BuildResultContent,
	validateJianyingDraftContent,
} from "../jianying-draft/index.js";
import {
	CAPCUT_NATIVE_DISSOLVE_METADATA,
	JIANYING_NATIVE_DISSOLVE_METADATA,
} from "../jianying-draft/transition-mapping.js";
import type {
	JianyingDraftContent,
	QCutDraftExportMedia,
	QCutDraftExportSnapshotV1,
} from "../jianying-draft/types.js";
import type {
	ClipTransition,
	MediaElement,
	TimelineTrack,
} from "../types/timeline.js";

const videoMedia: QCutDraftExportMedia = {
	duration: 12,
	height: 1080,
	id: "video-1",
	name: "clip.mov",
	sourcePath: "/source/clip.mov",
	type: "video",
	width: 1920,
};

function createMediaElement({
	id,
	startTime,
}: {
	id: string;
	startTime: number;
}): MediaElement {
	return {
		duration: 3,
		id,
		mediaId: videoMedia.id,
		name: videoMedia.name,
		startTime,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
}

function createDissolve({
	duration = 0.5,
	easing = "easeInOut",
	presetId = "dissolve",
	type = "dissolve",
}: {
	duration?: number;
	easing?: ClipTransition["easing"];
	presetId?: string;
	type?: ClipTransition["type"];
} = {}): ClipTransition {
	return {
		duration,
		easing,
		fromElementId: "clip-1",
		id: "transition-1",
		presetId,
		toElementId: "clip-2",
		type,
	};
}

function createSnapshot({
	first = createMediaElement({ id: "clip-1", startTime: 0 }),
	second = createMediaElement({ id: "clip-2", startTime: 3 }),
	transition = createDissolve(),
}: {
	first?: MediaElement;
	second?: MediaElement;
	transition?: ClipTransition;
} = {}): QCutDraftExportSnapshotV1 {
	const track: TimelineTrack = {
		elements: [first, second],
		id: "track-1",
		name: "Main",
		order: 0,
		transitions: [transition],
		type: "media",
	};
	return {
		media: [videoMedia],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project-1",
			name: "Native transition",
			sceneId: "scene-1",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {
			[first.id]: 3,
			[second.id]: 3,
		},
		tracks: [track],
	};
}

function buildTransitionDraft({
	snapshot = createSnapshot(),
}: {
	snapshot?: QCutDraftExportSnapshotV1;
} = {}) {
	return buildJianyingDraft({
		draftOutputDirectory: "/exports/native-transition",
		snapshot,
		targetPlatform: "macos",
	});
}

describe("verified native CapCut transition mapping", () => {
	it("maps exact profile-specific dissolve metadata", () => {
		const result = buildTransitionDraft();

		expect(result.canWrite).toBe(true);
		expect(result.compatibility).toMatchObject({
			appSource: "lv",
			appVersion: "5.9.0",
		});
		expect(result.content.materials.transitions).toEqual([
			{
				category_id: "",
				category_name: "",
				duration: 500_000,
				effect_id: JIANYING_NATIVE_DISSOLVE_METADATA.effectId,
				id: expect.stringMatching(
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
				),
				is_overlap: true,
				name: "叠化",
				platform: "all",
				resource_id: JIANYING_NATIVE_DISSOLVE_METADATA.resourceId,
				type: "transition",
			},
		]);
		const transitionId = result.content.materials.transitions[0]?.id;
		expect(
			result.content.tracks[0]?.segments[0]?.extra_material_refs
		).toContain(transitionId);
		expect(
			result.content.tracks[0]?.segments[1]?.extra_material_refs
		).not.toContain(transitionId);
		expect(validateJianyingDraftContent({ content: result.content })).toEqual(
			[]
		);

		const modernContent = composeCapCut81BuildResultContent({
			buildResult: result,
			placeholderId: "11111111-2222-4333-8444-555555555555",
			targetPlatform: "macos",
			timelineId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
		});
		expect(modernContent.platform).toMatchObject({
			app_source: "cc",
			app_version: "8.1.1",
		});
		expect(modernContent.materials.transitions).toEqual([
			{
				...result.content.materials.transitions[0],
				duration: CAPCUT_NATIVE_DISSOLVE_METADATA.defaultDuration,
				effect_id: CAPCUT_NATIVE_DISSOLVE_METADATA.effectId,
				is_overlap: false,
				name: "Dissolve",
				resource_id: CAPCUT_NATIVE_DISSOLVE_METADATA.resourceId,
			},
		]);

		const capCutBuild = buildCapCut81Draft({
			draftOutputDirectory: "/exports/capcut-native-transition",
			placeholderId: "11111111-2222-4333-8444-555555555555",
			snapshot: createSnapshot(),
			targetPlatform: "macos",
			timelineId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
		});
		expect(capCutBuild.canWrite).toBe(true);
		expect(capCutBuild.issues).toContainEqual({
			code: "CAPCUT_8_1_TRANSITION_DURATION_CANONICALIZED",
			message:
				"CapCut 8.1 uses its verified 466666µs native Dissolve duration instead of QCut's 500000µs duration.",
			severity: "warning",
			trackId: "track-1",
		});
	});

	it.each([
		{
			label: "another dissolve presentation",
			transition: createDissolve({ presetId: "soft-dissolve" }),
		},
		{
			label: "another transition type",
			transition: createDissolve({ presetId: "wipe", type: "wipe" }),
		},
		{
			label: "unverified easing",
			transition: createDissolve({ easing: "linear" }),
		},
		{
			label: "transition tuning",
			transition: { ...createDissolve(), tuning: { intensity: 0.8 } },
		},
	])("blocks $label rather than silently approximating it", ({
		transition,
	}) => {
		const result = buildTransitionDraft({
			snapshot: createSnapshot({ transition }),
		});

		expect(result.canWrite).toBe(false);
		expect(result.content.materials.transitions).toEqual([]);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_TRACK_TRANSITION",
				severity: "error",
			})
		);
	});

	it("blocks invalid seams and duration clamping", () => {
		const gapped = buildTransitionDraft({
			snapshot: createSnapshot({
				second: createMediaElement({ id: "clip-2", startTime: 4 }),
			}),
		});
		const clamped = buildTransitionDraft({
			snapshot: createSnapshot({
				first: {
					...createMediaElement({ id: "clip-1", startTime: 0 }),
					duration: 0.2,
				},
				second: {
					...createMediaElement({ id: "clip-2", startTime: 0.2 }),
					duration: 0.2,
				},
				transition: createDissolve({ duration: 1 }),
			}),
		});

		for (const result of [gapped, clamped]) {
			expect(result.canWrite).toBe(false);
			expect(result.content.materials.transitions).toEqual([]);
			expect(result.issues).toContainEqual(
				expect.objectContaining({
					code: "INVALID_TRACK_TRANSITION",
					severity: "error",
				})
			);
		}
	});

	it("blocks adjacent transitions that overrun their shared clip", () => {
		const first = {
			...createMediaElement({ id: "clip-1", startTime: 0 }),
			duration: 0.2,
		};
		const second = {
			...createMediaElement({ id: "clip-2", startTime: 0.2 }),
			duration: 0.2,
		};
		const third = {
			...createMediaElement({ id: "clip-3", startTime: 0.4 }),
			duration: 0.2,
		};
		const snapshot = createSnapshot({
			first,
			second,
			transition: createDissolve({ duration: 0.3 }),
		});
		const track = snapshot.tracks[0];
		if (!track) throw new Error("Missing test track");
		track.elements.push(third);
		track.transitions?.push({
			...createDissolve({ duration: 0.3 }),
			fromElementId: second.id,
			id: "transition-2",
			toElementId: third.id,
		});
		snapshot.timelineDurationByElementId[third.id] = third.duration;

		const result = buildTransitionDraft({ snapshot });

		expect(result.canWrite).toBe(false);
		expect(result.content.materials.transitions).toEqual([]);
		expect(
			result.issues.filter(({ code }) => code === "INVALID_TRACK_TRANSITION")
		).toHaveLength(2);
	});

	it("validates transition companion references and placement", () => {
		const result = buildTransitionDraft();
		const transition = result.content.materials.transitions[0];
		const firstTrack = result.content.tracks[0];
		const contentWithoutMaterial: JianyingDraftContent = {
			...result.content,
			materials: {
				...result.content.materials,
				transitions: [],
			},
		};
		const contentOnLastSegment: JianyingDraftContent = {
			...result.content,
			tracks: [
				{
					...firstTrack,
					segments: firstTrack?.segments.map((segment, index) => ({
						...segment,
						extra_material_refs:
							index === 0
								? segment.extra_material_refs.filter(
										(referenceId) => referenceId !== transition?.id
									)
								: [...segment.extra_material_refs, transition?.id ?? ""],
					})),
				},
			],
		};
		const contentWithUnverifiedMaterial: JianyingDraftContent = {
			...result.content,
			materials: {
				...result.content.materials,
				transitions: transition
					? [{ ...transition, effect_id: "unverified" }]
					: [],
			},
		};

		expect(
			validateJianyingDraftContent({ content: contentWithoutMaterial })
		).toContainEqual(
			expect.objectContaining({
				code: "MISSING_EXTRA_MATERIAL_REFERENCE",
			})
		);
		expect(
			validateJianyingDraftContent({ content: contentOnLastSegment })
		).toContainEqual(
			expect.objectContaining({
				code: "INVALID_TRANSITION_PLACEMENT",
			})
		);
		expect(
			validateJianyingDraftContent({
				content: contentWithUnverifiedMaterial,
			})
		).toContainEqual(
			expect.objectContaining({
				code: "UNVERIFIED_TRANSITION_MATERIAL",
			})
		);
	});

	it("blocks active masks because common_mask lacks verified 8.1 evidence", () => {
		const snapshot = createSnapshot();
		const first = snapshot.tracks[0]?.elements[0];
		if (first?.type !== "media") throw new Error("Missing test media element");
		first.mask = {
			centerX: 0.5,
			centerY: 0.5,
			feather: 0,
			height: 0.5,
			invert: false,
			rotation: 0,
			type: "ellipse",
			width: 0.5,
		};
		const result = buildTransitionDraft({ snapshot });

		expect(result.canWrite).toBe(false);
		expect(result.content.materials.masks).toEqual([]);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_MEDIA_FEATURE",
				elementId: first.id,
				message: "Masks and cutouts need a JianYing-native mapping or baking.",
				severity: "error",
			})
		);
		expect(result.content.materials.transitions).toEqual([]);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNMAPPED_TRANSITION_ENDPOINT",
				severity: "error",
			})
		);
	});

	it.each([
		{
			apply: ({ element }: { element: MediaElement }) => {
				element.effectIds = ["effect-1"];
			},
			label: "effect",
			message: "QCut effects are not represented in the plaintext baseline.",
		},
		{
			apply: ({ element }: { element: MediaElement }) => {
				element.adjustments = {
					brightness: 10,
					contrast: 0,
					fade: 0,
					saturation: 0,
					sharpness: 0,
					temperature: 0,
					tint: 0,
					vignette: 0,
				};
			},
			label: "color adjustment",
			message: "Color adjustments need a JianYing-native mapping or baking.",
		},
		{
			apply: ({ element }: { element: MediaElement }) => {
				element.audioFadeIn = 0.25;
			},
			label: "advanced audio",
			message: "Advanced QCut audio processing is not mapped yet.",
		},
	])("blocks active $label state", ({ apply, message }) => {
		const snapshot = createSnapshot();
		const first = snapshot.tracks[0]?.elements[0];
		if (first?.type !== "media") throw new Error("Missing test media element");
		apply({ element: first });

		const result = buildTransitionDraft({ snapshot });

		expect(result.canWrite).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_MEDIA_FEATURE",
				elementId: first.id,
				message,
				severity: "error",
			})
		);
	});

	it("blocks project background and track audio processing", () => {
		const snapshot = createSnapshot();
		snapshot.project.backgroundColor = "#000000";
		const track = snapshot.tracks[0];
		if (!track) throw new Error("Missing test track");
		track.audioCrossfades = [
			{
				curve: "equal-power",
				duration: 0.5,
				fromElementId: "clip-1",
				id: "audio-crossfade-1",
				toElementId: "clip-2",
			},
		];

		const result = buildTransitionDraft({ snapshot });

		expect(result.canWrite).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_PROJECT_BACKGROUND",
				severity: "error",
			})
		);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_TRACK_AUDIO_MIX",
				severity: "error",
			})
		);
	});
});
