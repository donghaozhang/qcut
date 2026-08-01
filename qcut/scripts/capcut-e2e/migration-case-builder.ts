import { basename } from "node:path";
import { createInvertLutColorSettings } from "./migration-lut.js";
import type {
	MigrationCaseDefinition,
	MigrationCaseId,
	MigrationCaseSources,
	MigrationSnapshot,
	MigrationSnapshotTrack,
	ExpectedMigrationWarning,
	SnapshotAudioMedia,
	SnapshotCaptionElement,
	SnapshotImageMedia,
	SnapshotMedia,
	SnapshotMediaElement,
	SnapshotProject,
	SnapshotStickerElement,
	SnapshotTextElement,
	SnapshotVideoMedia,
} from "./migration-snapshot-types.js";

export type {
	MigrationCaseDefinition,
	MigrationCaseId,
	MigrationCaseSources,
	MigrationSnapshot,
	MigrationSnapshotElement,
	MigrationSnapshotTrack,
	ExpectedMigrationWarning,
} from "./migration-snapshot-types.js";

function createProject({ name }: { name: string }): SnapshotProject {
	return {
		backgroundColor: "transparent",
		backgroundType: "color",
		fps: 30,
		height: 720,
		id: `capcut-e2e-${name}-project`,
		name,
		sceneId: `capcut-e2e-${name}-scene`,
		width: 1280,
	};
}

function createVideoMedia({
	sourcePath,
}: {
	sourcePath: string;
}): SnapshotVideoMedia {
	return {
		duration: 6,
		height: 720,
		id: "source-video",
		name: basename(sourcePath),
		sourcePath,
		type: "video",
		width: 1280,
	};
}

function createAudioMedia({
	sourcePath,
}: {
	sourcePath: string;
}): SnapshotAudioMedia {
	return {
		duration: 6,
		id: "source-audio",
		name: basename(sourcePath),
		sourcePath,
		type: "audio",
	};
}

function createVideoElement({
	id,
	mediaName,
	startTime,
	trimEnd,
	trimStart,
}: {
	id: string;
	mediaName: string;
	startTime: number;
	trimEnd: number;
	trimStart: number;
}): SnapshotMediaElement {
	return {
		duration: 6,
		id,
		mediaId: "source-video",
		name: mediaName,
		startTime,
		trimEnd,
		trimStart,
		type: "media",
	};
}

function createBaseSnapshot({
	caseId,
	media,
	timelineDurationByElementId,
	tracks,
}: {
	caseId: MigrationCaseId;
	media: SnapshotMedia[];
	timelineDurationByElementId: Record<string, number>;
	tracks: MigrationSnapshotTrack[];
}): MigrationSnapshot {
	return {
		media,
		project: createProject({ name: caseId }),
		schemaVersion: 1,
		timelineDurationByElementId,
		tracks,
	};
}

