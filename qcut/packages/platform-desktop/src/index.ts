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

const filesAdapter: PlatformFilesAPI = {
	openFileDialog: () => api().openFileDialog(),
	openMultipleFilesDialog: () => api().openMultipleFilesDialog(),
	saveFileDialog: (name?, filters?) => api().saveFileDialog(name, filters),
	readFile: (p) => api().readFile(p),
	writeFile: (p, d) => api().writeFile(p, d),
	saveBlob: (d, name?) => api().saveBlob(d, name),
	getFileInfo: (p) => api().getFileInfo(p),
};

const storageAdapter: PlatformStorageAPI = {
	save: (k, d) => api().storage.save(k, d),
	load: (k) => api().storage.load(k),
	remove: (k) => api().storage.remove(k),
	list: () => api().storage.list(),
	clear: () => api().storage.clear(),
};

const themeAdapter: PlatformThemeAPI = {
	get: () => api().theme.get(),
	set: (t) => api().theme.set(t),
	toggle: () => api().theme.toggle(),
	isDark: () => api().theme.isDark(),
};

const shellAdapter: PlatformShellAPI = {
	showItemInFolder: (p) => api().shell.showItemInFolder(p),
	openExternal: (u) => api().shell.openExternal(u),
};

const apiKeysAdapter: PlatformApiKeysAPI = {
	get: () => api().apiKeys.get(),
	set: (k) => api().apiKeys.set(k),
	clear: () => api().apiKeys.clear(),
	status: () => api().apiKeys.status(),
};

