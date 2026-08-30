import { describe, expect, test } from "bun:test";

import { AUDIO_BASIC_CAPABILITIES } from "./capabilities";
import { summarizeAudioDraftDocuments } from "./draft-samples";
import { buildAudioProbeReport, parseProbeCliOptions } from "./probe-report";
import {
	assessCapabilityStaticEvidence,
	scanCommandTokens,
	type StaticMarkerMatches,
} from "./static-markers";

function completeStaticMatches(): StaticMarkerMatches {
	return {
		creatorStrings: new Set(
			AUDIO_BASIC_CAPABILITIES.flatMap(
				({ staticMarkers }) => staticMarkers.creatorStrings
			)
		),
		videoEditorStrings: new Set(
			AUDIO_BASIC_CAPABILITIES.flatMap(
				({ staticMarkers }) => staticMarkers.videoEditorStrings
			)
		),
		videoEditorSymbols: new Set(
			AUDIO_BASIC_CAPABILITIES.flatMap(
				({ staticMarkers }) => staticMarkers.videoEditorSymbols
			)
		),
	};
}

describe("Jianying basic audio probe", () => {
	test("distinguishes default companions from active audio materials", () => {
		const samples = summarizeAudioDraftDocuments({
			documents: [
				{
					materials: {
						audio_fades: [
							{ fade_in_duration: 0, fade_out_duration: 0 },
							{ fade_in_duration: 500_000, fade_out_duration: 0 },
						],
						loudnesses: [
							{ loudness_param: {} },
							{ loudness_param: { enable: false, target_loudness: 0 } },
							{ loudness_param: { target_loudness: -16 } },
						],
						sound_channel_mappings: [
							{ audio_channel_mapping: 0, is_config_open: false, type: "" },
						],
						vocal_separations: [
							{ choice: 0, production_path: "", removed_sounds: [] },
							{
								choice: 1,
								production_path: "/private/derived.wav",
								removed_sounds: ["music"],
							},
						],
					},
					tracks: [
						{
							segments: [
								{ volume: 1 },
								{ last_nonzero_volume: 1, volume: 0.5 },
							],
						},
					],
				},
			],
		});

		expect(samples.fade).toMatchObject({
			activeMaterialObjects: 1,
			materialObjects: 2,
		});
		expect(samples["channel-mapping"]).toMatchObject({
			activeMaterialObjects: 0,
			materialObjects: 1,
		});
		expect(samples.loudness).toMatchObject({
			activeMaterialObjects: 1,
			materialObjects: 3,
		});
		expect(samples["vocal-separation"]).toMatchObject({
			activeMaterialObjects: 1,
			materialObjects: 2,
		});
		expect(samples.volume).toMatchObject({
			activeSegments: 1,
			segmentsWithFields: 2,
		});
	});

	test("filters marker streams without retaining unrelated binary strings", async () => {
		const matches = await scanCommandTokens({
			args: ["-e", 'process.stdout.write("alpha\\nprivate-path\\nbeta\\n")'],
			command: process.execPath,
			tokens: ["alpha", "gamma"],
		});
		expect([...matches]).toEqual(["alpha"]);
	});

	test("reports missing static markers fail-closed", () => {
		const capability = AUDIO_BASIC_CAPABILITIES.find(
			({ id }) => id === "pitch-shift"
		);
		if (!capability) throw new Error("Pitch-shift capability is missing.");
		const evidence = assessCapabilityStaticEvidence({
			capability,
			matches: {
				creatorStrings: new Set(["AudioPitchShiftViewModel"]),
				videoEditorStrings: new Set(),
				videoEditorSymbols: new Set(),
			},
		});
		expect(evidence.status).toBe("partial");
		expect(evidence.groups.videoEditorSymbols.missing).toContain(
			"lvve::MaterialAudioPitchShift::get_semitones"
		);
	});

	test("builds a path-free report and labels default-only draft evidence", () => {
		const draftSamples = summarizeAudioDraftDocuments({
			documents: [
				{
					materials: {
						sound_channel_mappings: [
							{ audio_channel_mapping: 0, is_config_open: false },
						],
					},
					tracks: [],
				},
			],
		});
		const report = buildAudioProbeReport({
			app: {
				buildVersion: "11.3.0",
				bundleIdentifier: "com.lemon.lvpro",
				version: "11.3.0",
			},
			draftSamples,
			inventory: {
				candidateCount: 1,
				jsonCount: 1,
				lockedProjectCount: 1,
				materialCollections: { sound_channel_mappings: 1 },
				opaqueCount: 0,
				timelineDocumentCount: 1,
			},
			staticMatches: completeStaticMatches(),
		});
		const channel = report.capabilities.find(
			({ id }) => id === "channel-mapping"
		);
		expect(channel?.draftEvidence.status).toBe("default-only");
		expect(report.safety).toEqual({
			includesFilesystemPaths: false,
			modifiesDrafts: false,
		});
		expect(JSON.stringify(report)).not.toContain("/Users/");
	});

	test("parses optional application and draft roots", () => {
		const options = parseProbeCliOptions({
			argv: ["--app", "/tmp/Jianying.app", "--draft-root", "/tmp/drafts"],
		});
		expect(options).toEqual({
			appPath: "/tmp/Jianying.app",
			draftRoot: "/tmp/drafts",
		});
		expect(() => parseProbeCliOptions({ argv: ["--app"] })).toThrow(
			"Missing value for --app"
		);
	});
});
