import { describe, expect, test } from "bun:test";

import { buildTextCompositeCommand } from "./text-parity-composite";

describe("buildTextCompositeCommand", () => {
	test("composites transparent runtime frames at their exact placement", () => {
		const command = buildTextCompositeCommand({
			ffmpegPath: "/tools/ffmpeg",
			framePattern: "/frames/frame-%06d.png",
			outputPath: "/evidence/candidate.mp4",
			canvas: {
				width: 1280,
				height: 720,
				backgroundColor: "#102030",
			},
			placement: { x: 12.5, y: -3.25 },
			frameRate: 30,
			frameCount: 90,
		});

		expect(command[0]).toBe("/tools/ffmpeg");
		expect(command).toContain("color=c=0x102030:s=1280x720:r=30:d=3");
		expect(command).toContain("/frames/frame-%06d.png");
		expect(command).toContain("90");
		expect(command.join(" ")).toContain(
			"overlay=x=12.500000:y=-3.250000:eval=init:eof_action=pass:shortest=1"
		);
		expect(command.at(-1)).toBe("/evidence/candidate.mp4");
	});
});
