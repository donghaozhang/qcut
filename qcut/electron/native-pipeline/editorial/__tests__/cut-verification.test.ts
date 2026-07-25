import { describe, expect, it } from "vitest";
import { cutVerificationInternals } from "../cut-verification.js";
import { EDIT_DECISION_LIST_VERSION, type EditDecisionList } from "../types.js";

const PIXELS = 160 * 90;

function frame({ value }: { value: number }): Buffer {
	return Buffer.alloc(PIXELS, value);
}

function edlWithTitle({
	title,
}: {
	title?: NonNullable<EditDecisionList["titles"]>[number];
}): EditDecisionList {
	return {
		version: EDIT_DECISION_LIST_VERSION,
		createdAt: "2026-07-24T00:00:00.000Z",
		index: "/tmp/index.json",
		language: "en",
		duration: 12,
		beats: [],
		clips: [
			{
				id: "clip-01",
				source: "a.mp4",
				sourceId: "a",
				start: 0,
				end: 6,
				timelineStart: 0,
				timelineEnd: 6,
				beat: "A",
				beatText: "A",
				reason: "A",
				score: 1,
				motionDirection: "static",
				subjectPosition: "center",
			},
			{
				id: "clip-02",
				source: "b.mp4",
				sourceId: "b",
				start: 0,
				end: 6,
				timelineStart: 6,
				timelineEnd: 12,
				beat: "B",
				beatText: "B",
				reason: "B",
				score: 1,
				motionDirection: "static",
				subjectPosition: "center",
			},
		],
		titles: title ? [title] : undefined,
		warnings: [],
	};
}

describe("editorial cut verification", () => {
	it("does not misclassify a persistent brightness cut as a flash frame", () => {
		const checks = cutVerificationInternals.makeVisualChecks({
			grayscaleFrames: [
				frame({ value: 40 }),
				frame({ value: 40 }),
				frame({ value: 40 }),
				frame({ value: 200 }),
				frame({ value: 200 }),
				frame({ value: 200 }),
			],
		});

		expect(checks.find((check) => check.name === "flash-frame")?.status).toBe(
			"pass"
		);
		expect(checks.find((check) => check.name === "visual-jump")?.status).toBe(
			"warning"
		);
	});

	it("detects a transient frame on one side of a cut", () => {
		const checks = cutVerificationInternals.makeVisualChecks({
			grayscaleFrames: [
				frame({ value: 40 }),
				frame({ value: 220 }),
				frame({ value: 40 }),
				frame({ value: 100 }),
				frame({ value: 100 }),
				frame({ value: 100 }),
			],
		});

		expect(checks.find((check) => check.name === "flash-frame")?.status).toBe(
			"warning"
		);
	});

	it("detects a short audio spike relative to local baseline", () => {
		const pcm = new Int16Array(16_000);
		pcm.fill(200);
		pcm.fill(20_000, 7_900, 8_100);

		expect(
			cutVerificationInternals.audioSpikeRatio({
				pcm,
				windowSeconds: 1,
			})
		).toBeGreaterThan(4);
	});

	it("checks declared title timing and title-safe bounds", () => {
		const unsafe = cutVerificationInternals.titleCheck({
			edl: edlWithTitle({
				title: {
					id: "headline",
					start: 4,
					end: 8,
					x: 0.01,
					y: 0.2,
					width: 0.5,
					height: 0.2,
				},
			}),
			cutTime: 6,
		});
		const absent = cutVerificationInternals.titleCheck({
			edl: edlWithTitle({}),
			cutTime: 6,
		});

		expect(unsafe.status).toBe("warning");
		expect(absent.status).toBe("not-applicable");
	});
});
