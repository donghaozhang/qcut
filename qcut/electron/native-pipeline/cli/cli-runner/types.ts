/**
 * Types for CLI Pipeline Runner.
 * @module electron/native-pipeline/cli/cli-runner/types
 */

/** Generate a unique command correlation ID. */
export function generateCommandId(): string {
	return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Options parsed from CLI arguments for a pipeline command invocation. */
export interface CLIRunOptions {
	command: string;
	/** Unique correlation ID for this command execution. */
	commandId?: string;
	model?: string;
	text?: string;
	imageUrl?: string;
	videoUrl?: string;
	audioUrl?: string;
	sourceGenerationId?: string;
	outputDir: string;
	/** True when the user explicitly passed --output-dir / -o */
	outputDirExplicit?: boolean;
	config?: string;
	input?: string;
	/** Still image used behind a transparent person cutout. */
	background?: string;
	/** Transparent VP9 WebM output path for person-cutout. */
	cutoutOutput?: string;
	/** Background image fit mode: cover, contain, or stretch. */
	backgroundFit?: string;
	/** QCut portrait filter preset ID. */
	portraitFilter?: string;
	/** Portrait filter intensity from 0 to 100. */
	filterIntensity?: number;
	/** Local portrait smoothing amount from 0 to 100. */
	beauty?: number;
	/** Print available portrait filter presets. */
	listPresets?: boolean;
	duration?: string;
	aspectRatio?: string;
	resolution?: string;
	loop?: boolean;
	hdr?: boolean;
	exrExport?: boolean;
	editStrength?: string;
	saveIntermediates: boolean;
	parallel?: boolean;
	maxWorkers?: number;
	policy?: string;
	json: boolean;
	verbose: boolean;
	quiet: boolean;
	category?: string;
	configured?: boolean;
	missing?: boolean;
	prompt?: string;
	layout?: string;
	upscale?: string;
	keyName?: string;
	keyValue?: string;
	email?: string;
	password?: string;
	frontalImage?: string;
	referImages?: string[];
	referVideo?: string;
	elementIds?: string[];
	/** Kling-create-element tag IDs, e.g. ["o_102", "o_105"] */
	tagList?: string[];
	/** Kling V3 Omni sound toggle ("on" | "off") */
	sound?: string;
	/** Kling V3 Omni watermark toggle */
	watermark?: boolean;
	/** `flow lint-scripts`: when true, rewrite chunks in place with a backup */
	autoFix?: boolean;
	/**
	 * `flow novel2video --style-anchor <name>`: catalogued character name
	 * whose portrait is injected as a single reference for shots that have
	 * NO catalogued characters, keeping the visual style consistent across
	 * the scene. Side effect: the anchor character may appear in the frame
	 * because Seedance/Vidu/Kling treat refs as identity cues, not pure
	 * style cues.
	 */
	styleAnchor?: string;
	/**
	 * `flow novel2video --style-prompt <text>`: style keywords prepended
	 * to every shot's prompt before submission. Overrides `project.style`
	 * for this run. Helps keep visual style consistent when the video
	 * model would otherwise drift toward its training bias (e.g. Seedance
	 * pulls toward photorealism even with an anime reference portrait).
	 */
	stylePrompt?: string;
	elementDescription?: string;
	idea?: string;
	genre?: string;
	targetDuration?: string;
	script?: string;
	scenes?: string;
	novel?: string;
	title?: string;
	maxScenes?: number;
	maxClips?: number;
	/** Novel chunk size in characters (novel2script / novel2movie) */
	chunkSize?: number;
	/** Novel chunk overlap in characters (novel2script / novel2movie) */
	overlap?: number;
	scriptsOnly?: boolean;
	storyboardOnly?: boolean;
	maxImages?: number;
	noPortraits?: boolean;
	llmModel?: string;
	imageModel?: string;
	videoModel?: string;
	videoReferenceMode?: string;
	videoReferenceImages?: string[];
	videoConcurrency?: number;
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
	// generate-avatar options (also reused by happy_horse_ref2v / happy_horse_video_edit)
	referenceImages?: string[];
	/** Luma Ray 3.2: repeatable guide frames for video.keyframes */
	keyframeImages?: string[];
	/** Luma Ray 3.2: repeatable output-frame indexes for video.keyframes */
	keyframeIndexes?: string[];
	/** happy_horse_video_edit: 'auto' (model decides) | 'origin' (preserve input audio) */
	audioSetting?: string;
	// analyze-video options
	analysisType?: string;
	outputFormat?: string;
	reviewLanguage?: string;
	reviewPromptDir?: string;
	refs?: string[];
	sceneDetect?: boolean;
	batchSize?: number;
	minSeverity?: string;
	before?: string;
	after?: string;
	// analyze-image-consistency options
	/** Candidate images to check (repeatable --candidate) */
	candidates?: string[];
	/** Directory of candidate images (--dir) */
	dir?: string;
	/** Reusable multi-source media index path (`analyze inspect`, `edit plan`). */
	mediaIndexPath?: string;
	/** Narration audio used for beat timing and timeline views. */
	narration?: string;
	/** Word-timestamp JSON or SRT used for narration alignment. */
	transcript?: string;
	/** Candidate range length used while indexing source media. */
	candidateDuration?: number;
	/** Disable Gemini semantic enrichment while retaining local media metrics. */
	noAi?: boolean;
	/** Do not recurse into nested source directories while indexing. */
	noRecursive?: boolean;
	/** Disable per-clip timeline view rendering for `edit plan`. */
	noTimelineViews?: boolean;
	/** Dissolve duration written to the generated QCut timeline manifest. */
	transitionDuration?: number;
	/** Local Jianying cache root used by read-only transition reference commands. */
	cacheRoot?: string;
	/** Local Jianying project root used to discover plaintext draft evidence. */
	projectRoot?: string;
	databasePaths?: string[];
	draftPaths?: string[];
	/** editor:jianying-import:commit plan token. */
	planToken?: string;
	bundleDigest?: string;
	/** Opaque token returned when an interop writeback requires recovery. */
	recoveryToken?: string;
	/** editor:jianying-import:commit accepted warning fingerprints. */
	acceptedWarningFingerprints?: string[];
	packagePath?: string;
	resourceIds?: string[];
	draftEffectIds?: string[];
	catalogEffectIds?: string[];
	metadataMd5?: string;
	formula?: string;
	ffmpegPath?: string;
	/** EDL path used by `edit verify`. */
	edl?: string;
	/** Seconds rendered around each cut during verification. */
	cutWindow?: number;
	/** Inline rule text used as the verdict basis (--rule) */
	rule?: string;
	/** Path to a rule file whose contents become the verdict basis (--rules-file) */
	rulesFile?: string;
	// upscale-image options
	target?: string;
	// upscale-video options
	video?: string;
	targetFps?: number;
	// vimax options
	noReferences?: boolean;
	projectId?: string;
	/** Cast-wide region (e.g. `east-asian`). Fills empty character ethnicity fields. */
	region?: string;
	/** Cast-quality preset (`natural` | `photogenic` | `model-grade`). */
	castQuality?: string;
	// novel2video options
	/** Cap shots generated this run (default: all shots) */
	maxShots?: number;
	/** Parallel shots in flight (default 1) */
	concurrency?: number;
	/** Fallback model for shots with no catalogued character */
	fallbackModel?: string;
	/** Projected-cost ceiling in USD; --force bypasses */
	costGate?: number;
	// grid options
	grid?: string;
	gridUpscale?: number;
	// search options
	query?: string;
	collection?: string;
	caseSensitive?: boolean;
	wholeWord?: boolean;
	maxResults?: number;
	// editor options
	mediaId?: string;
	elementId?: string;
	jobId?: string;
	trackId?: string;
	fromElementId?: string;
	toElementId?: string;
	trackType?: string;
	index?: number;
	toTrack?: string;
	splitTime?: number;
	seekTime?: number;
	startTime?: number;
	endTime?: number;
	newName?: string;
	/** Project name alias used by editor project create. */
	name?: string;
	/** Open a newly-created or selected project in the editor. */
	open?: boolean;
	/** Wait for the project, media bridge, and timeline bridge to be ready. */
	waitReady?: boolean;
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
	/** Stable semantic pointer target such as panel.text or export.button. */
	from?: string;
	to?: string;
	fromRef?: string;
	toRef?: string;
	fromX?: number;
	fromY?: number;
	toX?: number;
	toY?: number;
	normalizedX?: number;
	normalizedY?: number;
	fromNormalizedX?: number;
	fromNormalizedY?: number;
	toNormalizedX?: number;
	toNormalizedY?: number;
	toTime?: number;
	toIndex?: number;
	via?: string;
	holdMs?: number;
	durationMs?: number;
	steps?: number;
	releaseDelayMs?: number;
	keys?: string;
	intervalMs?: number;
	actions?: string;
	plan?: string;
	record?: string;
	eventTrack?: string;
	prerollMs?: number;
	postrollMs?: number;
	speed?: number;
	skipIdle?: boolean;
	waitFor?: string;
	timeoutMs?: number;
	deltaX?: number;
	deltaY?: number;
	foreground?: boolean;
	replace?: boolean;
	ripple?: boolean;
	crossTrackRipple?: boolean;
	removeFillers?: boolean;
	removeSilences?: boolean;
	silenceThreshold?: number;
	keepPadding?: number;
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
	captureMode?: string;
	recordingQuality?: string;
	discard?: boolean;
	force?: boolean;
	/** Confirm download and installation for `qcut update`. */
	yes?: boolean;
	/** Check the latest QCut version without installing it. */
	checkOnly?: boolean;
	/** Install without relaunching QCut. */
	noLaunch?: boolean;
	// key-sync options (system sync-keys)
	push?: boolean;
	pull?: boolean;
	// `qcut record` standalone options (Phase 1 of dual-mode CLI recording)
	/** Auto-stop recording after N seconds (omit to wait for Ctrl-C) */
	recordDuration?: number;
	/** Cursor wobble intensity 0–2 (export compositor) */
	cursorSway?: number;
	/** Smooth loop return for the cursor path */
	cursorLoop?: boolean;
	/** Motion blur during zoom transitions 0–1 */
	zoomBlur?: number;
	/** Capture microphone audio */
	mic?: boolean;
	/** Capture system audio */
	systemAudio?: boolean;
	/** Fail with ECONNREFUSED instead of auto-launching a headless recorder */
	noAutoLaunch?: boolean;
	// `qcut record-daemon` action flags — mutually-exclusive verbs
	/** Trigger record-daemon stop action */
	stop?: boolean;
	/** Trigger record-daemon start action */
	start?: boolean;
	/** Trigger record-daemon status action (also the default) */
	status?: boolean;
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
	/** Explicit export engine. */
	engine?: string;
	/** Comma-separated timestamps to extract and inspect after export. */
	verifyFrames?: string;
	/** Track name used by editor:track:create/update. */
	trackName?: string;
	/** Declarative editor timeline manifest (inline JSON, @file, or stdin). */
	manifest?: string;
	manifestUrl?: string;
	focus?: boolean;
	downloadDir?: string;
	/** Group timeline apply mutations into a rollback-capable transaction. */
	atomic?: boolean;
	/** Read the result back and verify requested state. */
	verify?: boolean;
	/**
	 * editor:state:snapshot: include raw `data:` thumbnail URLs in the
	 * `media` section. Default is `false` because base64 thumbnails can
	 * push the response past HTTP/IPC transport limits and break JSON
	 * parsing.
	 */
	withThumbnails?: boolean;
	/** editor:snapshot: hard cap on payload size before returning `truncated: true`. */
	maxBytes?: number;
	/** editor:snapshot: hard cap on number of elements walked before returning `truncated: true`. */
	maxNodes?: number;
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
	outputAudio?: boolean;
	speakers?: number;
	// phota options
	profile?: string | string[];
	// snapshot action options
	selectValue?: string;
	checked?: boolean;
	// music generation options
	lyrics?: string;
	instrumental?: boolean;
	sampleRate?: number;
	bitrate?: number;
	audioFormat?: string;
	// speech generation options
	exaggeration?: number;
	temperature?: number;
	maxTokens?: number;
	cfg?: number;
	seed?: number;
	voice?: string;
	stability?: number;
	languageCode?: string;
	volume?: number;
	pitch?: number;
	multilingual?: boolean;
}

/** Standard result returned by a CLI command handler. */
export interface CLIResult {
	success: boolean;
	/**
	 * Which project the editor window is showing. Set only when the payload
	 * cannot carry it — array results such as editor:media:list.
	 */
	view?: unknown;
	endpoint?: string;
	outputPath?: string;
	outputPaths?: string[];
	error?: string;
	cost?: number;
	duration?: number;
	data?: unknown;
}

/** Callback invoked to report command progress to the UI. */
export type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;
