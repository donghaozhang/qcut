import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	inspectEffectPackageAlgorithm,
	resolveEffectSupport,
} from "../jianying-effect/algorithm-support.js";
import {
	VERIFIED_ALGORITHM_PACKAGE_COUNT,
	isVerifiedAlgorithmPackage,
} from "../jianying-effect/verified-algorithm-packages.js";

const NEWLY_VERIFIED_PACKAGES = [
	{
		effectId: "7395461399507455284",
		packageHash: "a3abb5e0b6ecd54435798b1044a3cd74",
	},
	{
		effectId: "7399492386310688040",
		packageHash: "778ede7c2c58dbdc4fda2c424f89136c",
	},
	{
		effectId: "7399493460165725474",
		packageHash: "791f84c4d4463453a24411a4e4c55d15",
	},
	{
		effectId: "7399493519838072099",
		packageHash: "08f1ceba06fcc0e25a1342bc243a549d",
	},
	{
		effectId: "7399495125115637032",
		packageHash: "a720873bc3447300e3709e70f4167cd3",
	},
	{
		effectId: "7399495567782481192",
		packageHash: "777f6152f5b944918f20f487c148b750",
	},
	{
		effectId: "7399496455771229474",
		packageHash: "7123026bc4cd992f4a6df0738d62550d",
	},
	{
		effectId: "7399496777596013839",
		packageHash: "39b0518c960715a0109c9757dac4d22b",
	},
	{
		effectId: "7399497410029882676",
		packageHash: "ddaaaeb0a0eee6845508fd23b948376b",
	},
	{
		effectId: "7399498183916703016",
		packageHash: "0b4e6036025ceece42e803ca25a147b4",
	},
	{
		effectId: "7399498426104188160",
		packageHash: "d55015834cc9ddbbd9c84fabe42355ca",
	},
	{
		effectId: "7399498922764324111",
		packageHash: "75fb63ff79a6134cd22720a6e35b8836",
	},
	{
		effectId: "7399498996059868456",
		packageHash: "f620cd9f92e66f6f9b167fe95a5de3e1",
	},
	{
		effectId: "7399499116490886434",
		packageHash: "d4d13d3df37c9a9fb406827510c4174f",
	},
] as const;

const temporaryRoots: string[] = [];

async function temporaryPackage(): Promise<string> {
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-effect-algorithm-")
	);
	temporaryRoots.push(directory);
	return directory;
}

async function writeAlgorithmConfig({
	packagePath,
	value,
}: {
	packagePath: string;
	value: unknown;
}): Promise<void> {
	await mkdir(packagePath, { recursive: true });
	await writeFile(
		path.join(packagePath, "algorithmConfig.json"),
		JSON.stringify(value),
		"utf8"
	);
}

afterEach(async () => {
	await Promise.all(
		temporaryRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true }))
	);
});

