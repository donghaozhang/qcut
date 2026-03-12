/**
 * Types for CLI Pipeline Runner.
 * @module electron/native-pipeline/cli/cli-runner/types
 */

export interface CLIRunOptions {
	command: string;
	model?: string;
	text?: string;
	imageUrl?: string;
	videoUrl?: string;
	audioUrl?: string;
	outputDir: string;
	config?: string;
	input?: string;
	duration?: string;
	aspectRatio?: string;
	resolution?: string;
	saveIntermediates: boolean;
	parallel?: boolean;
	maxWorkers?: number;
	policy?: string;
	json: boolean;
	verbose: boolean;
	quiet: boolean;
	category?: string;
	prompt?: string;
	layout?: string;
	upscale?: string;
	keyName?: string;
	keyValue?: string;
	idea?: string;
	genre?: string;
	targetDuration?: string;
	script?: string;
	novel?: string;
	title?: string;
	maxScenes?: number;
	maxClips?: number;
	scriptsOnly?: boolean;
	storyboardOnly?: boolean;
	noPortraits?: boolean;
	llmModel?: string;
	imageModel?: string;
	videoModel?: string;
	image?: string;
	stream?: boolean;
	configDir?: string;
	cacheDir?: string;
	stateDir?: string;
	resume?: string;
	sessionName?: string;
	negativePrompt?: string;
	voiceId?: string;
	directory?: string;
	dryRun?: boolean;
	recursive?: boolean;
	includeOutput?: boolean;
	source?: string;
	reveal?: boolean;
	noConfirm?: boolean;
	promptFile?: string;
	portraits?: string;
	views?: string;
	maxCharacters?: number;
	saveRegistry?: boolean;
	style?: string;
	referenceModel?: string;
	referenceStrength?: number;
	// autoclip options
	srtFile?: string;
	minScore?: number;
	autoclipStep?: number;
	chunkMinutes?: number;
	// transcribe options
	language?: string;
	noDiarize?: boolean;
	noTagEvents?: boolean;
	keyterms?: string[];
	srt?: boolean;
	srtMaxWords?: number;
	srtMaxDuration?: number;
	rawJson?: boolean;
	// transfer-motion options
	orientation?: string;
	noSound?: boolean;
	// generate-avatar options
	referenceImages?: string[];
	// analyze-video options
	analysisType?: string;
	outputFormat?: string;
	before?: string;
	after?: string;
	// upscale-image options
	target?: string;
	// vimax options
	noReferences?: boolean;
	projectId?: string;
	// grid upscale
	gridUpscale?: number;
	// search options
	query?: string;
	caseSensitive?: boolean;
	wholeWord?: boolean;
	maxResults?: number;
	// editor options
	mediaId?: string;
	elementId?: string;
	jobId?: string;
	trackId?: string;
	toTrack?: string;
	splitTime?: number;
	seekTime?: number;
	startTime?: number;
	endTime?: number;
	newName?: string;
	changes?: string;
	updates?: string;
	elements?: string;
	cuts?: string;
	items?: string;
	preset?: string;
	threshold?: number;
	timestamps?: string;
	/** Return compact health payload for editor:health */
	statusOnly?: boolean;
	/** Include deep, cross-process probes in editor:health */
	deep?: boolean;
	host?: string;
	port?: string;
	token?: string;
	poll?: boolean;
	/** Include full failure trace context for async polling commands */
	debugTrace?: boolean;
	pollInterval?: number;
	level?: string;
	since?: string;
	limit?: number;
	clear?: boolean;
	interactive?: boolean;
	depth?: number;
	ref?: string;
	replace?: boolean;
	ripple?: boolean;
	crossTrackRipple?: boolean;
	removeFillers?: boolean;
	removeSilences?: boolean;
	html?: string;
	message?: string;
	stack?: string;
	addToTimeline?: boolean;
	includeFillers?: boolean;
	includeSilences?: boolean;
	includeScenes?: boolean;
	toolName?: string;
	clearLog?: boolean;
	data?: string;
	url?: string;
	filename?: string;
	mode?: string;
	gap?: number;
	// generate-remotion options
	exportAfterGenerate?: boolean;
	exportFormat?: string;
	fps?: number;
	width?: number;
	height?: number;
	timeout?: number;
	provider?: string;
	loadSpeech?: boolean;
	// screen-recording options
	sourceId?: string;
	discard?: boolean;
	force?: boolean;
	// ui options
	panel?: string;
	tab?: string;
	// batch generation options
	count?: number;
	/** Prompts for batch generation (alternative to --count with same --text) */
	prompts?: string[];
	/** Include full arrays in project info output */
	full?: boolean;
	/** Use built-in example input (e.g. for novel:parse) */
	example?: boolean;
	/** Output file path for export commands */
	output?: string;
	/** Comma-separated state sections for editor:state:snapshot */
	include?: string;
	/** Skip editor health check (caller guarantees editor is up) */
	skipHealth?: boolean;
	/** Session mode: read commands from stdin, one per line */
	session?: boolean;
	/** Comma-separated sources for batch-import convenience */
	sources?: string;
	/** Skip capability warnings on every request (saves ~1-2s in E2E flows) */
	noCapabilityCheck?: boolean;
	/** Export format (e.g. "mp4", "webm") */
	format?: string;
	/** Set value (e.g. for editor:auth:token --set) */
	set?: string;
	// sticker options
	stickerId?: string;
	x?: number;
	y?: number;
	rotation?: number;
	opacity?: number;
	// translate-video options
	noDynamicDuration?: boolean;
	audioOnly?: boolean;
	speakers?: number;
}

export interface CLIResult {
	success: boolean;
	outputPath?: string;
	outputPaths?: string[];
	error?: string;
	cost?: number;
	duration?: number;
	data?: unknown;
}

export type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;
