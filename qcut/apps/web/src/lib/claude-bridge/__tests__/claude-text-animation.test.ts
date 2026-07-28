import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	TextAnimationsV1,
	TextElement,
	TimelineTrack,
} from "@/types/timeline";
import { applyElementChanges } from "../claude-timeline-bridge-elements";
import {
	formatTracksForExport,
	getClaudeTextProperties,
} from "../claude-timeline-bridge-helpers";

const storeMocks = vi.hoisted(() => {
	const textElement = {
		id: "title",
		type: "text" as const,
		name: "Title",
		content: "QCut",
		fontSize: 48,
		fontFamily: "Inter",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center" as const,
		fontWeight: "normal" as const,
		fontStyle: "normal" as const,
		textDecoration: "none" as const,
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		startTime: 0,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
	};
	const state = {
		tracks: [
			{
				id: "text-track",
				name: "Text",
				type: "text",
				elements: [textElement],
			},
		],
		pushHistory: vi.fn(),
		updateElementStartTime: vi.fn(),
		updateElementTrim: vi.fn(),
		updateElementDuration: vi.fn(),
		updateMarkdownElement: vi.fn(),
		updateTextElement: vi.fn(),
		updateMediaElement: vi.fn(),
		updateMediaTiming: vi.fn(),
	};
	return { state };
});

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: vi.fn(() => storeMocks.state),
	},
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: vi.fn(() => ({ activeProject: { fps: 60 } })),
	},
}));

vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugWarn: vi.fn(),
	debugError: vi.fn(),
}));

function textAnimations(): TextAnimationsV1 {
	return {
		schemaVersion: 1,
		entrance: {
			timing: { duration: 0.5, delay: 0, easing: "linear" },
			sequence: {
				unit: "all",
				order: "forward",
				staggerRatio: 0,
				seed: 12,
			},
			target: "text",
			effect: { kind: "fade", minimumOpacity: 0 },
		},
	};
}

function futureTextAnimations(): TextAnimationsV1 {
	return {
		schemaVersion: 2,
		entrance: { futureEffect: "fold" },
	} as unknown as TextAnimationsV1;
}

describe("Claude text animation bridge", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("normalizes canonical V1 input before it reaches the timeline store", () => {
		const properties = getClaudeTextProperties({
			element: {
				id: "incoming-title",
				textAnimations: {
					schemaVersion: 1,
					entrance: {
						timing: {
							duration: 0.001,
							delay: -1,
							easing: "linear",
						},
						sequence: {
							unit: "all",
							order: "forward",
							staggerRatio: 4,
							seed: 12,
						},
						target: "text",
						effect: { kind: "fade", minimumOpacity: -2 },
					},
				},
			},
			fps: 60,
		});

		expect(properties.textAnimations?.entrance).toMatchObject({
			timing: { duration: 1 / 60, delay: 0 },
			sequence: { staggerRatio: 0.95 },
			effect: { kind: "fade", minimumOpacity: 0 },
		});
	});

	it("rejects malformed and future schemas instead of downgrading them", () => {
		expect(() =>
			getClaudeTextProperties({
				element: {
					id: "invalid-title",
					textAnimations: {
						schemaVersion: 1,
						entrance: { effect: { kind: "unknown" } },
					},
				},
			})
		).toThrow("Invalid QCut text animation configuration");
		expect(() =>
			getClaudeTextProperties({
				element: {
					id: "future-title",
					textAnimations: futureTextAnimations(),
				},
			})
		).toThrow("Unsupported QCut text animation schema version: 2");
		expect(() =>
			getClaudeTextProperties({
				element: {
					id: "non-object-title",
					textAnimations: "fade",
				},
			})
		).toThrow("Invalid QCut text animation configuration");
	});

	it("validates text animation updates before applying any partial mutation", () => {
		const updated = applyElementChanges({
			elementId: "title",
			changes: {
				startTime: 2,
				textAnimations: futureTextAnimations(),
			},
			pushHistory: true,
		});

		expect(updated).toBe(false);
		expect(storeMocks.state.pushHistory).not.toHaveBeenCalled();
		expect(storeMocks.state.updateElementStartTime).not.toHaveBeenCalled();
		expect(storeMocks.state.updateTextElement).not.toHaveBeenCalled();
	});

	it("round-trips canonical text animations in Claude timeline snapshots", () => {
		const element: TextElement = {
			...storeMocks.state.tracks[0].elements[0],
			textAnimations: textAnimations(),
		};
		const tracks: TimelineTrack[] = [
			{
				id: "text-track",
				name: "Text",
				type: "text",
				elements: [element],
			},
		];

		const exported = formatTracksForExport({ tracks, fps: 30 });

		expect(exported[0].elements[0].textAnimations).toEqual(textAnimations());
		expect(exported[0].elements[0].style?.textAnimations).toEqual(
			textAnimations()
		);
	});
});