describe("effect package algorithm inspection", () => {
	it("treats a package without an algorithm graph as a plain effect", async () => {
		const packagePath = await temporaryPackage();

		await expect(
			inspectEffectPackageAlgorithm({ packagePath })
		).resolves.toEqual({
			configurationFound: false,
			valid: true,
			nodeTypes: [],
			requiresAlgorithm: false,
			remoteGeneration: false,
		});
	});

	it("recognizes CV nodes even when the catalog omitted requirements", async () => {
		const packagePath = await temporaryPackage();
		await writeAlgorithmConfig({
			packagePath,
			value: {
				nodes: [
					{ type: "texture_blit" },
					{ type: "face" },
					{ type: "matting" },
				],
			},
		});

		await expect(
			inspectEffectPackageAlgorithm({ packagePath })
		).resolves.toEqual({
			configurationFound: true,
			valid: true,
			nodeTypes: ["face", "matting", "texture_blit"],
			requiresAlgorithm: true,
			remoteGeneration: false,
		});
	});

	it("classifies remote AI portrait preprocessors separately", async () => {
		const packagePath = await temporaryPackage();
		await Promise.all([
			writeAlgorithmConfig({
				packagePath,
				value: {
					nodes: [{ type: "face" }, { type: "script" }],
					extra: { output: [{ usage: "VECache" }] },
				},
			}),
			writeFile(
				path.join(packagePath, "config.json"),
				JSON.stringify({ effect: { Link: [] } }),
				"utf8"
			),
			writeFile(
				path.join(packagePath, "extra.json"),
				JSON.stringify({ setting: { is_local: false } }),
				"utf8"
			),
		]);

		const inspection = await inspectEffectPackageAlgorithm({ packagePath });
		expect(inspection).toMatchObject({
			valid: true,
			nodeTypes: ["face", "script"],
			requiresAlgorithm: true,
			remoteGeneration: true,
		});
		expect(
			resolveEffectSupport({
				effectId: "remote",
				packageHash: "a".repeat(32),
				unsupportedRequirements: [],
				packageInspection: inspection,
			})
		).toMatchObject({
			supported: false,
			requiresAlgorithm: true,
			unsupportedReason: "远程 AI 写真生成，不属于本机视频特效",
		});
	});

	it("fails closed when an algorithm graph is malformed", async () => {
		const packagePath = await temporaryPackage();
		await writeFile(
			path.join(packagePath, "algorithmConfig.json"),
			"{not-json",
			"utf8"
		);

		await expect(
			inspectEffectPackageAlgorithm({ packagePath })
		).resolves.toEqual({
			configurationFound: true,
			valid: false,
			nodeTypes: [],
			requiresAlgorithm: true,
			remoteGeneration: false,
		});
	});
});

describe("effect algorithm support gate", () => {
	it("ships the complete isolated CV verification set", () => {
		expect(VERIFIED_ALGORITHM_PACKAGE_COUNT).toBe(365);
	});

	it.each(NEWLY_VERIFIED_PACKAGES)("ships newly isolated package $effectId", ({
		effectId,
		packageHash,
	}) => {
		expect(isVerifiedAlgorithmPackage({ effectId, packageHash })).toBe(true);
	});

	it("unlocks only the exact verified algorithm package build", () => {
		const input = {
			effectId: "7565179108095937816",
			unsupportedRequirements: ["matting"],
		};

		expect(
			resolveEffectSupport({
				...input,
				packageHash: "ad5f44fab56e257ac321c7e25310e0c5",
			})
		).toEqual({ supported: true, requiresAlgorithm: true });
		expect(
			resolveEffectSupport({
				...input,
				packageHash: "f".repeat(32),
			})
		).toMatchObject({ supported: false, requiresAlgorithm: true });
	});

	it("accepts a newer exact local isolation verdict", () => {
		expect(
			resolveEffectSupport({
				effectId: "1",
				packageHash: "a".repeat(32),
				unsupportedRequirements: ["skeleton"],
				localVerdict: {
					packageHash: "a".repeat(32),
					ok: true,
					algorithmIsolated: true,
				},
			})
		).toEqual({ supported: true, requiresAlgorithm: true });
	});

	it("does not apply a verdict to another package build", () => {
		expect(
			resolveEffectSupport({
				effectId: "1",
				packageHash: "b".repeat(32),
				unsupportedRequirements: [],
				localVerdict: {
					packageHash: "a".repeat(32),
					ok: false,
					algorithmIsolated: false,
				},
			})
		).toEqual({ supported: true, requiresAlgorithm: false });
	});

	it("keeps known hidden CV graphs locked without isolation evidence", () => {
		expect(
			resolveEffectSupport({
				effectId: "7297121952244813066",
				packageHash: "e3403fc6e44911571e0978b81eb9b84c",
				unsupportedRequirements: [],
			})
		).toMatchObject({
			supported: false,
			requiresAlgorithm: true,
		});
	});
});
