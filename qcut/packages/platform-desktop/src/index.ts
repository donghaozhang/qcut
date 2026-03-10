/**
 * Desktop (Electron) platform adapter.
 *
 * Thin wrapper that delegates all calls to `window.electronAPI`.
 * This adapter provides the full capability set.
 *
 * @module @qcut/platform-desktop
 */

import {
	PlatformCapability,
	isPlatformCapable,
	type PlatformAPI,
	type PlatformFilesAPI,
	type PlatformStorageAPI,
	type PlatformThemeAPI,
	type PlatformShellAPI,
	type PlatformApiKeysAPI,
	type PlatformLicenseAPI,
	type PlatformSoundsAPI,
	type PlatformAudioAPI,
	type PlatformVideoAPI,
	type PlatformScreenshotAPI,
	type PlatformScreenRecordingAPI,
	type PlatformFFmpegAPI,
	type PlatformTranscriptionAPI,
	type PlatformFalAPI,
	type PlatformGeminiChatAPI,
	type PlatformGitHubAPI,
	type PlatformYouTubeAPI,
	type PlatformPtyAPI,
	type PlatformMcpAPI,
	type PlatformSkillsAPI,
	type PlatformAIPipelineAPI,
	type PlatformMediaImportAPI,
	type PlatformProjectFolderAPI,
	type PlatformProjectJsonAPI,
	type PlatformRemotionFolderAPI,
	type PlatformMoyinAPI,
	type PlatformUpdatesAPI,
	type PlatformClaudeAPI,
} from "@qcut/platform-core";

/** Get the electronAPI from window, throwing if unavailable. */
function api() {
	if (!window.electronAPI) {
		throw new Error("window.electronAPI is not available");
	}
	return window.electronAPI;
}

// ---------------------------------------------------------------------------
// Namespace adapters — thin pass-through to window.electronAPI
// ---------------------------------------------------------------------------

const filesAdapter = {
	openFileDialog: () => api().openFileDialog(),
	openMultipleFilesDialog: () => api().openMultipleFilesDialog(),
	saveFileDialog: (name?, filters?) => api().saveFileDialog(name, filters),
	readFile: (p) => api().readFile(p),
	writeFile: (p, d) => api().writeFile(p, d),
	saveBlob: (d, name?) => api().saveBlob(d, name),
	getFileInfo: (p) => api().getFileInfo(p),
};

const storageAdapter = {
	save: (k, d) => api().storage.save(k, d),
	load: (k) => api().storage.load(k),
	remove: (k) => api().storage.remove(k),
	list: () => api().storage.list(),
	clear: () => api().storage.clear(),
};

const themeAdapter = {
	get: () => api().theme.get(),
	set: (t) => api().theme.set(t),
	toggle: () => api().theme.toggle(),
	isDark: () => api().theme.isDark(),
};

const shellAdapter = {
	showItemInFolder: (p) => api().shell.showItemInFolder(p),
	openExternal: (u) => api().shell.openExternal(u),
};

const apiKeysAdapter = {
	get: () => api().apiKeys.get(),
	set: (k) => api().apiKeys.set(k),
	clear: () => api().apiKeys.clear(),
	status: () => api().apiKeys.status(),
};

const licenseAdapter = {
	check: () => api().license.check(),
	activate: (t) => api().license.activate(t),
	deactivate: () => api().license.deactivate(),
	trackUsage: (t) => api().license.trackUsage(t),
	deductCredits: (a, m, d) => api().license.deductCredits(a, m, d),
	setAuthToken: (t) => api().license.setAuthToken(t),
	clearAuthToken: () => api().license.clearAuthToken(),
	emailLogin: (e, p) => api().license.emailLogin(e, p),
	emailSignup: (n, e, p) => api().license.emailSignup(n, e, p),
	getGoogleLoginUrl: () => api().license.getGoogleLoginUrl(),
	onActivationToken: (cb) => api().license.onActivationToken?.(cb),
};

