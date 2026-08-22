// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildJianyingStudioAnimationEnvironment,
	resolveJianyingStudioScriptRoot,
} from "../jianying-text-runtime/studio-animation-bridge.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryRoots
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

async function runtimeWithSegmentJs({ segments }: { segments: string[] }) {
	const runtimeRoot = await mkdtemp(
		path.join(os.tmpdir(), "qcut-studio-script-")
	);
	temporaryRoots.push(runtimeRoot);
	const scriptRoot = path.join(runtimeRoot, ...segments);
	await mkdir(path.join(scriptRoot, "template"), { recursive: true });
	await writeFile(path.join(scriptRoot, "template", "template.js"), "bridge");
	return { runtimeRoot, scriptRoot };
}

function studioExitAnimation() {
	return {
		slot: "exit" as const,
		animationType: 2 as const,
		loader: "studio" as const,
		packagePath: "/cache/effect/exit/hash",
		resourceId: "1002",
		packageHash: "b".repeat(32),
		duration: 0.75,
		manifest: {
			schemaVersion: 1 as const,
			packageVersion: "test",
			fileCount: 2,
			shaderFileCount: 0,
			meshFileCount: 0,
			renderTargetCount: 0,
			scriptFileCount: 2,
			textureFileCount: 0,
			capabilities: {
				staticTexture: false,
				multipleStrokes: false,
				animationComponents: true,
				scriptInfoSticker: false,
				shaderComponents: false,
				threeDimensional: false,
				feedbackComponents: false,
			},
			fingerprint: "studio-exit",
		},
	};
}

describe("Jianying StudioAnim bridge", () => {
	it.each([
		{
			label: "private backup",
			segments: ["Models", "app-bundle", "SegmentJS"],
		},
		{
			label: "application bundle",
			segments: ["Resources", "models", "SegmentJS"],
		},
	])("resolves the $label layout", async ({ segments }) => {
		const { runtimeRoot, scriptRoot } = await runtimeWithSegmentJs({
			segments,
		});

		expect(resolveJianyingStudioScriptRoot({ runtimeRoot })).toBe(scriptRoot);
	});

	it("places an exit animation at the end of the text timeline", () => {
		const environment = buildJianyingStudioAnimationEnvironment({
			animations: [studioExitAnimation()],
			content: "QCut",
			fontPath: "/fonts/QCut.ttf",
			fontSize: 96,
			packageKind: "TextStyle",
			packagePath: "/cache/artistEffect/2001/hash",
			resourceId: "2001",
			runtimeRoot: "/runtime",
			studioScriptRoot: "/runtime/SegmentJS",
			timelineDuration: 3_000_000,
		});
		expect(JSON.parse(environment.JY_TEXT_SEGMENT_PAYLOAD ?? "")).toEqual({
			richText:
				'<effectStyle id="2001" path="/cache/artistEffect/2001/hash"><font path="/fonts/QCut.ttf"><size=38.4>[QCut]</size></font></effectStyle>',
			version: "2",
		});

		expect(
			JSON.parse(environment.JY_TEXT_STUDIO_ANIMATION_PARAMETERS ?? "")
		).toMatchObject({
			children: [
				{
					anims: [
						{
							anim_type: "out",
							anim_start_time: 2.25,
							duration: 0.75,
							loop_duration: 0,
						},
					],
				},
			],
		});
	});

	it("escapes paths and user text without creating extra rich-text slots", () => {
		const environment = buildJianyingStudioAnimationEnvironment({
			animations: [studioExitAnimation()],
			content: "Q[Cut] <&>",
			fontPath: '/fonts/QCut "CJK" & More.ttf',
			fontSize: 50,
			packageKind: "TextStyle",
			packagePath: "/cache/artistEffect/20'01/A & B",
			resourceId: "20'01",
			runtimeRoot: "/runtime",
			studioScriptRoot: "/runtime/SegmentJS",
			timelineDuration: 3_000_000,
		});

		expect(JSON.parse(environment.JY_TEXT_SEGMENT_PAYLOAD ?? "")).toEqual({
			richText:
				'<effectStyle id="20&apos;01" path="/cache/artistEffect/20&apos;01/A &amp; B"><font path="/fonts/QCut &quot;CJK&quot; &amp; More.ttf"><size=20>[Q［Cut］ &lt;&amp;&gt;]</size></font></effectStyle>',
			version: "2",
		});
	});

	it.each([
		"InfoSticker",
		"ScriptInfoSticker",
	] as const)("rejects an unsupported %s composition explicitly", (packageKind) => {
		expect(() =>
			buildJianyingStudioAnimationEnvironment({
				animations: [studioExitAnimation()],
				content: "QCut",
				fontSize: 96,
				packageKind,
				packagePath: "/cache/artistEffect/2001/hash",
				resourceId: "2001",
				runtimeRoot: "/runtime",
				studioScriptRoot: "/runtime/SegmentJS",
				timelineDuration: 3_000_000,
			})
		).toThrow(packageKind);
	});

	it("rejects a TextStyle without a resource id", () => {
		expect(() =>
			buildJianyingStudioAnimationEnvironment({
				animations: [studioExitAnimation()],
				content: "QCut",
				fontSize: 96,
				packageKind: "TextStyle",
				packagePath: "/cache/artistEffect/2001/hash",
				runtimeRoot: "/runtime",
				studioScriptRoot: "/runtime/SegmentJS",
				timelineDuration: 3_000_000,
			})
		).toThrow("资源 ID");
	});
});
