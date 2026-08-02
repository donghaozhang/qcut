import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import path from "node:path";
import {
	classifyTransitionPackage,
	resolveTransitionPackages,
	type TransitionPackageFamily,
} from "../transition-package";
import {
	createTempRoot,
	writeJsonFile,
	writeTextFile,
} from "./test-helpers";

const tempRoots: string[] = [];

afterEach(() => {
	for (const tempRoot of tempRoots.splice(0)) {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

function writePackageBase({ packagePath }: { packagePath: string }) {
	writeJsonFile({
		filePath: path.join(packagePath, "config.json"),
		value: {
			ae_tool: "AmazingEditor",
			version: "1",
			effect: { Link: [{ type: "AmazingAuto", path: "AmazingAuto_out" }] },
		},
	});
	writeJsonFile({
		filePath: path.join(packagePath, "extra.json"),
		value: { transition: { defaultDura: 1, isOverlap: true } },
	});
}

function writeSimplePackage({ packagePath }: { packagePath: string }) {
	writePackageBase({ packagePath });
	writeJsonFile({
		filePath: path.join(
			packagePath,
			"AmazingAuto_out",
			"xshader",
			"generalEffect.json"
		),
		value: { progress: { type: "Linear" } },
	});
	writeTextFile({
		filePath: path.join(
			packagePath,
			"AmazingAuto_out",
			"xshader",
			"resource",
			"transition.frag"
		),
		content:
			"uniform sampler2D #TransitionInput0; uniform sampler2D #TransitionInput1; float frameTimestamp; vec4 outputTex = mix(a, b, easeInOutQuint(frameTimestamp));",
	});
}

function writeFamilyMarker({
	packagePath,
	family,
}: {
	packagePath: string;
	family: TransitionPackageFamily;
}) {
	writePackageBase({ packagePath });
	const markerByFamily: Partial<Record<TransitionPackageFamily, string>> = {
		"lua-pipeline": "lua/TransitionScript.lua",
		"lumi-ae": "lua/LumiFamily/LumiExportData.lua",
		"sequence-composite": "seq/light.seq",
		threejs: "js/ThreeJS/scriptScene.js",
	};
	const marker = markerByFamily[family];
	if (!marker) throw new Error(`No test marker for ${family}`);
	writeTextFile({
		filePath: path.join(packagePath, marker),
		content: family === "threejs" ? "TWEEN.Sinusoidal.InOut" : family,
	});
}

describe("transition package classification", () => {
	test("detects dual-input GLSL math and internal easing", () => {
		const tempRoot = createTempRoot({ prefix: "jy-transition-package-" });
		tempRoots.push(tempRoot);
		const packagePath = path.join(tempRoot, "effect", "100", "hash-a");
		writeSimplePackage({ packagePath });

		const summary = classifyTransitionPackage({ packagePath });

		expect(summary.primaryFamily).toBe("simple-glsl");
		expect(summary.protocol).toMatchObject({
			transitionInput0: true,
			transitionInput1: true,
			normalizedProgress: true,
			outputRenderTarget: true,
			easingSignals: ["Linear", "easeInOutQuint"],
			mathSignals: ["linear-mix"],
		});
		expect(summary.transitionDefaults).toEqual({
			durationSeconds: 1,
			isOverlap: true,
		});
	});

	for (const family of [
		"lua-pipeline",
		"lumi-ae",
		"sequence-composite",
		"threejs",
	] as const) {
		test(`detects ${family}`, () => {
			const tempRoot = createTempRoot({ prefix: `jy-transition-${family}-` });
			tempRoots.push(tempRoot);
			const packagePath = path.join(tempRoot, "effect", "200", family);
			writeFamilyMarker({ packagePath, family });
			expect(classifyTransitionPackage({ packagePath }).primaryFamily).toBe(
				family
			);
		});
	}

	test("deduplicates equivalent cache mirrors without hiding their paths", () => {
		const tempRoot = createTempRoot({ prefix: "jy-transition-mirrors-" });
		tempRoots.push(tempRoot);
		const cacheRoot = path.join(tempRoot, "cache");
		const mirrorCacheRoot = path.join(tempRoot, "mirror-cache");
		const cachedPackage = path.join(cacheRoot, "effect", "100", "hash-a");
		const mirroredPackage = path.join(
			mirrorCacheRoot,
			"effect",
			"100",
			"hash-a"
		);
		writeSimplePackage({ packagePath: cachedPackage });
		writeSimplePackage({ packagePath: mirroredPackage });

		const resolution = resolveTransitionPackages({
			cacheRoot,
			cacheRoots: [mirrorCacheRoot],
			resourceIds: ["100"],
			metadataMd5: "hash-a",
		});

		expect(resolution.state).toBe("found");
		expect(resolution.candidatePaths).toHaveLength(2);
		expect(resolution.packages).toHaveLength(1);
		expect(resolution.packages[0]?.equivalentPaths).toEqual(
			[cachedPackage, mirroredPackage].sort()
		);
	});
});
