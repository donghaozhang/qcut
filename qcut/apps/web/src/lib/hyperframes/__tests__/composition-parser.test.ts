import { describe, expect, it } from "vitest";
import { parseHyperframesComposition } from "../composition-parser";
import { HyperframesParseError } from "../types";

const VALID_HTML = `<!doctype html>
<html
  data-composition-variables='[
    {"id":"title","type":"string","label":"Title","default":"Hello","maxLength":40},
    {"id":"accent","type":"color","label":"Accent","default":"#00d4ff"},
    {"id":"count","type":"number","label":"Count","default":3,"min":1,"max":10},
    {"id":"enabled","type":"boolean","label":"Enabled","default":true}
  ]'
>
  <head><title>Launch title</title></head>
  <body>
    <main
      data-composition-id="launch"
      data-start="0"
      data-duration="4"
      data-width="1280"
      data-height="720"
      data-fps="60"
    >
      <div data-start="0" data-duration="4">Hello</div>
    </main>
  </body>
</html>`;

describe("parseHyperframesComposition", () => {
	it("uses the official metadata contract", () => {
		const composition = parseHyperframesComposition({
			html: VALID_HTML,
			sourcePath: "/projects/launch/index.html",
			projectPath: "/projects/launch",
		});

		expect(composition).toMatchObject({
			id: "launch",
			name: "Launch title",
			duration: 4,
			durationIsEstimated: false,
			width: 1280,
			height: 720,
			fps: 60,
			sourcePath: "/projects/launch/index.html",
			projectPath: "/projects/launch",
		});
		expect(composition.defaultVariableValues).toEqual({
			title: "Hello",
			accent: "#00d4ff",
			count: 3,
			enabled: true,
		});
		expect(composition.variables[0]).toMatchObject({
			id: "title",
			maxLength: 40,
		});
		expect(composition.variables[2]).toMatchObject({
			min: 1,
			max: 10,
		});
	});

	it("infers duration from the official clip-based document shape", () => {
		const composition = parseHyperframesComposition({
			html: `<!doctype html>
				<html lang="en">
					<head>
						<meta
							data-composition-id="quickstart"
							data-width="1920"
							data-height="1080"
						/>
						<title>Quickstart</title>
					</head>
					<body>
						<div id="stage">
							<img
								id="image"
								data-start="2"
								data-duration="7"
								data-track-index="0"
								src="image.png"
							/>
						</div>
					</body>
				</html>`,
			sourcePath: "/projects/quickstart/index.html",
			projectPath: "/projects/quickstart",
		});

		expect(composition).toMatchObject({
			id: "quickstart",
			duration: 9,
			durationIsEstimated: true,
			width: 1920,
			height: 1080,
		});
	});

	it("infers a pure animation duration from static GSAP calls", () => {
		const composition = parseHyperframesComposition({
			html: `<!doctype html>
				<html>
					<head>
						<meta
							data-composition-id="animated"
							data-width="1080"
							data-height="1080"
						/>
					</head>
					<body>
						<div id="stage"><div id="title">Title</div></div>
						<script>
							const tl = gsap.timeline({ paused: true });
							tl.to("#title", { opacity: 1, duration: 1.5 }, 0);
							tl.to("#title", { opacity: 0, duration: 0.5 }, 4);
						</script>
					</body>
				</html>`,
			sourcePath: "/projects/animated/index.html",
			projectPath: "/projects/animated",
		});

		expect(composition.duration).toBe(4.5);
		expect(composition.durationIsEstimated).toBe(true);
	});

	it("reads canonical root dimensions and non-root variable declarations", () => {
		const composition = parseHyperframesComposition({
			html: `<!doctype html>
				<html
					data-composition-id="portrait"
					data-composition-duration="3"
					data-composition-width="1080"
					data-composition-height="1920"
				>
					<head></head>
					<body>
						<div
							id="stage"
							data-composition-variables='[
								{"id":"subtitle","type":"string","label":"Subtitle","default":"Hi"}
							]'
						></div>
					</body>
				</html>`,
			sourcePath: "/projects/portrait/index.html",
			projectPath: "/projects/portrait",
		});

		expect(composition).toMatchObject({
			id: "portrait",
			duration: 3,
			durationIsEstimated: false,
			width: 1080,
			height: 1920,
			defaultVariableValues: { subtitle: "Hi" },
		});
	});

	it("uses stable display and geometry defaults", () => {
		const composition = parseHyperframesComposition({
			html: VALID_HTML.replace("<title>Launch title</title>", "")
				.replace(' data-width="1280"', "")
				.replace(' data-height="720"', "")
				.replace(' data-fps="60"', ""),
			sourcePath: "C:\\motion\\intro.html",
			projectPath: "C:\\motion",
		});

		expect(composition.name).toBe("intro");
		expect(composition.width).toBe(1920);
		expect(composition.height).toBe(1080);
		expect(composition.fps).toBe(30);
	});

	it("reports empty input with a typed error", () => {
		expect(() =>
			parseHyperframesComposition({
				html: " ",
				sourcePath: "/empty.html",
				projectPath: "/",
			})
		).toThrow(HyperframesParseError);
	});
});
