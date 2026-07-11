import { describe, expect, it } from "vitest";
import type { TextElement } from "@/types/timeline";
import { convertTextElementToDrawtext } from "../text-overlay";

const createTextElement = (
	overrides: Partial<TextElement> = {}
): TextElement => ({
	id: "text-1",
	type: "text",
	name: "Text",
	content: "Hello\nworld",
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
	duration: 5,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
	...overrides,
});

describe("convertTextElementToDrawtext", () => {
	it("does not add an invisible hard-coded stroke", () => {
		const filter = convertTextElementToDrawtext(createTextElement(), "darwin");

		expect(filter).not.toContain("borderw=");
		expect(filter).toContain("line_spacing=10");
		expect(filter).toContain("x='w/2-(text_w/2)'");
		expect(filter).toContain("y='h/2-(text_h/2)'");
	});

	it("exports configured stroke, shadow, background, and box alignment", () => {
		const filter = convertTextElementToDrawtext(
			createTextElement({
				width: 800,
				height: 240,
				backgroundColor: "#123456",
				backgroundOpacity: 0.75,
				backgroundPadding: 20,
				strokeColor: "#ff0000",
				strokeWidth: 3,
				strokeOpacity: 0.5,
				shadowColor: "#00ff00",
				shadowOpacity: 0.4,
				shadowOffsetX: 6,
				shadowOffsetY: -4,
				textAlign: "right",
				verticalAlign: "bottom",
			}),
			"darwin"
		);

		expect(filter).toContain("borderw=3");
		expect(filter).toContain("bordercolor=0xff0000@0.5");
		expect(filter).toContain("shadowcolor=0x00ff00@0.4");
		expect(filter).toContain("shadowx=6");
		expect(filter).toContain("shadowy=-4");
		expect(filter).toContain("boxcolor=0x123456@0.75");
		expect(filter).toContain("boxborderw=20");
		expect(filter).toContain("-text_w");
		expect(filter).toContain("-text_h");
	});

	it("exports text entrance animation expressions", () => {
		const filter = convertTextElementToDrawtext(
			createTextElement({
				animationType: "slide-up",
				animationDuration: 1,
				animationDelay: 0.25,
				opacity: 0.8,
			}),
			"darwin"
		);

		expect(filter).toContain("alpha='(");
		expect(filter).toContain("*0.8'");
		expect(filter).toContain("80*(1-");
	});

	it("exports property keyframes with the requested fps", () => {
		const filter = convertTextElementToDrawtext(
			createTextElement({
				keyframes: {
					x: [
						{ id: "x-1", frame: 0, value: -100, easing: "linear" },
						{ id: "x-2", frame: 60, value: 200, easing: "easeOut" },
					],
					opacity: [
						{ id: "o-1", frame: 0, value: 0, easing: "linear" },
						{ id: "o-2", frame: 30, value: 1, easing: "linear" },
					],
				},
			}),
			"darwin",
			60
		);

		expect(filter).toContain("w/2+(if(lt(t,0),-100");
		expect(filter).toContain("lt(t,1)");
		expect(filter).toContain("alpha='");
	});
});
