import { describe, expect, it } from "vitest";
import {
	buildTextAss,
	collectTextOverlays,
} from "../claude/handlers/claude-export-handler/text-overlay.js";
import type { ClaudeTimeline } from "../types/claude-api.js";

describe("native export text overlays", () => {
	it("collects full text styling and ignores hidden text", () => {
		const timeline: ClaudeTimeline = {
			name: "Text audit",
			duration: 4,
			width: 1920,
			height: 1080,
			fps: 30,
			tracks: [
				{
					id: "titles",
					index: 0,
					name: "Titles",
					type: "text",
					elements: [
						{
							id: "title-1",
							trackIndex: 0,
							startTime: 0.5,
							endTime: 3.5,
							duration: 3,
							type: "text",
							content: "QCut\nCLI",
							fontSize: 72,
							fontFamily: "Helvetica Neue",
							color: "#ffcc00",
							backgroundColor: "#101010",
							backgroundOpacity: 0.8,
							fontWeight: "bold",
							fontStyle: "italic",
							x: 120,
							y: -80,
							rotation: 6,
							strokeWidth: 3,
							animationType: "fade",
							animationDuration: 0.4,
						},
						{
							id: "hidden",
							trackIndex: 0,
							startTime: 0,
							endTime: 1,
							duration: 1,
							type: "text",
							content: "Do not export",
							hidden: true,
						},
					],
				},
			],
		};

		const overlays = collectTextOverlays(timeline);
		expect(overlays).toHaveLength(1);
		expect(overlays[0]).toEqual(
			expect.objectContaining({
				content: "QCut\nCLI",
				fontSize: 72,
				color: "#ffcc00",
				backgroundOpacity: 0.8,
				fontWeight: "bold",
				animationType: "fade",
			})
		);

		const ass = buildTextAss({ overlays, width: 1920, height: 1080 });
		expect(ass).toContain("PlayResX: 1920");
		expect(ass).toContain("Helvetica Neue,72");
		expect(ass).toContain("\\pos(1080.00,460.00)");
		expect(ass).toContain("\\frz-6.00\\fad(400,0)");
		expect(ass).toContain("QCut\\NCLI");
		expect(ass).not.toContain("Do not export");
	});
});
