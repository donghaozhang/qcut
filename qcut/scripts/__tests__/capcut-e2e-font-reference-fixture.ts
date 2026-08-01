import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const FONT_REFERENCE_TARGET_TEXT = "剪映真实导入测试 ABC123";

const temporaryDirectories: string[] = [];

export interface FontReferenceFixtureOptions {
	appId?: unknown;
	appSource?: unknown;
	appVersion?: unknown;
	createTime?: unknown;
	draftName?: string;
	duplicateReferenceInVideoTrack?: boolean;
	duplicateTarget?: boolean;
	extraMaterialFields?: Readonly<Record<string, unknown>>;
	extraTextTrack?: boolean;
	fontFields?: Readonly<Record<string, unknown>>;
	materialFontSize?: number;
	materialFonts?: unknown;
	nestedUpdateTime?: unknown;
	segmentDuration?: unknown;
	segmentMaterialId?: unknown;
	segmentVisible?: unknown;
	styleFont?: unknown;
	styleSize?: number;
	timelineAppVersion?: unknown;
	timelineCreateTime?: unknown;
	timelineDraftName?: string;
	timelineFontFields?: Readonly<Record<string, unknown>>;
	timelineMaterialFontSize?: number;
	timelineNestedUpdateTime?: unknown;
	timelineUpdateTime?: unknown;
	topLevelFontMaterials?: unknown;
	updateTime?: unknown;
}

function createDraftInfo({
	appId = 359_289,
	appSource = "cc",
	appVersion = "8.1.1",
	createTime = 1_000_000,
	draftName = "Dedicated font reference",
	duplicateReferenceInVideoTrack = false,
	duplicateTarget = false,
	extraMaterialFields = {},
	extraTextTrack = false,
	fontFields = {
		font_name: "",
		font_path:
			"/Applications/CapCut.app/Contents/Resources/Font/SystemFont/en.ttf",
		font_resource_id: "",
	},
	materialFontSize = 12,
	materialFonts = [],
	nestedUpdateTime,
	segmentDuration = 6_000_000,
	segmentMaterialId = "font-reference-text-material",
	segmentVisible = true,
	styleFont,
	styleSize = 12,
	topLevelFontMaterials,
	updateTime = 1_000_000,
}: FontReferenceFixtureOptions): Record<string, unknown> {
	const style = {
		bold: false,
		range: [0, FONT_REFERENCE_TARGET_TEXT.length],
		size: styleSize,
		...(styleFont === undefined ? {} : { font: styleFont }),
	};
	const textMaterial = {
		...fontFields,
		...extraMaterialFields,
		content: JSON.stringify({
			styles: [style],
			text: FONT_REFERENCE_TARGET_TEXT,
		}),
		font_size: materialFontSize,
		fonts: materialFonts,
		id: "font-reference-text-material",
		text_color: "#ffffff",
		type: "text",
	};
	const targetSegment = {
		id: "font-reference-text-segment",
		material_id: segmentMaterialId,
		target_timerange: { duration: segmentDuration, start: 0 },
		visible: segmentVisible,
	};
	return {
		create_time: createTime,
		duration: 6_000_000,
		id: "font-reference-draft",
		...(nestedUpdateTime === undefined
			? {}
			: { capture_metadata: { update_time: nestedUpdateTime } }),
		materials: {
			...(topLevelFontMaterials === undefined
				? {}
				: { fonts: topLevelFontMaterials }),
			texts: [
				textMaterial,
				...(duplicateTarget
					? [{ ...textMaterial, id: "duplicate-font-reference-text" }]
					: []),
			],
		},
		name: draftName,
		platform: {
			app_id: appId,
			app_source: appSource,
			app_version: appVersion,
			os: "mac",
		},
		tracks: [
			{
				id: "font-reference-text-track",
				segments: [targetSegment],
				type: "text",
			},
			...(extraTextTrack
				? [
						{
							id: "extra-text-track",
							segments: [],
							type: "text",
						},
					]
				: []),
			...(duplicateReferenceInVideoTrack
				? [
						{
							id: "invalid-video-track",
							segments: [
								{
									id: "duplicate-reference",
									material_id: "font-reference-text-material",
								},
							],
							type: "video",
						},
					]
				: []),
		],
		update_time: updateTime,
	};
}

export async function createFontReferenceDraft({
	name,
	options = {},
}: {
	name: string;
	options?: FontReferenceFixtureOptions;
}): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "qcut-font-reference-"));
	temporaryDirectories.push(root);
	const draftDirectory = join(root, name);
	const timelineDirectory = join(draftDirectory, "Timelines", "timeline-1");
	await mkdir(timelineDirectory, { recursive: true });
	const rootDraftInfo = createDraftInfo(options);
	const timelineDraftInfo = createDraftInfo({
		...options,
		appVersion: options.timelineAppVersion ?? options.appVersion,
		createTime: options.timelineCreateTime ?? options.createTime,
		draftName: options.timelineDraftName ?? options.draftName,
		fontFields: options.timelineFontFields ?? options.fontFields,
		materialFontSize:
			options.timelineMaterialFontSize ?? options.materialFontSize,
		nestedUpdateTime:
			options.timelineNestedUpdateTime ?? options.nestedUpdateTime,
		updateTime: options.timelineUpdateTime ?? options.updateTime,
	});
	await Promise.all([
		writeFile(
			join(draftDirectory, "draft_info.json"),
			`${JSON.stringify(rootDraftInfo)}\n`,
			"utf8"
		),
		writeFile(
			join(timelineDirectory, "draft_info.json"),
			`${JSON.stringify(timelineDraftInfo)}\n`,
			"utf8"
		),
	]);
	return realpath(draftDirectory);
}

export async function createFontReferenceOutputDirectory(): Promise<string> {
	const outputRoot = await realpath(
		await mkdtemp(join(tmpdir(), "qcut-font-output-"))
	);
	temporaryDirectories.push(outputRoot);
	return outputRoot;
}

export async function removeFontReferenceFixtures(): Promise<void> {
	const directories = temporaryDirectories.splice(0);
	await Promise.all(
		directories.map((directory) =>
			rm(directory, { force: true, recursive: true })
		)
	);
}
