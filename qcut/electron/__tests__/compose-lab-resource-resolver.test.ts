import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { JIANYING_TRANSITIONS } from "../jianying-transition-catalog.js";
import { buildJianyingRuntimeStatus } from "../jianying-transition/runtime-discovery.js";
import {
	materializeComposeSoundLabReference,
	parseSoundEffectsLabAssetId,
	resolveComposeSoundLabReference,
	resolveComposeTransitionReference,
} from "../native-pipeline/compose/compose-lab-resource-resolver.js";
import { TRANSITION_LAB_RECIPES } from "../native-pipeline/transitions/transition-lab-catalog.js";

let directory = "";

const reusableSound = {
	id: "impact-1",
	name: "Impact",
	durationSeconds: 1.25,
	tags: ["impact"],
	categoryIds: ["hits"],
	fileName: "impact.wav",
	objectKey: "private/impact.wav",
	byteSize: 4,
	provider: "freesound" as const,
	redistribution: "allowed" as const,
	reusable: true,
};

const soundReference = {
	provider: "qcut" as const,
	assetType: "sound-effect" as const,
	assetId: "sound-effects-lab:impact-1",
};

beforeAll(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-compose-lab-"));
});

afterAll(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

describe("Sound Effects Lab resolution", () => {
	it("parses only stable Sound Effects Lab identities", () => {
		expect(
			parseSoundEffectsLabAssetId({
				assetId: "sound-effects-lab:impact-1",
			})
		).toBe("impact-1");
		expect(parseSoundEffectsLabAssetId({ assetId: "sound-effects-lab:" })).toBe(
			null
		);
		expect(parseSoundEffectsLabAssetId({ assetId: "impact-1" })).toBe(null);
	});

	it("materializes reusable audio and computes evidence from written bytes", async () => {
		const resolveSound = vi.fn(async () => reusableSound);
		const materializeSound = vi.fn(async ({
			destinationPath,
		}: {
			destinationPath: string;
		}) => {
			fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
			fs.writeFileSync(destinationPath, Buffer.from([1, 2, 3, 4]));
			return destinationPath;
		});
		const materialized = await materializeComposeSoundLabReference({
			reference: soundReference,
			scratchDirectory: directory,
			dependencies: { resolveSound, materializeSound },
		});
		expect(resolveSound).toHaveBeenCalledWith(
			expect.objectContaining({ assetId: "impact-1" })
		);
		expect(materializeSound).toHaveBeenCalledOnce();
		expect(materialized).toMatchObject({
			bytes: 4,
			asset: { id: "impact-1", reusable: true },
		});
		expect(materialized?.sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(materialized?.localPath).toContain(directory);
	});

	it("keeps Jianying references out of reusable projects", async () => {
		const restricted = {
			...reusableSound,
			provider: "jianying-reference" as const,
			redistribution: "prohibited" as const,
			reusable: false,
		};
		const resolveSound = vi.fn(async () => restricted);
		const resolution = await resolveComposeSoundLabReference({
			reference: soundReference,
			dependencies: { resolveSound },
		});
		expect(resolution).toMatchObject({
			status: "reference-only",
			asset: { provider: "jianying-reference" },
		});
		await expect(
			materializeComposeSoundLabReference({
				reference: soundReference,
				scratchDirectory: directory,
				dependencies: { resolveSound },
			})
		).rejects.toThrow("reference-only");
	});
});

describe("transition runtime admission", () => {
	it("resolves every QCut clean-room transition recipe", async () => {
		const resolutions = await Promise.all(
			TRANSITION_LAB_RECIPES.map(({ id }) =>
				resolveComposeTransitionReference({ assetId: id })
			)
		);
		expect(resolutions).toHaveLength(6);
		expect(resolutions).toEqual(
			expect.arrayContaining(
				TRANSITION_LAB_RECIPES.map((recipe) =>
					expect.objectContaining({
						status: "ready",
						backend: "transition-lab",
						presetId: recipe.id,
					})
				)
		)
		);
	});

	it("admits an exact Jianying package without exposing its path", async () => {
		const definition = JIANYING_TRANSITIONS.find(
			(transition) => transition.runtimeKind === "transition-segment"
		);
		if (!definition) throw new Error("expected a Jianying transition");
		const packagePath = path.join(directory, definition.metadataMd5);
		const packagePaths = new Map([[definition.id, packagePath]]);
		const inspection = {
			status: buildJianyingRuntimeStatus({
				appBundlePath: "/Applications/VideoFusion-macOS.app",
				runtimeRootPath: "/runtime",
				bridgePath: "/bridge",
				packagePaths,
			}),
			appBundlePath: "/Applications/VideoFusion-macOS.app",
			runtimeRootPath: "/runtime",
			bridgePath: "/bridge",
			packagePaths,
		};
		const resolution = await resolveComposeTransitionReference({
			assetId: definition.id,
			dependencies: {
				inspectJianyingTransitions: async () => inspection,
			},
		});
		expect(resolution).toMatchObject({
			status: "ready",
			backend: "jianying-local",
			presetId: definition.id,
			packageHash: definition.metadataMd5,
		});
		expect(JSON.stringify(resolution)).not.toContain(directory);
	});

	it("rejects a mismatched Jianying package directory", async () => {
		const definition = JIANYING_TRANSITIONS.find(
			(transition) => transition.runtimeKind === "transition-segment"
		);
		if (!definition) throw new Error("expected a Jianying transition");
		const packagePaths = new Map([
			[definition.id, path.join(directory, "wrong-package-hash")],
		]);
		const inspection = {
			status: buildJianyingRuntimeStatus({
				appBundlePath: "/Applications/VideoFusion-macOS.app",
				runtimeRootPath: "/runtime",
				bridgePath: "/bridge",
				packagePaths,
			}),
			appBundlePath: "/Applications/VideoFusion-macOS.app",
			runtimeRootPath: "/runtime",
			bridgePath: "/bridge",
			packagePaths,
		};
		await expect(
			resolveComposeTransitionReference({
				assetId: definition.id,
				dependencies: {
					inspectJianyingTransitions: async () => inspection,
				},
			})
		).resolves.toMatchObject({
			status: "unsupported",
			backend: "jianying-local",
		});
	});
});
