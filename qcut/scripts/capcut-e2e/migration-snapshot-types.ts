import type { MigrationLutColorSettings } from "./migration-lut.js";

export type MigrationCaseId = "native-text-sticker" | "dissolve" | "lut-mask";

export interface SnapshotProject {
	backgroundColor: string;
	backgroundType: "color";
	fps: number;
	height: number;
	id: string;
	name: string;
	sceneId: string;
	width: number;
}

interface SnapshotMediaBase {
	id: string;
	name: string;
	sourcePath: string;
}

export interface SnapshotVideoMedia extends SnapshotMediaBase {
	duration: number;
	height: number;
	type: "video";
	width: number;
}

export interface SnapshotAudioMedia extends SnapshotMediaBase {
	duration: number;
	type: "audio";
}

export interface SnapshotImageMedia extends SnapshotMediaBase {
	height: number;
	type: "image";
	width: number;
}

export type SnapshotMedia =
	| SnapshotAudioMedia
	| SnapshotImageMedia
	| SnapshotVideoMedia;

interface SnapshotElementBase {
	duration: number;
	id: string;
	name: string;
	startTime: number;
	trimEnd: number;
	trimStart: number;
}

interface SnapshotMask {
	blendMode: "add";
	centerX: number;
	centerY: number;
	enabled: true;
	feather: 0;
	height: number;
	id: string;
	invert: false;
	rotation: number;
	type: "ellipse" | "rectangle";
	width: number;
}

export interface SnapshotMediaElement extends SnapshotElementBase {
	color?: MigrationLutColorSettings;
	mask?: SnapshotMask;
	mediaId: string;
	type: "media";
}

export interface SnapshotTextElement extends SnapshotElementBase {
	backgroundColor: string;
	color: string;
	content: string;
	fontFamily: "system";
	fontSize: number;
	fontStyle: "normal";
	fontWeight: "bold";
	opacity: number;
	rotation: number;
	textAlign: "center";
	textDecoration: "none";
	type: "text";
	x: number;
	y: number;
}

export interface SnapshotCaptionElement extends SnapshotElementBase {
	language: string;
	source: "manual";
	style: {
		animationDelay: number;
		animationDuration: number;
		animationType: "none";
		backgroundColor: string;
		bgOpacity: number;
		bold: boolean;
		fontColor: string;
		fontFamily: "system";
		fontOpacity: number;
		fontSize: number;
		italic: boolean;
		letterSpacing: number;
		lineSpacing: number;
		outlineColor: string;
		outlineWidth: number;
		position: { align: "bottom"; x: number; y: number };
		shadowColor: string;
		shadowOffset: { x: number; y: number };
		textAlign: "center";
		underline: boolean;
	};
	text: string;
	type: "captions";
}

export interface SnapshotStickerElement extends SnapshotElementBase {
	height: number;
	maintainAspectRatio: true;
	mediaId: string;
	opacity: number;
	rotation: number;
	stickerId: string;
	type: "sticker";
	width: number;
	x: number;
	y: number;
}

export type MigrationSnapshotElement =
	| SnapshotCaptionElement
	| SnapshotMediaElement
	| SnapshotStickerElement
	| SnapshotTextElement;

interface SnapshotTransition {
	duration: number;
	easing: "easeInOut";
	fromElementId: string;
	id: string;
	presetId: "dissolve";
	toElementId: string;
	type: "dissolve";
}

export interface MigrationSnapshotTrack {
	elements: MigrationSnapshotElement[];
	id: string;
	name: string;
	order: number;
	transitions?: SnapshotTransition[];
	type: "audio" | "captions" | "media" | "sticker" | "text";
}

export interface MigrationSnapshot {
	media: SnapshotMedia[];
	project: SnapshotProject;
	schemaVersion: 1;
	timelineDurationByElementId: Record<string, number>;
	tracks: MigrationSnapshotTrack[];
}

export interface MigrationCaseSources {
	audioPath: string;
	sticker: {
		height: number;
		path: string;
		width: number;
	};
	videoPath: string;
}

export interface ExpectedMigrationWarning {
	code: string;
	elementId?: string;
	mediaId?: string;
	message: string;
	trackId?: string;
}

export interface MigrationCaseDefinition {
	allowedWarnings: readonly ExpectedMigrationWarning[];
	caseId: MigrationCaseId;
	draftName: string;
	snapshot: MigrationSnapshot;
}
