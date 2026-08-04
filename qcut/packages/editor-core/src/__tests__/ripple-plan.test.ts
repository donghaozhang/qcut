import { describe, expect, it } from "vitest";
import {
	deriveTimelineLinks,
	resolveRippleDomain,
	type LinkAwareTrack,
} from "../timeline/ripple-plan.js";

function fixtureTracks(): LinkAwareTrack[] {
	return [
		{
			id: "main",
			type: "media",
			elements: [
				{ id: "v1", groupId: "sep", mediaId: "m1", type: "media" },
				{ id: "v2", type: "media" },
			],
		},
		{
			id: "audio",
			type: "audio",
			elements: [{ id: "a1", groupId: "sep", mediaId: "m1", type: "media" }],
		},
		{
			id: "overlay",
			type: "media",
			elements: [{ id: "o1", type: "media" }],
		},
		{
			id: "text",
			type: "text",
			elements: [{ id: "t1", groupId: "pack" }, { id: "t2" }],
		},
		{
			id: "text-2",
			type: "text",
			elements: [{ id: "t3", groupId: "pack" }],
		},
	];
}

describe("ripple plan", () => {
	it("derives video-audio links for separated audio and group links otherwise", () => {
		const links = deriveTimelineLinks({ tracks: fixtureTracks() });
		expect(links).toContainEqual({
			type: "video-audio",
			fromElementId: "v1",
			toElementId: "a1",
		});
		expect(links).toContainEqual({
			type: "group",
			fromElementId: "t1",
			toElementId: "t3",
		});
		expect(links).toHaveLength(2);
	});

	it("expands the domain one hop along links and skips unrelated tracks", () => {
		const tracks = fixtureTracks();
		const domain = resolveRippleDomain({
			tracks,
			seedTrackIds: ["main"],
			links: deriveTimelineLinks({ tracks }),
		});
		expect(domain.domainTrackIds).toEqual(new Set(["main", "audio"]));
		expect(domain.lockedDependencyTrackIds).toEqual([]);
	});

	it("reports a locked linked dependency instead of including it", () => {
		const tracks = fixtureTracks().map((track) =>
			track.id === "audio" ? { ...track, locked: true } : track
		);
		const domain = resolveRippleDomain({
			tracks,
			seedTrackIds: ["main"],
			links: deriveTimelineLinks({ tracks }),
		});
		expect(domain.domainTrackIds).toEqual(new Set(["main"]));
		expect(domain.lockedDependencyTrackIds).toEqual(["audio"]);
	});

	it("ignores detached links and locked unrelated tracks", () => {
		const tracks = fixtureTracks().map((track) =>
			track.id === "overlay" ? { ...track, locked: true } : track
		);
		const links = deriveTimelineLinks({ tracks }).map((link) =>
			link.type === "video-audio" ? { ...link, detached: true } : link
		);
		const domain = resolveRippleDomain({
			tracks,
			seedTrackIds: ["main"],
			links,
		});
		expect(domain.domainTrackIds).toEqual(new Set(["main"]));
		expect(domain.lockedDependencyTrackIds).toEqual([]);
	});

	it("scopes link expansion to seed elements when provided", () => {
		const tracks = fixtureTracks();
		const domain = resolveRippleDomain({
			tracks,
			seedTrackIds: ["main"],
			seedElementIds: ["v2"],
			links: deriveTimelineLinks({ tracks }),
		});
		expect(domain.domainTrackIds).toEqual(new Set(["main"]));
	});
});
