import { describe, expect, it } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import {
	localizeSceneName,
	localizeTimelineElementName,
	localizeTrackName,
} from "../timeline-names";

function mediaTrack({
	name,
	isMain = false,
}: {
	name: string;
	isMain?: boolean;
}) {
	return {
		id: "track",
		name,
		type: "media",
		elements: [],
		isMain,
	} satisfies TimelineTrack;
}

describe("localized timeline names", () => {
	it("translates legacy system names without changing custom names", () => {
		expect(
			localizeTrackName({
				track: mediaTrack({ name: "视频轨道" }),
				locale: "en",
			})
		).toBe("Media track");
		expect(
			localizeTrackName({
				track: mediaTrack({ name: "Media Track" }),
				locale: "zh",
			})
		).toBe("视频轨道");
		expect(
			localizeTrackName({
				track: mediaTrack({ name: "Camera A" }),
				locale: "zh",
			})
		).toBe("Camera A");
	});

	it("localizes main tracks, containers, and scenes", () => {
		expect(
			localizeTrackName({
				track: mediaTrack({ name: "主轨道", isMain: true }),
				locale: "en",
			})
		).toBe("Main track");
		expect(
			localizeTimelineElementName({
				name: "复合片段（2 个片段）",
				locale: "en",
			})
		).toBe("Compound (2 clips)");
		expect(localizeSceneName({ name: "Main scene", locale: "zh" })).toBe(
			"主场景"
		);
	});
});
