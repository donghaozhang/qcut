import { describe, expect, it } from "vitest";
import type { TextElement, TimelineTrack } from "@/types/timeline";
import { buildTextASSOverlay } from "../text-ass-overlay";

function createTextElement(overrides: Partial<TextElement> = {}): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "Text",
		content: "QCut\nStudio",
		fontSize: 48,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		duration: 2,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function createTrack(element: TextElement): TimelineTrack {
	return {
		id: "track-1",
		name: "Text",
		type: "text",
		elements: [element],
	};
}

describe("buildTextASSOverlay", () => {
	it("exports multiline advanced text styling and motion", () => {
		const result = buildTextASSOverlay({
			tracks: [
				createTrack(
					createTextElement({
						rotation: 12,
						letterSpacing: 3,
						strokeWidth: 4,
						strokeColor: "#ffcc00",
						backgroundColor: "#112233",
						backgroundOpacity: 0.7,
						backgroundRadius: 16,
						glowColor: "#00ffff",
						glowOpacity: 0.5,
						glowBlur: 8,
						animationType: "slide-up",
						animationDuration: 0.5,
					})
				),
			],
			canvasWidth: 1920,
			canvasHeight: 1080,
		});

		expect(result.renderedElementIds.has("text-1")).toBe(true);
		expect(result.content).toContain("[V4+ Styles]");
		expect(result.content).toContain("}QCut");
		expect(result.content).toContain("}Studio");
		expect(result.content).toContain("\\frz12");
		expect(result.content).toContain("\\move(");
		expect(result.content).toContain("\\p1");
		expect(result.content).toContain("\\blur8");
		expect(result.content).not.toContain("\\N");
	});

	it("exports curved text as individually positioned characters", () => {
		const result = buildTextASSOverlay({
			tracks: [createTrack(createTextElement({ content: "ARC", curve: 90 }))],
			canvasWidth: 1280,
			canvasHeight: 720,
		});

		expect(result.content.match(/Dialogue: 2/g)).toHaveLength(3);
		expect(result.content).toContain("}A");
		expect(result.content).toContain("}R");
		expect(result.content).toContain("}C");
	});

	it("samples property keyframes at export frame rate", () => {
		const result = buildTextASSOverlay({
			tracks: [
				createTrack(
					createTextElement({
						duration: 1,
						keyframes: {
							x: [
								{ id: "x0", frame: 0, value: -100, easing: "linear" },
								{ id: "x1", frame: 2, value: 100, easing: "linear" },
							],
							rotation: [
								{ id: "r0", frame: 0, value: 0, easing: "linear" },
								{ id: "r1", frame: 2, value: 30, easing: "linear" },
							],
						},
					})
				),
			],
			canvasWidth: 1000,
			canvasHeight: 600,
			fps: 2,
		});

		expect(result.content).toContain("Style: QCutText0");
		expect(result.content).toContain("Style: QCutText1");
		expect(result.content).toContain("\\org(400.00,300.00)");
		expect(result.content).toContain("\\org(500.00,300.00)");
		expect(result.content).toContain("\\pos(400.00,271.20)");
		expect(result.content).toContain("\\pos(500.00,328.80)");
		expect(result.content).toContain("\\frz15");
	});
});
