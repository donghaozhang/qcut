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
	type PlatformClaudeAPI,
} from "@qcut/platform-core";

/** Get the electronAPI from window, throwing if unavailable. */
function api(): any {
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
	saveFileDialog: (name?: any, filters?: any) => api().saveFileDialog(name, filters),
	readFile: (p: any) => api().readFile(p),
	writeFile: (p: any, d: any) => api().writeFile(p, d),
	saveBlob: (d: any, name?: any) => api().saveBlob(d, name),
	getFileInfo: (p: any) => api().getFileInfo(p),
};

const storageAdapter = {
	save: (k: any, d: any) => api().storage.save(k, d),
	load: (k: any) => api().storage.load(k),
	remove: (k: any) => api().storage.remove(k),
	list: () => api().storage.list(),
	clear: () => api().storage.clear(),
};

const themeAdapter = {
	get: () => api().theme.get(),
	set: (t: any) => api().theme.set(t),
	toggle: () => api().theme.toggle(),
	isDark: () => api().theme.isDark(),
};

const shellAdapter = {
	showItemInFolder: (p: any) => api().shell.showItemInFolder(p),
	openExternal: (u: any) => api().shell.openExternal(u),
};

const apiKeysAdapter = {
	get: () => api().apiKeys.get(),
	set: (k: any) => api().apiKeys.set(k),
	clear: () => api().apiKeys.clear(),
	status: () => api().apiKeys.status(),
};

const licenseAdapter = {
	check: () => api().license.check(),
	activate: (t: any) => api().license.activate(t),
	deactivate: () => api().license.deactivate(),
	trackUsage: (t: any) => api().license.trackUsage(t),
	deductCredits: (a: any, m: any, d: any) => api().license.deductCredits(a, m, d),
	setAuthToken: (t: any) => api().license.setAuthToken(t),
	clearAuthToken: () => api().license.clearAuthToken(),
	emailLogin: (e: any, p: any) => api().license.emailLogin(e, p),
	emailSignup: (n: any, e: any, p: any) => api().license.emailSignup(n, e, p),
	getGoogleLoginUrl: () => api().license.getGoogleLoginUrl(),
	onActivationToken: (cb: any) => api().license.onActivationToken?.(cb),
};

const soundsAdapter = {
	search: (p: any) => api().sounds.search(p),
	downloadPreview: (p: any) => api().sounds.downloadPreview(p),
};

const audioAdapter = {
	saveTemp: (d: any, f: any) => api().audio.saveTemp(d, f),
};

const videoAdapter = {
	saveTemp: (d: any, f: any, s?: any) => api().video.saveTemp(d, f, s),
	saveToDisk: (o: any) => api().video.saveToDisk(o),
	verifyFile: (p: any) => api().video.verifyFile(p),
	deleteFile: (p: any) => api().video.deleteFile(p),
	getProjectDir: (id: any) => api().video.getProjectDir(id),
};

const screenshotAdapter = {
	capture: (o?: any) => api().screenshot.capture(o),
};

const screenRecordingAdapter = {
	getSources: () => api().screenRecording.getSources(),
	start: (o?: any) => api().screenRecording.start(o),
	appendChunk: (o: any) => api().screenRecording.appendChunk(o),
	stop: (o?: any) => api().screenRecording.stop(o),
	getStatus: () => api().screenRecording.getStatus(),
};

const ffmpegAdapter = {
	createExportSession: () => api().ffmpeg.createExportSession(),
	saveFrame: (d: any) => api().ffmpeg.saveFrame(d),
	exportVideoCLI: (o: any) => api().ffmpeg.exportVideoCLI(o),
	readOutputFile: (p: any) => api().ffmpeg.readOutputFile(p),
	cleanupExportSession: (id: any) => api().ffmpeg.cleanupExportSession(id),
	openFramesFolder: (id: any) => api().ffmpeg.openFramesFolder(id),
	extractAudio: (o: any) => api().ffmpeg.extractAudio(o),
	saveStickerForExport: (d: any) => api().ffmpeg.saveStickerForExport(d),
	processFrame: (o: any) => api().ffmpeg.processFrame(o),
	validateFilterChain: (f: any) => api().ffmpeg.validateFilterChain(f),
	getFFmpegResourcePath: (f: any) => api().ffmpeg.getFFmpegResourcePath(f),
	checkFFmpegResource: (f: any) => api().ffmpeg.checkFFmpegResource(f),
	getPath: () => api().ffmpeg.getPath(),
	checkHealth: () => api().ffmpeg.checkHealth(),
};