const soundsAdapter = {
	search: (p) => api().sounds.search(p),
	downloadPreview: (p) => api().sounds.downloadPreview(p),
};

const audioAdapter = {
	saveTemp: (d, f) => api().audio.saveTemp(d, f),
};

const videoAdapter = {
	saveTemp: (d, f, s?) => api().video.saveTemp(d, f, s),
	saveToDisk: (o) => api().video.saveToDisk(o),
	verifyFile: (p) => api().video.verifyFile(p),
	deleteFile: (p) => api().video.deleteFile(p),
	getProjectDir: (id) => api().video.getProjectDir(id),
};

const screenshotAdapter = {
	capture: (o?) => api().screenshot.capture(o),
};

const screenRecordingAdapter = {
	getSources: () => api().screenRecording.getSources(),
	start: (o?) => api().screenRecording.start(o),
	appendChunk: (o) => api().screenRecording.appendChunk(o),
	stop: (o?) => api().screenRecording.stop(o),
	getStatus: () => api().screenRecording.getStatus(),
};

const ffmpegAdapter = {
	createExportSession: () => api().ffmpeg.createExportSession(),
	saveFrame: (d) => api().ffmpeg.saveFrame(d),
	exportVideoCLI: (o) => api().ffmpeg.exportVideoCLI(o),
	readOutputFile: (p) => api().ffmpeg.readOutputFile(p),
	cleanupExportSession: (id) => api().ffmpeg.cleanupExportSession(id),
	openFramesFolder: (id) => api().ffmpeg.openFramesFolder(id),
	extractAudio: (o) => api().ffmpeg.extractAudio(o),
	saveStickerForExport: (d) => api().ffmpeg.saveStickerForExport(d),
	processFrame: (o) => api().ffmpeg.processFrame(o),
	validateFilterChain: (f) => api().ffmpeg.validateFilterChain(f),
	getFFmpegResourcePath: (f) => api().ffmpeg.getFFmpegResourcePath(f),
	checkFFmpegResource: (f) => api().ffmpeg.checkFFmpegResource(f),
	getPath: () => api().ffmpeg.getPath(),
	checkHealth: () => api().ffmpeg.checkHealth(),
};

const transcriptionAdapter = {
	transcribe: (r) => api().transcribe.transcribe(r),
	cancel: (id) => api().transcribe.cancel(id),
	elevenlabs: (o) => api().transcribe.elevenlabs(o),
	uploadToFal: (p) => api().transcribe.uploadToFal(p),
};

const falAdapter = {
	uploadVideo: (d, f, k) => api().fal.uploadVideo(d, f, k),
	uploadImage: (d, f, k) => api().fal.uploadImage(d, f, k),
	uploadAudio: (d, f, k) => api().fal.uploadAudio(d, f, k),
	queueFetch: (u, k) => api().fal.queueFetch(u, k),
};

const geminiChatAdapter = {
	send: (r) => api().geminiChat.send(r),
	onStreamChunk: (cb) => api().geminiChat.onStreamChunk(cb),
	onStreamComplete: (cb) => api().geminiChat.onStreamComplete(cb),
	onStreamError: (cb) => api().geminiChat.onStreamError(cb),
	removeListeners: () => api().geminiChat.removeListeners(),
};

const githubAdapter = {
	fetchStars: () => api().github.fetchStars(),
};

const youtubeAdapter = {
	upload: (o) => api().youtube.upload(o),
	checkAuth: () => api().youtube.checkAuth(),
	onUploadProgress: (cb) => api().youtube.onUploadProgress(cb),
};

const ptyAdapter = {
	spawn: (o?) => api().pty.spawn(o),
	write: (id, d) => api().pty.write(id, d),
	resize: (id, c, r) => api().pty.resize(id, c, r),
	kill: (id) => api().pty.kill(id),
	killAll: () => api().pty.killAll(),
	onData: (cb) => api().pty.onData(cb),
	onExit: (cb) => api().pty.onExit(cb),
	removeListeners: () => api().pty.removeListeners(),
};

