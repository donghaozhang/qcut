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
	{
		effectId: "7399491817907014946",
		packageHash: "4df2df27627c4d888c44a124a4d271dd",
	},
	{
		effectId: "7399492066742455567",
		packageHash: "ab8ff76e6e3f2917167aa8b46c72d7b5",
	},
	{
		effectId: "7399492832089623808",
		packageHash: "a801c360c14addf5d7792909311190e0",
	},
	{
		effectId: "7399492922699205940",
		packageHash: "1eca62ca4aa366754232b2250015c607",
	},
	{
		effectId: "7399493469917433103",
		packageHash: "3429986a54fc1d15cc29f7340103540d",
	},
	{
		effectId: "7399493519930412340",
		packageHash: "3ec3cd74c41f47a6e96720b8a96e17e3",
	},
	{
		effectId: "7399494164552928552",
		packageHash: "4d77c351eeea86bed84fe0f2e1b87991",
	},
	{
		effectId: "7399494734030359808",
		packageHash: "76492abc2d1e501cc370e167f5a5169a",
	},
	{
		effectId: "7399494870265580840",
		packageHash: "1ce9d544e68a0bb2569b6bf029ad7e71",
	},
	{
		effectId: "7399495031087828239",
		packageHash: "2cc42d4d6e7300bf7aa22f543efcec57",
	},
	{
		effectId: "7399495847752240399",
		packageHash: "08ea65d0c66e42df005ffc079778fd7c",
	},
	{
		effectId: "7399496452466183476",
		packageHash: "0913b628b7ae9ce209316d866a1be8d7",
	},
	{
		effectId: "7399497286369250612",
		packageHash: "9ad61644392439ab43db04e1961031ad",
	},
	{
		effectId: "7399498722423508264",
		packageHash: "e8cf7ff9c724ded3e75c1330c5e141cc",
	},
	{
		effectId: "7395460782609173795",
		packageHash: "e68975c8783884a379af71d8ebf809c7",
	},
	{
		effectId: "7399491541821033768",
		packageHash: "f8e7687cd2456e389b3e9f87d10f4c6d",
	},
	{
		effectId: "7399494094050823464",
		packageHash: "67cdf42290e1a549dddd71e9f7c04c1b",
	},
	{
		effectId: "7399494738933533987",
		packageHash: "fa10d2f4b9ea524f14fc99ff8328be42",
	},
	{
		effectId: "7399494846475472168",
		packageHash: "1cee833d647541e86d24bb2f7b7635ea",
	},
	{
		effectId: "7399495041212779816",
		packageHash: "3b8f6203dfedcd2ff5d17ff6ac6bef78",
	},
	{
		effectId: "7399495261510257920",
		packageHash: "fb764400bbf7df913392c701acfdd138",
	},
	{
		effectId: "7399495628797021474",
		packageHash: "8bc7fee5267274763f6b260c36c2a35b",
	},
	{
		effectId: "7399495834502450467",
		packageHash: "755d346ad79ff4b32ba5c7a984e76340",
	},
	{
		effectId: "7399497077006339343",
		packageHash: "fce07a1e1b2dbdb8675e35c4d0d1dd10",
	},
	{
		effectId: "7399497589105642752",
		packageHash: "097d27eab3b8c3c7c6477ca81cd07933",
	},
	{
		effectId: "7399497885865233716",
		packageHash: "0681150b3164f45ab6340f0a7e2fda1d",
	},
	{
		effectId: "7399497918765436195",
		packageHash: "501b309dac3169c8b938fa785878cf3d",
	},
	{
		effectId: "7399498073325473024",
		packageHash: "49e8da187049ffc5a822cf76e492a47c",
	},
	{
		effectId: "7399498109098790179",
		packageHash: "7ff35a01c3718ac3470ac12807f520be",
	},
	{
		effectId: "7399498169383390516",
		packageHash: "7e9e83271fa77c1cc2b96f3ad4296479",
	},
	{
		effectId: "7399498685928721664",
		packageHash: "5c24c94cc0557d8169c405adc0ec86d3",
	},
	{
		effectId: "7399498939415760180",
		packageHash: "798ddfa08fed0c3750febd157602f92b",
	},
	{
		effectId: "7399499040922045711",
		packageHash: "f73ba06cd32bb3354adf6008cb986515",
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
			requiredModelNames: [],
			requiresAlgorithm: false,
			remoteGeneration: false,
		});
	});

	it("treats external texture producer graphs as plain local effects", async () => {
		const packagePath = await temporaryPackage();
		await writeAlgorithmConfig({
			packagePath,
			value: {
				nodes: [{ type: "ext_texture_producer" }, { type: "texture_blit" }],
			},
		});

		await expect(
			inspectEffectPackageAlgorithm({ packagePath })
		).resolves.toEqual({
			configurationFound: true,
			valid: true,
			nodeTypes: ["ext_texture_producer", "texture_blit"],
			requiredModelNames: [],
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
			requiredModelNames: [],
			requiresAlgorithm: true,
			remoteGeneration: false,
		});
	});

	it("collects filesystem models and ignores logical idream keys", async () => {
		const packagePath = await temporaryPackage();
		await Promise.all([
			writeAlgorithmConfig({
				packagePath,
				value: {
					model_names: {
						alg_model: ["tt_face", "js_cv_trackmotion"],
					},
					nodes: [
						{
							type: "script",
							config: {
								keyMaps: {
									stringParam: {
										idream_model_key: "idream/tt_goodlike",
										model_name: "nh_depth_for_light_scanning",
										packed_model_group_key: "script",
									},
								},
							},
						},
					],
				},
			}),
			writeFile(
				path.join(packagePath, "config.json"),
				JSON.stringify({
					model_names: ["tt_skeleton"],
					effect: { model_names: { alg_model: ["lens_smart_color3"] } },
				}),
				"utf8"
			),
		]);

		await expect(
			inspectEffectPackageAlgorithm({ packagePath })
		).resolves.toMatchObject({
			requiredModelNames: [
				"js_cv_trackmotion",
				"lens_smart_color3",
				"nh_depth_for_light_scanning",
				"tt_face",
				"tt_skeleton",
			],
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
			requiredModelNames: [],
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
			requiredModelNames: [],
			requiresAlgorithm: true,
			remoteGeneration: false,
		});
	});
});

describe("effect algorithm support gate", () => {
	it("ships the complete isolated CV verification set", () => {
		expect(VERIFIED_ALGORITHM_PACKAGE_COUNT).toBe(398);
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