const transcriptionAdapter = {
	transcribe: (r: any) => api().transcribe.transcribe(r),
	cancel: (id: any) => api().transcribe.cancel(id),
	elevenlabs: (o: any) => api().transcribe.elevenlabs(o),
	uploadToFal: (p: any) => api().transcribe.uploadToFal(p),
};

const falAdapter = {
	uploadVideo: (d: any, f: any, k: any) => api().fal.uploadVideo(d, f, k),
	uploadImage: (d: any, f: any, k: any) => api().fal.uploadImage(d, f, k),
	uploadAudio: (d: any, f: any, k: any) => api().fal.uploadAudio(d, f, k),
	queueFetch: (u: any, k: any) => api().fal.queueFetch(u, k),
};

const geminiChatAdapter = {
	send: (r: any) => api().geminiChat.send(r),
	onStreamChunk: (cb: any) => api().geminiChat.onStreamChunk(cb),
	onStreamComplete: (cb: any) => api().geminiChat.onStreamComplete(cb),
	onStreamError: (cb: any) => api().geminiChat.onStreamError(cb),
	removeListeners: () => api().geminiChat.removeListeners(),
};

const githubAdapter = {
	fetchStars: () => api().github.fetchStars(),
};

const youtubeAdapter = {
	upload: (o: any) => api().youtube.upload(o),
	checkAuth: () => api().youtube.checkAuth(),
	onUploadProgress: (cb: any) => api().youtube.onUploadProgress(cb),
};

const ptyAdapter = {
	spawn: (o?: any) => api().pty.spawn(o),
	write: (id: any, d: any) => api().pty.write(id, d),
	resize: (id: any, c: any, r: any) => api().pty.resize(id, c, r),
	kill: (id: any) => api().pty.kill(id),
	killAll: () => api().pty.killAll(),
	onData: (cb: any) => api().pty.onData(cb),
	onExit: (cb: any) => api().pty.onExit(cb),
	removeListeners: () => api().pty.removeListeners(),
};

const mcpAdapter = {
	onAppHtml: (cb: any) => api().mcp.onAppHtml(cb),
	removeListeners: () => api().mcp.removeListeners(),
};

const skillsAdapter = {
	list: (id: any) => api().skills.list(id),
	import: (id: any, p: any) => api().skills.import(id, p),
	delete: (id: any, s: any) => api().skills.delete(id, s),
	getContent: (id: any, s: any, f: any) => api().skills.getContent(id, s, f),
	browse: () => api().skills.browse(),
	getPath: (id: any) => api().skills.getPath(id),
	scanGlobal: () => api().skills.scanGlobal(),
	syncForClaude: (id: any) => api().skills.syncForClaude(id),
};

const aiPipelineAdapter = {
	check: () => api().aiPipeline.check(),
	status: () => api().aiPipeline.status(),
	generate: (o: Record<string, unknown>) => api().aiPipeline.generate(o),
	listModels: () => api().aiPipeline.listModels(),
	estimateCost: (o: Record<string, unknown>) => api().aiPipeline.estimateCost(o),
	cancel: (id: string) => api().aiPipeline.cancel(id),
	refresh: () => api().aiPipeline.refresh(),
	onProgress: (cb: (data: unknown) => void) => api().aiPipeline.onProgress(cb),
};