const licenseAdapter: PlatformLicenseAPI = {
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

const soundsAdapter: PlatformSoundsAPI = {
	search: (p) => api().sounds.search(p),
	downloadPreview: (p) => api().sounds.downloadPreview(p),
};

const audioAdapter: PlatformAudioAPI = {
	saveTemp: (d, f) => api().audio.saveTemp(d, f),
};

const videoAdapter: PlatformVideoAPI = {
	saveTemp: (d, f, s?) => api().video.saveTemp(d, f, s),
	saveToDisk: (o) => api().video.saveToDisk(o),
	verifyFile: (p) => api().video.verifyFile(p),
	deleteFile: (p) => api().video.deleteFile(p),
	getProjectDir: (id) => api().video.getProjectDir(id),
};

const screenshotAdapter: PlatformScreenshotAPI = {
	capture: (o?) => api().screenshot.capture(o),
};

const screenRecordingAdapter: PlatformScreenRecordingAPI = {
	getSources: () => api().screenRecording.getSources(),
	start: (o?) => api().screenRecording.start(o),
	appendChunk: (o) => api().screenRecording.appendChunk(o),
	stop: (o?) => api().screenRecording.stop(o),
	getStatus: () => api().screenRecording.getStatus(),
};

const ffmpegAdapter: PlatformFFmpegAPI = {
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

const transcriptionAdapter: PlatformTranscriptionAPI = {
	transcribe: (r) => api().transcribe.transcribe(r),
	cancel: (id) => api().transcribe.cancel(id),
	elevenlabs: (o) => api().transcribe.elevenlabs(o),
	uploadToFal: (p) => api().transcribe.uploadToFal(p),
};

const falAdapter: PlatformFalAPI = {
	uploadVideo: (d, f, k) => api().fal.uploadVideo(d, f, k),
	uploadImage: (d, f, k) => api().fal.uploadImage(d, f, k),
	uploadAudio: (d, f, k) => api().fal.uploadAudio(d, f, k),
	queueFetch: (u, k) => api().fal.queueFetch(u, k),
};

const geminiChatAdapter: PlatformGeminiChatAPI = {
	send: (r) => api().geminiChat.send(r),
	onStreamChunk: (cb) => api().geminiChat.onStreamChunk(cb),
	onStreamComplete: (cb) => api().geminiChat.onStreamComplete(cb),
	onStreamError: (cb) => api().geminiChat.onStreamError(cb),
	removeListeners: () => api().geminiChat.removeListeners(),
};

const githubAdapter: PlatformGitHubAPI = {
	fetchStars: () => api().github.fetchStars(),
};

const youtubeAdapter: PlatformYouTubeAPI = {
	upload: (o) => api().youtube.upload(o),
	checkAuth: () => api().youtube.checkAuth(),
	onUploadProgress: (cb) => api().youtube.onUploadProgress(cb),
};

const ptyAdapter: PlatformPtyAPI = {
	spawn: (o?) => api().pty.spawn(o),
	write: (id, d) => api().pty.write(id, d),
	resize: (id, c, r) => api().pty.resize(id, c, r),
	kill: (id) => api().pty.kill(id),
	killAll: () => api().pty.killAll(),
	onData: (cb) => api().pty.onData(cb),
	onExit: (cb) => api().pty.onExit(cb),
	removeListeners: () => api().pty.removeListeners(),
};

const mcpAdapter: PlatformMcpAPI = {
	onAppHtml: (cb) => api().mcp?.onAppHtml(cb),
	removeListeners: () => api().mcp?.removeListeners(),
};

const skillsAdapter: PlatformSkillsAPI = {
	list: (id) => api().skills.list(id),
	import: (id, p) => api().skills.import(id, p),
	delete: (id, s) => api().skills.delete(id, s),
	getContent: (id, s, f) => api().skills.getContent(id, s, f),
	browse: () => api().skills.browse(),
	getPath: (id) => api().skills.getPath(id),
	scanGlobal: () => api().skills.scanGlobal(),
	syncForClaude: (id) => api().skills.syncForClaude(id),
};

const aiPipelineAdapter: PlatformAIPipelineAPI = {
	check: () => api().aiPipeline.check(),
	status: () => api().aiPipeline.status(),
	generate: (o) => api().aiPipeline.generate(o),
	listModels: () => api().aiPipeline.listModels(),
	estimateCost: (o) => api().aiPipeline.estimateCost(o),
	cancel: (id) => api().aiPipeline.cancel(id),
	refresh: () => api().aiPipeline.refresh(),
	onProgress: (cb) => api().aiPipeline.onProgress(cb),
};

const mediaImportAdapter: PlatformMediaImportAPI = {
	import: (o) => api().mediaImport.import(o),
	validateSymlink: (p) => api().mediaImport.validateSymlink(p),
	locateOriginal: (p) => api().mediaImport.locateOriginal(p),
	relinkMedia: (id, m, p) => api().mediaImport.relinkMedia(id, m, p),
	remove: (id, m) => api().mediaImport.remove(id, m),
	checkSymlinkSupport: () => api().mediaImport.checkSymlinkSupport(),
	getMediaPath: (id) => api().mediaImport.getMediaPath(id),
};

const projectFolderAdapter: PlatformProjectFolderAPI = {
	getRoot: (id) => api().projectFolder.getRoot(id),
	scan: (id, p?, o?) => api().projectFolder.scan(id, p, o),
	list: (id, p?) => api().projectFolder.list(id, p),
	ensureStructure: (id) => api().projectFolder.ensureStructure(id),
};

const projectJsonAdapter: PlatformProjectJsonAPI = {
	write: (id) => api().projectJson.write(id),
};

const remotionFolderAdapter: PlatformRemotionFolderAPI = {
	select: () => api().remotionFolder.select(),
	scan: (p) => api().remotionFolder.scan(p),
	bundle: (p, ids?) => api().remotionFolder.bundle(p, ids),
	import: (p) => api().remotionFolder.import(p),
	checkBundler: () => api().remotionFolder.checkBundler(),
	validate: (p) => api().remotionFolder.validate(p),
	bundleFile: (p, id) => api().remotionFolder.bundleFile(p, id),
};

const moyinAdapter: PlatformMoyinAPI = {
	parseScript: (o) => api().moyin.parseScript(o),
	generateStoryboard: (o) => api().moyin.generateStoryboard(o),
	callLLM: (o) => api().moyin.callLLM(o),
	isClaudeAvailable: () => api().moyin.isClaudeAvailable(),
	saveTempScript: (o) => api().moyin.saveTempScript(o),
	cleanupTempScript: (p) => api().moyin.cleanupTempScript(p),
	onParsed: (cb) => api().moyin.onParsed(cb),
	removeParseListener: () => api().moyin.removeParseListener(),
	onSetScript: (cb) => api().moyin.onSetScript(cb),
	onTriggerParse: (cb) => api().moyin.onTriggerParse(cb),
	onGenerateScript: (cb) => api().moyin.onGenerateScript(cb),
	onStatusRequest: (cb) => api().moyin.onStatusRequest(cb),
	sendStatusResponse: (id, r?, e?) => api().moyin.sendStatusResponse(id, r, e),
	onExportRequest: (cb) => api().moyin.onExportRequest(cb),
	sendExportResponse: (id, r?, e?) => api().moyin.sendExportResponse(id, r, e),
	removeMoyinBridgeListeners: () => api().moyin.removeMoyinBridgeListeners(),
};

const updatesAdapter: PlatformUpdatesAPI = {
	checkForUpdates: () => api().updates.checkForUpdates(),
	installUpdate: () => api().updates.installUpdate(),
	getReleaseNotes: (v?) => api().updates.getReleaseNotes(v),
	getChangelog: () => api().updates.getChangelog(),
	onUpdateAvailable: (cb) => api().updates.onUpdateAvailable(cb),
	onDownloadProgress: (cb) => api().updates.onDownloadProgress(cb),
	onUpdateDownloaded: (cb) => api().updates.onUpdateDownloaded(cb),
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
	return {
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
	};
}