function buildNativeTextStickerCase({
	sources,
}: {
	sources: MigrationCaseSources;
}): MigrationCaseDefinition {
	const videoMedia = createVideoMedia({ sourcePath: sources.videoPath });
	const audioMedia = createAudioMedia({ sourcePath: sources.audioPath });
	const stickerMedia: SnapshotImageMedia = {
		height: sources.sticker.height,
		id: "qcut-icon",
		name: basename(sources.sticker.path),
		sourcePath: sources.sticker.path,
		type: "image",
		width: sources.sticker.width,
	};
	const video = createVideoElement({
		id: "native-source-video",
		mediaName: videoMedia.name,
		startTime: 0,
		trimEnd: 0,
		trimStart: 0,
	});
	const audio: SnapshotMediaElement = {
		duration: 6,
		id: "native-source-audio",
		mediaId: audioMedia.id,
		name: audioMedia.name,
		startTime: 0,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
	const title: SnapshotTextElement = {
		backgroundColor: "transparent",
		color: "#ffffff",
		content: "剪映真实导入测试 ABC123",
		duration: 6,
		fontFamily: "system",
		fontSize: 72,
		fontStyle: "normal",
		fontWeight: "bold",
		id: "native-title",
		name: "native-title",
		opacity: 1,
		rotation: 0,
		startTime: 0,
		textAlign: "center",
		textDecoration: "none",
		trimEnd: 0,
		trimStart: 0,
		type: "text",
		x: 0,
		y: -180,
	};
	const caption: SnapshotCaptionElement = {
		duration: 6,
		id: "native-caption",
		language: "zh-CN",
		name: "native-caption",
		source: "manual",
		startTime: 0,
		style: {
			animationDelay: 0,
			animationDuration: 0.6,
			animationType: "none",
			backgroundColor: "#000000",
			bgOpacity: 0.8,
			bold: false,
			fontColor: "#ffffff",
			fontFamily: "system",
			fontOpacity: 1,
			fontSize: 54,
			italic: false,
			letterSpacing: 0,
			lineSpacing: 1.4,
			outlineColor: "#000000",
			outlineWidth: 2,
			position: { align: "bottom", x: 50, y: 90 },
			shadowColor: "#000000",
			shadowOffset: { x: 1, y: 1 },
			textAlign: "center",
			underline: false,
		},
		text: "原生字幕验证 ABC123",
		trimEnd: 0,
		trimStart: 0,
		type: "captions",
	};
	const sticker: SnapshotStickerElement = {
		duration: 6,
		height: 18,
		id: "native-sticker",
		maintainAspectRatio: true,
		mediaId: stickerMedia.id,
		name: stickerMedia.name,
		opacity: 1,
		rotation: 0,
		startTime: 0,
		stickerId: "qcut-icon-sticker",
		trimEnd: 0,
		trimStart: 0,
		type: "sticker",
		width: 18,
		x: 88,
		y: 15,
	};
	return {
		allowedWarnings: [
			{
				code: "STICKER_EXPORTED_AS_IMAGE_OVERLAY",
				elementId: "native-sticker",
				mediaId: "qcut-icon",
				message:
					"Local QCut sticker is exported as an editable photo overlay, not a native JianYing resource sticker; accept this semantic downgrade before writing.",
				trackId: "native-sticker-track",
			},
			{
				code: "UNSUPPORTED_CAPTION_METADATA",
				elementId: "native-caption",
				message:
					"Caption language, confidence, and source metadata are not represented in the draft.",
				trackId: "native-caption-track",
			},
		],
		caseId: "native-text-sticker",
		draftName: "QCut E2E Native Text Sticker",
		snapshot: createBaseSnapshot({
			caseId: "native-text-sticker",
			media: [videoMedia, audioMedia, stickerMedia],
			timelineDurationByElementId: {
				[audio.id]: 6,
				[caption.id]: 6,
				[sticker.id]: 6,
				[title.id]: 6,
				[video.id]: 6,
			},
			tracks: [
				{
					elements: [video],
					id: "native-video-track",
					name: "Video",
					order: 0,
					type: "media",
				},
				{
					elements: [audio],
					id: "native-audio-track",
					name: "Audio",
					order: 1,
					type: "audio",
				},
				{
					elements: [title],
					id: "native-title-track",
					name: "Title",
					order: 2,
					type: "text",
				},
				{
					elements: [caption],
					id: "native-caption-track",
					name: "Caption",
					order: 3,
					type: "captions",
				},
				{
					elements: [sticker],
					id: "native-sticker-track",
					name: "Sticker",
					order: 4,
					type: "sticker",
				},
			],
		}),
	};
}

function buildDissolveCase({
	sources,
}: {
	sources: MigrationCaseSources;
}): MigrationCaseDefinition {
	const videoMedia = createVideoMedia({ sourcePath: sources.videoPath });
	const clipA = createVideoElement({
		id: "dissolve-clip-a",
		mediaName: videoMedia.name,
		startTime: 0,
		trimEnd: 3,
		trimStart: 0,
	});
	const clipB = createVideoElement({
		id: "dissolve-clip-b",
		mediaName: videoMedia.name,
		startTime: 3,
		trimEnd: 0,
		trimStart: 3,
	});
	return {
		allowedWarnings: [
			{
				code: "CAPCUT_8_1_TRANSITION_DURATION_CANONICALIZED",
				message:
					"CapCut 8.1 uses its verified 466666µs native Dissolve duration instead of QCut's 500000µs duration.",
				trackId: "dissolve-video-track",
			},
		],
		caseId: "dissolve",
		draftName: "QCut E2E Native Dissolve",
		snapshot: createBaseSnapshot({
			caseId: "dissolve",
			media: [videoMedia],
			timelineDurationByElementId: {
				[clipA.id]: 3,
				[clipB.id]: 3,
			},
			tracks: [
				{
					elements: [clipA, clipB],
					id: "dissolve-video-track",
					name: "Dissolve A to B",
					order: 0,
					transitions: [
						{
							duration: 0.5,
							easing: "easeInOut",
							fromElementId: clipA.id,
							id: "native-dissolve",
							presetId: "dissolve",
							toElementId: clipB.id,
							type: "dissolve",
						},
					],
					type: "media",
				},
			],
		}),
	};
}

function buildLutMaskCase({
	sources,
}: {
	sources: MigrationCaseSources;
}): MigrationCaseDefinition {
	const videoMedia = createVideoMedia({ sourcePath: sources.videoPath });
	const rawA = createVideoElement({
		id: "lut-mask-raw-a",
		mediaName: videoMedia.name,
		startTime: 0,
		trimEnd: 3,
		trimStart: 0,
	});
	const treatedA: SnapshotMediaElement = {
		...createVideoElement({
			id: "lut-mask-treated-a",
			mediaName: videoMedia.name,
			startTime: 3,
			trimEnd: 3,
			trimStart: 0,
		}),
		color: createInvertLutColorSettings(),
		mask: {
			blendMode: "add",
			centerX: 0.5,
			centerY: 0.5,
			enabled: true,
			feather: 0,
			height: 0.65,
			id: "verified-ellipse-mask",
			invert: false,
			rotation: 0,
			type: "ellipse",
			width: 0.65,
		},
	};
	return {
		allowedWarnings: [],
		caseId: "lut-mask",
		draftName: "QCut E2E LUT Mask",
		snapshot: createBaseSnapshot({
			caseId: "lut-mask",
			media: [videoMedia],
			timelineDurationByElementId: {
				[rawA.id]: 3,
				[treatedA.id]: 3,
			},
			tracks: [
				{
					elements: [rawA, treatedA],
					id: "lut-mask-video-track",
					name: "Raw then LUT Mask",
					order: 0,
					type: "media",
				},
			],
		}),
	};
}

export function buildMigrationCases({
	sources,
}: {
	sources: MigrationCaseSources;
}): MigrationCaseDefinition[] {
	return [
		buildNativeTextStickerCase({ sources }),
		buildDissolveCase({ sources }),
		buildLutMaskCase({ sources }),
	];
}