const mediaImportAdapter = {
	import: (o: Record<string, unknown>) => api().mediaImport.import(o),
	validateSymlink: (p: string) => api().mediaImport.validateSymlink(p),
	locateOriginal: (p: string) => api().mediaImport.locateOriginal(p),
	relinkMedia: (id: string, m: string, p: string) => api().mediaImport.relinkMedia(id, m, p),
	remove: (id: string, m: string) => api().mediaImport.remove(id, m),
	checkSymlinkSupport: () => api().mediaImport.checkSymlinkSupport(),
	getMediaPath: (id: string) => api().mediaImport.getMediaPath(id),
};

// These adapters use pass-through delegation with type casts because the
// PlatformAPI interface uses simplified types that don't exactly match the
// Electron preload types. The runtime behavior is identical — the adapter
// just forwards calls to window.electronAPI.
const projectFolderAdapter = {
	getRoot: (id: string) => api().projectFolder.getRoot(id),
	scan: (id: string, p?: string, o?: Record<string, unknown>) => api().projectFolder.scan(id, p, o),
	list: (id: string, p?: string) => api().projectFolder.list(id, p),
	ensureStructure: (id: string) => api().projectFolder.ensureStructure(id),
};

const projectJsonAdapter = {
	write: (id: string) => api().projectJson.write(id),
};

const remotionFolderAdapter = {
	select: () => api().remotionFolder.select(),
	scan: (p: string) => api().remotionFolder.scan(p),
	bundle: (p: string, ids?: string[]) => api().remotionFolder.bundle(p, ids),
	import: (p: string) => api().remotionFolder.import(p),
	checkBundler: () => api().remotionFolder.checkBundler(),
	validate: (p: string) => api().remotionFolder.validate(p),
	bundleFile: (p: string, id: string) => api().remotionFolder.bundleFile(p, id),
};

const moyinAdapter = {
	parseScript: (o: Record<string, unknown>) => api().moyin.parseScript(o),
	generateStoryboard: (o: Record<string, unknown>) => api().moyin.generateStoryboard(o),
	callLLM: (o: Record<string, unknown>) => api().moyin.callLLM(o),
	isClaudeAvailable: () => api().moyin.isClaudeAvailable(),
	saveTempScript: (o: { rawScript: string }) => api().moyin.saveTempScript(o),
	cleanupTempScript: (p: string) => api().moyin.cleanupTempScript(p),
	onParsed: (cb: (data: unknown) => void) => api().moyin.onParsed(cb),
	removeParseListener: () => api().moyin.removeParseListener(),
	onSetScript: (cb: (data: { text: string }) => void) => api().moyin.onSetScript(cb),
	onTriggerParse: (cb: () => void) => api().moyin.onTriggerParse(cb),
	onGenerateScript: (cb: (data: { idea: string; genre?: string; targetDuration?: string }) => void) => api().moyin.onGenerateScript(cb),
	onStatusRequest: (cb: (data: { requestId: string }) => void) => api().moyin.onStatusRequest(cb),
	sendStatusResponse: (id: string, r?: Record<string, unknown>, e?: string) => api().moyin.sendStatusResponse(id, r, e),
	onExportRequest: (cb: (data: { requestId: string }) => void) => api().moyin.onExportRequest(cb),
	sendExportResponse: (id: string, r?: Record<string, unknown>, e?: string) => api().moyin.sendExportResponse(id, r, e),
	removeMoyinBridgeListeners: () => api().moyin.removeMoyinBridgeListeners(),
};

const updatesAdapter = {
	checkForUpdates: () => api().updates.checkForUpdates(),
	installUpdate: () => api().updates.installUpdate(),
	getReleaseNotes: (v?: string) => api().updates.getReleaseNotes(v),
	getChangelog: () => api().updates.getChangelog(),
	onUpdateAvailable: (cb: (data: { version: string; releaseNotes?: string; releaseDate?: string }) => void) => api().updates.onUpdateAvailable(cb),
	onDownloadProgress: (cb: (data: { percent: number; transferred: number; total: number }) => void) => api().updates.onDownloadProgress(cb),
	onUpdateDownloaded: (cb: (data: { version: string }) => void) => api().updates.onUpdateDownloaded(cb),
};

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
		analyzeFillers: (o: any) => api().analyzeFillers(o),

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