const mcpAdapter = {
	onAppHtml: (cb) => api().mcp?.onAppHtml(cb),
	removeListeners: () => api().mcp?.removeListeners(),
};

const skillsAdapter = {
	list: (id) => api().skills!.list(id),
	import: (id, p) => api().skills!.import(id, p),
	delete: (id, s) => api().skills!.delete(id, s),
	getContent: (id, s, f) => api().skills!.getContent(id, s, f),
	browse: () => api().skills!.browse(),
	getPath: (id) => api().skills!.getPath(id),
	scanGlobal: () => api().skills!.scanGlobal(),
	syncForClaude: (id) => api().skills!.syncForClaude(id),
};

const aiPipelineAdapter = {
	check: () => api().aiPipeline!.check(),
	status: () => api().aiPipeline!.status(),
	generate: (o: Record<string, unknown>) => api().aiPipeline!.generate(o as never),
	listModels: () => api().aiPipeline!.listModels(),
	estimateCost: (o: Record<string, unknown>) => api().aiPipeline!.estimateCost(o as never),
	cancel: (id: string) => api().aiPipeline!.cancel(id),
	refresh: () => api().aiPipeline!.refresh(),
	onProgress: (cb: (data: unknown) => void) => api().aiPipeline!.onProgress(cb as never),
} as unknown as PlatformAIPipelineAPI;

const mediaImportAdapter = {
	import: (o: Record<string, unknown>) => api().mediaImport!.import(o as never),
	validateSymlink: (p: string) => api().mediaImport!.validateSymlink(p),
	locateOriginal: (p: string) => api().mediaImport!.locateOriginal(p),
	relinkMedia: (id: string, m: string, p: string) => api().mediaImport!.relinkMedia(id, m, p),
	remove: (id: string, m: string) => api().mediaImport!.remove(id, m),
	checkSymlinkSupport: () => api().mediaImport!.checkSymlinkSupport(),
	getMediaPath: (id: string) => api().mediaImport!.getMediaPath(id),
} as unknown as PlatformMediaImportAPI;

// These adapters use pass-through delegation with type casts because the
// PlatformAPI interface uses simplified types that don't exactly match the
// Electron preload types. The runtime behavior is identical — the adapter
// just forwards calls to window.electronAPI.
const projectFolderAdapter = {
	getRoot: (id: string) => api().projectFolder!.getRoot(id),
	scan: (id: string, p?: string, o?: Record<string, unknown>) => api().projectFolder!.scan(id, p, o),
	list: (id: string, p?: string) => api().projectFolder!.list(id, p),
	ensureStructure: (id: string) => api().projectFolder!.ensureStructure(id),
} as unknown as PlatformProjectFolderAPI;

const projectJsonAdapter = {
	write: (id: string) => api().projectJson!.write(id),
} as unknown as PlatformProjectJsonAPI;

const remotionFolderAdapter = {
	select: () => api().remotionFolder!.select(),
	scan: (p: string) => api().remotionFolder!.scan(p),
	bundle: (p: string, ids?: string[]) => api().remotionFolder!.bundle(p, ids),
	import: (p: string) => api().remotionFolder!.import(p),
	checkBundler: () => api().remotionFolder!.checkBundler(),
	validate: (p: string) => api().remotionFolder!.validate(p),
	bundleFile: (p: string, id: string) => api().remotionFolder!.bundleFile(p, id),
} as unknown as PlatformRemotionFolderAPI;

