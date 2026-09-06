import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverComposeLabCandidates } from "../native-pipeline/compose/compose-lab-candidates";
import { discoverComposeResources } from "../native-pipeline/compose/compose-resource-broker";
import {
	discoverComposeGeneratedMedia,
	resolveComposeGeneratedMedia,
} from "../native-pipeline/compose/compose-generated-media";
import { sanitizeComposeModelOperations } from "../native-pipeline/compose/providers/compose-model-response";
import type {
	ComposeAssetReference,
	ComposeSnapshot,
} from "../native-pipeline/compose/compose-protocol";
import type { EditorApiClient } from "../native-pipeline/editor/editor-api-client";

const directories: string[] = [];
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true }))
	);
});

describe("Compose lab candidates", () => {
	it("enumerates fonts, fancy words, templates, animations and filters without private paths", async () => {
		const result = await discoverComposeLabCandidates({
			dependencies: {
				fonts: vi.fn().mockResolvedValue({
					entries: [
						{
							fontId: "font",
							fullName: "Title Font",
							familyName: "Family",
							subfamilyName: "Regular",
							filePaths: ["/private/font"],
						},
					],
				}),
				text: vi.fn().mockResolvedValue({
					styles: {
						styles: [
							{
								styleId: "fancy",
								packageKind: "TextStyle",
								compatibility: "flat-compatible",
								approximation: {},
								categoryIds: [],
								fillKind: "solid",
							},
							{
								styleId: "template",
								packageKind: "InfoSticker",
								compatibility: "native-runtime",
								runtimeReference: {},
								categoryIds: [],
								fillKind: "solid",
							},
							{
								styleId: "preview",
								packageKind: "TextStyle",
								compatibility: "preview-only",
								categoryIds: [],
								fillKind: "texture",
							},
						],
					},
					animations: {
						animations: [
							{ animationId: "animation", slot: "entrance", duration: 1 },
						],
					},
				}),
				filters: vi.fn().mockResolvedValue({
					cards: [
						{
							resourceId: "filter",
							title: "Cool",
							categories: [],
							available: true,
							implementation: "lut",
						},
						{ resourceId: "missing", available: false },
					],
				}),
			},
		});
		expect(result.resources.map(({ assetType }) => assetType)).toEqual([
			"font",
			"fancy-word",
			"text-template",
			"text-animation",
			"filter",
		]);
		expect(JSON.stringify(result)).not.toContain("/private/");
		expect(
			result.resources.find(({ assetId }) => assetId === "template")
				?.capabilities?.requiresLocalRuntime
		).toBe(true);
	});
	it("keeps other labs available when one catalog fails", async () => {
		const result = await discoverComposeLabCandidates({
			dependencies: {
				fonts: vi.fn().mockRejectedValue(new Error("/private/path")),
				text: vi.fn().mockResolvedValue({
					styles: { styles: [] },
					animations: { animations: [] },
				}),
				filters: vi.fn().mockResolvedValue({ cards: [] }),
			},
		});
		expect(result.warnings).toEqual([
			"Compose Font Lab discovery unavailable.",
		]);
	});
	it("applies the per-type limit to the expanded pool, including generated media", async () => {
		const candidate: ComposeAssetReference = {
			provider: "local",
			assetType: "font",
			assetId: "font",
			availability: "ready",
			displayName: "Travel",
		};
		const result = await discoverComposeResources({
			perTypeLimit: 1,
			query: "Travel",
			generatedMedia: [
				{
					...candidate,
					assetType: "generated-media",
					assetId: "generated",
					capabilities: {
						editorApply: true,
						editorExport: true,
						preview: true,
						headlessRender: true,
					},
				},
			],
			dependencies: {
				discoverLabs: vi.fn().mockResolvedValue({
					resources: [
						{ ...candidate, assetId: "other", displayName: "Other" },
						candidate,
					],
					warnings: [],
				}),
				discoverStickers: vi.fn().mockResolvedValue({ catalogs: [] }),
				listSounds: vi.fn().mockResolvedValue([]),
				inspectJianyingTransitions: vi.fn().mockResolvedValue(null),
			},
		});
		expect(
			result.resources
				.filter(({ assetType }) => assetType === "font")
				.map(({ assetId }) => assetId)
		).toEqual(["font"]);
		expect(
			result.resources.some(({ assetType }) => assetType === "generated-media")
		).toBe(true);
	});
	it("only resolves saved generation outputs from the same project and rejects changed files", async () => {
		const directory = await mkdtemp(join(tmpdir(), "compose-generated-"));
		directories.push(directory);
		const localPath = join(directory, "image.png");
		await writeFile(localPath, "original");
		const item = {
			id: "image",
			name: "Generated",
			type: "image",
			localPath,
			metadata: { generatedAt: "2026-09-06" },
		};
		const get = vi.fn().mockResolvedValue({
			state: {
				project: { activeProject: { id: "project" } },
				media: {
					items: [
						item,
						{ ...item, id: "unsaved", unsaved: true },
						{ ...item, id: "missing", localPath: join(directory, "missing") },
					],
				},
			},
		});
		const client = { get } as unknown as Pick<EditorApiClient, "get">;
		const assets = await discoverComposeGeneratedMedia({
			client,
			projectId: "project",
		});
		expect(assets).toHaveLength(1);
		expect(
			(
				await resolveComposeGeneratedMedia({
					client,
					projectId: "project",
					reference: { ...assets[0], localPath: "/forged" },
				})
			).localPath
		).toBe(localPath);
		await writeFile(localPath, "replacement-longer");
		await expect(
			resolveComposeGeneratedMedia({
				client,
				projectId: "project",
				reference: assets[0],
			})
		).rejects.toThrow("not saved");
		await expect(
			discoverComposeGeneratedMedia({ client, projectId: "other" })
		).rejects.toThrow("project changed");
	});
});

