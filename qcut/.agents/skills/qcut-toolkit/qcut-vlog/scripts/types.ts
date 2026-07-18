export const VLOG_PRESETS = [
	"default",
	"cinematic",
	"bold",
	"minimal",
	"karaoke",
	"news",
] as const;

export const VLOG_BACKGROUND_FITS = ["cover", "contain", "stretch"] as const;

export type VlogPreset = (typeof VLOG_PRESETS)[number];
export type VlogBackgroundFit = (typeof VLOG_BACKGROUND_FITS)[number];

export type VlogStage =
	| "clean"
	| "portrait"
	| "background"
	| "extract-audio"
	| "transcribe"
	| "subtitle"
	| "verify";

export interface VlogOptions {
	input: string;
	outputDir: string;
	finalName: string;
	background?: string;
	backgroundFit: VlogBackgroundFit;
	portraitFilter: string;
	filterIntensity?: number;
	beauty: number;
	preset: VlogPreset;
	style?: string;
	model: string;
	language?: string;
	silenceThreshold: number;
	keepPadding: number;
	srtMaxWords: number;
	srtMaxDuration: number;
	keepFillers: boolean;
	keepSilences: boolean;
	analyzeOnly: boolean;
	resume: boolean;
	force: boolean;
	json: boolean;
	help: boolean;
}

export interface VlogPaths {
	input: string;
	outputDir: string;
	metadataDir: string;
	logsDir: string;
	verificationDir: string;
	words: string;
	decisions: string;
	cuts: string;
	keeps: string;
	cleanVideo: string;
	portraitVideo: string;
	cutoutVideo: string;
	editableVideo: string;
	cleanAudio: string;
	srt: string;
	finalVideo: string;
	previewImage: string;
	backgroundPreviewImage: string;
	manifest: string;
}

export interface ToolCommand {
	executable: string;
	prefixArgs: string[];
	cwd?: string;
}

export interface Toolchain {
	qcut: ToolCommand;
	ffmpeg: ToolCommand;
	ffprobe: ToolCommand;
}

export interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	startedAt: string;
	finishedAt: string;
	logPath: string;
	command: string[];
}

export interface SrtEntry {
	index: number;
	start: number;
	end: number;
	text: string;
}

export interface CleanSummary {
	decisions: number;
	cuts: number;
	keeps: number;
	fillerCuts: number;
	stutterCuts: number;
	silenceCuts: number;
	otherCuts: number;
	rawCutDuration: number;
}

export interface VerificationSummary {
	sourceDuration: number;
	workingDuration: number;
	finalDuration: number;
	removedDuration: number;
	durationDifference: number;
	subtitleCount: number;
	previewTime: number;
	previewImage: string;
	backgroundPreviewImage?: string;
}

export interface StageRecord {
	status: "pending" | "running" | "completed" | "skipped" | "failed";
	startedAt?: string;
	finishedAt?: string;
	details?: string;
	error?: string;
}

export interface CommandRecord {
	stage: VlogStage;
	command: string[];
	cwd?: string;
	logPath: string;
	exitCode: number;
	startedAt: string;
	finishedAt: string;
}

export interface VlogManifest {
	schemaVersion: 3;
	workflow: "qcut-vlog";
	input: string;
	outputDir: string;
	createdAt: string;
	updatedAt: string;
	settings: {
		finalName: string;
		background?: string;
		backgroundFit: VlogBackgroundFit;
		portraitFilter: string;
		filterIntensity?: number;
		beauty: number;
		preset: VlogPreset;
		style?: string;
		model: string;
		language?: string;
		silenceThreshold: number;
		keepPadding: number;
		srtMaxWords: number;
		srtMaxDuration: number;
		keepFillers: boolean;
		keepSilences: boolean;
	};
	artifacts: {
		cleanVideo: string;
		portraitVideo?: string;
		backgroundImage?: string;
		cutoutVideo?: string;
		editableVideo: string;
		cleanAudio: string;
		srt: string;
		finalVideo: string;
		previewImage: string;
		backgroundPreviewImage?: string;
		metadataDir: string;
	};
	stages: Record<VlogStage, StageRecord>;
	commands: CommandRecord[];
	cleanSummary?: CleanSummary;
	verification?: VerificationSummary;
}