const moyinAdapter = {
	parseScript: (o: Record<string, unknown>) => api().moyin!.parseScript(o as never),
	generateStoryboard: (o: Record<string, unknown>) => api().moyin!.generateStoryboard(o as never),
	callLLM: (o: Record<string, unknown>) => api().moyin!.callLLM(o as never),
	isClaudeAvailable: () => api().moyin!.isClaudeAvailable(),
	saveTempScript: (o: { rawScript: string }) => api().moyin!.saveTempScript(o),
	cleanupTempScript: (p: string) => api().moyin!.cleanupTempScript(p),
	onParsed: (cb: (data: unknown) => void) => api().moyin!.onParsed(cb),
	removeParseListener: () => api().moyin!.removeParseListener(),
	onSetScript: (cb: (data: { text: string }) => void) => api().moyin!.onSetScript(cb),
	onTriggerParse: (cb: () => void) => api().moyin!.onTriggerParse(cb),
	onGenerateScript: (cb: (data: { idea: string; genre?: string; targetDuration?: string }) => void) => api().moyin!.onGenerateScript(cb),
	onStatusRequest: (cb: (data: { requestId: string }) => void) => api().moyin!.onStatusRequest(cb),
	sendStatusResponse: (id: string, r?: Record<string, unknown>, e?: string) => api().moyin!.sendStatusResponse(id, r, e),
	onExportRequest: (cb: (data: { requestId: string }) => void) => api().moyin!.onExportRequest(cb),
	sendExportResponse: (id: string, r?: Record<string, unknown>, e?: string) => api().moyin!.sendExportResponse(id, r, e),
	removeMoyinBridgeListeners: () => api().moyin!.removeMoyinBridgeListeners(),
} as unknown as PlatformMoyinAPI;

const updatesAdapter = {
	checkForUpdates: () => api().updates!.checkForUpdates(),
	installUpdate: () => api().updates!.installUpdate(),
	getReleaseNotes: (v?: string) => api().updates!.getReleaseNotes(v),
	getChangelog: () => api().updates!.getChangelog(),
	onUpdateAvailable: (cb: (data: { version: string; releaseNotes?: string; releaseDate?: string }) => void) => api().updates!.onUpdateAvailable(cb),
	onDownloadProgress: (cb: (data: { percent: number; transferred: number; total: number }) => void) => api().updates!.onDownloadProgress(cb),
	onUpdateDownloaded: (cb: (data: { version: string }) => void) => api().updates!.onUpdateDownloaded(cb),
} as unknown as PlatformUpdatesAPI;

function createClaudeAdapter(): PlatformClaudeAPI | undefined {
	const c = api().claude;
	if (!c) return undefined;
	return c as unknown as PlatformClaudeAPI;
}

// ---------------------------------------------------------------------------
// Exported adapter
// ---------------------------------------------------------------------------

export function createDesktopAdapter(): PlatformAPI {
	// The adapter delegates all calls to window.electronAPI.
	// Type assertions are needed because PlatformAPI uses simplified
	// cross-platform types that don't exactly match Electron's preload types.
	// Runtime behavior is identical — this is purely a type-level concern.
	return ({
		platform: "desktop",
		isElectron: true,
		hasCapability: (cap: PlatformCapability) =>
			isPlatformCapable("desktop", cap),
		getPathForFile: (file: File) => api().getPathForFile(file),
		analyzeFillers: (o) => api().analyzeFillers(o),

		files: filesAdapter,
		storage: storageAdapter,
		theme: themeAdapter,
		shell: shellAdapter,
		apiKeys: apiKeysAdapter,
		license: licenseAdapter,
		sounds: soundsAdapter,
		audio: audioAdapter,
		video: videoAdapter,
		screenshot: screenshotAdapter,
		screenRecording: screenRecordingAdapter,
		ffmpeg: ffmpegAdapter,
		transcription: transcriptionAdapter,
		fal: falAdapter,
		geminiChat: geminiChatAdapter,
		github: githubAdapter,
		youtube: youtubeAdapter,
		pty: ptyAdapter,
		mcp: mcpAdapter,
		skills: skillsAdapter,
		aiPipeline: aiPipelineAdapter,
		mediaImport: mediaImportAdapter,
		projectFolder: projectFolderAdapter,
		projectJson: projectJsonAdapter,
		remotionFolder: remotionFolderAdapter,
		moyin: moyinAdapter,
		updates: updatesAdapter,
		claude: createClaudeAdapter(),
	}) as unknown as PlatformAPI;
}