describe("model resource selection", () => {
	const resource = ({
		assetType,
	}: {
		assetType: ComposeAssetReference["assetType"];
	}): ComposeAssetReference => ({
		provider: "local",
		assetType,
		assetId: assetType,
		availability: "ready",
		tags: assetType === "generated-media" ? ["video"] : [],
		duration: 5,
		localPath: "/private/source",
		provenance: { secret: "private" },
	});
	const resources = [
		"font",
		"fancy-word",
		"text-template",
		"text-animation",
		"filter",
		"generated-media",
	].map((assetType) =>
		resource({ assetType: assetType as ComposeAssetReference["assetType"] })
	);
	const snapshot = {
		project: { duration: 10 },
		media: [{ trackId: "track", elementId: "clip" }],
		availableResources: resources,
	} as ComposeSnapshot;
	it("retains real text and filter selections, but not model-supplied paths", () => {
		const operations = sanitizeComposeModelOperations({
			snapshot,
			value: {
				operations: [
					{
						kind: "add-caption",
						text: "Hello",
						language: "zh",
						stylePresetId: "cinematic",
						font: "font",
						asset: "text-template",
						textAnimation: "text-animation",
						startTime: 0,
						duration: 2,
					},
					{
						kind: "set-media-filter-stack",
						trackId: "track",
						elementId: "clip",
						filters: [
							{
								asset: {
									...resource({ assetType: "filter" }),
									localPath: "/forged",
								},
								intensity: 70,
							},
						],
						startTime: 0,
						duration: 2,
					},
					{
						kind: "insert-media-clip",
						asset: "generated-media",
						mediaKind: "video",
						startTime: 0,
						duration: 3,
					},
				],
			},
		});
		expect(operations).toHaveLength(3);
		expect(operations[0]).toMatchObject({
			stylePresetId: "cinematic",
			font: { assetId: "font" },
			textAnimation: { assetId: "text-animation" },
		});
		expect(operations[2]).toMatchObject({ sourceDuration: 5, trimEnd: 2 });
		expect(JSON.stringify(operations)).not.toMatch(/private|forged|localPath/);
	});
	it("rejects invented assets, wrong kinds and out-of-range filters", () => {
		const operations = sanitizeComposeModelOperations({
			snapshot,
			value: {
				operations: [
					{
						kind: "add-caption",
						text: "Hello",
						language: "en",
						font: "invented",
						startTime: 0,
						duration: 2,
					},
					{
						kind: "add-filter-layer",
						filters: [{ asset: "filter", intensity: 101 }],
						startTime: 0,
						duration: 2,
					},
					{
						kind: "insert-media-clip",
						asset: "generated-media",
						mediaKind: "image",
						startTime: 0,
						duration: 2,
					},
					{
						kind: "insert-media-clip",
						asset: "generated-media",
						mediaKind: "video",
						startTime: 0,
						duration: 6,
					},
				],
			},
		});
		expect(operations).toEqual([]);
	});
});
