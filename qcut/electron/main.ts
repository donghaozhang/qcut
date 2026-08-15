/**
 * Electron Main Process
 *
 * Entry point for the QCut desktop application. Handles window management,
 * IPC communication, protocol registration, and integration with system features.
 *
 * @module electron/main
 */

import {
	app,
	autoUpdater as nativeAutoUpdater,
	BrowserWindow,
	dialog,
	ipcMain,
	Notification,
	protocol,
	session,
	screen,
	shell,
	OnHeadersReceivedListenerDetails,
	HeadersReceivedResponse,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";
import { parseChangelog } from "./release-notes-utils.js";
import { registerMainIpcHandlers } from "./main-ipc.js";
import { setupApplicationMenu } from "./app-menu.js";
import { registerAppProtocol } from "./app-protocol-handler.js";
import {
	createAutoUpdateController,
	type AutoUpdateController,
	type AutoUpdaterLike,
} from "./auto-update-controller.js";
import { resolveAutoUpdateConfig } from "./auto-update-config.js";
import {
	createStagedUpdateVisibility,
	type StagedUpdateVisibility,
} from "./update-staged-visibility.js";
import {
	createCodexPluginUpdateController,
	type CodexPluginUpdateController,
} from "./codex-plugin-update-controller.js";
import {
	startUtilityProcess,
	stopUtilityProcess,
	setupUtilityPtyIPC,
	cleanupUtilityProcess,
} from "./utility/utility-bridge.js";
import { resolveInitialWindowSize } from "./window-sizing.js";
import { toReleaseVersion } from "./update-version.js";
import {
	loadInitialLicenseServerRuntimeConfig,
	refreshLicenseServerRuntimeConfig,
	resolveLicenseServerRuntimeConfigLocation,
} from "./license-server-build-config.js";
import { resolveLicenseServerCspOrigins } from "./license-server-csp.js";
import {
	setupJianyingEnvelopeKeyIPC,
	type JianyingEnvelopeKeyIPCController,
} from "./jianying-envelope-key-handler.js";
import {
	setupJianyingDraftImportIPC,
	type JianyingDraftImportIPCController,
} from "./jianying-draft-import-handler.js";
import {
	setupJianyingDraftExportIPC,
	type JianyingDraftExportIPCController,
} from "./jianying-draft-export-handler.js";
import { setupJianyingEffectIPC } from "./jianying-effect-handler.js";
import { setupJianyingTransitionIPC } from "./jianying-transition-handler.js";
import {
	setupJianyingFilterLabIPC,
	type JianyingFilterLabIPCController,
} from "./jianying-filter-lab-handler.js";
import { watchJianyingFilterCaches } from "./jianying-filter-cache-watcher.js";
import {
	setupJianyingFontLabIPC,
	type JianyingFontLabIPCController,
} from "./jianying-font-lab-handler.js";
import {
	setupJianyingTextStyleLabIPC,
	type JianyingTextStyleLabIPCController,
} from "./jianying-text-style-lab-handler.js";
import {
	setupJianyingTextRuntimeIPC,
	type JianyingTextRuntimeIPCController,
} from "./jianying-text-runtime-handler.js";
import {
	setupJianyingSameProfileWritebackIPC,
	type JianyingSameProfileWritebackIPCController,
} from "./jianying-same-profile-writeback-handler.js";
import {
	setupJianyingProjectExportIPC,
	type JianyingProjectExportIPCController,
} from "./jianying-project-export-handler.js";

// Type definitions
interface ReleaseNote {
	version: string;
	date: string;
	channel: string;
	content: string;
}

interface Logger {
	log(message?: any, ...optionalParams: any[]): void;
	error(message?: any, ...optionalParams: any[]): void;
	warn(message?: any, ...optionalParams: any[]): void;
	info(message?: any, ...optionalParams: any[]): void;
}

interface MimeTypeMap {
	[key: string]: string;
}

type HandlerFunction = () => void;

// Initialize electron-log early
let log: any = null;
try {
	log = require("electron-log");
} catch (error) {
	// electron-log not available, will use fallback
}
const logger: Logger = log || console;

// Prevent EPIPE crashes when stdout/stderr pipe is broken during lifecycle events.
import { installEpipeGuard } from "./safe-console.js";
installEpipeGuard();

let updateController: AutoUpdateController | null = null;
let stagedUpdateVisibility: StagedUpdateVisibility | null = null;
let codexPluginUpdateController: CodexPluginUpdateController | null = null;
let jianyingEnvelopeKeyController: JianyingEnvelopeKeyIPCController | null =
	null;
let jianyingDraftImportController: JianyingDraftImportIPCController | null =
	null;
let jianyingDraftExportController: JianyingDraftExportIPCController | null =
	null;
let jianyingSameProfileWritebackController: JianyingSameProfileWritebackIPCController | null =
	null;
let jianyingProjectExportController: JianyingProjectExportIPCController | null =
	null;
let jianyingFilterLabController: JianyingFilterLabIPCController | null = null;
let jianyingFontLabController: JianyingFontLabIPCController | null = null;
let jianyingTextStyleLabController: JianyingTextStyleLabIPCController | null =
	null;
let jianyingTextRuntimeController: JianyingTextRuntimeIPCController | null =
	null;

// Import handlers (compiled TypeScript - relative to dist/electron output)
const {
	setupFFmpegIPC,
	initFFmpegHealthCheck,
} = require("./ffmpeg-handler.js");
const { setupSoundIPC } = require("./sound-handler.js");
const { setupThemeIPC } = require("./theme-handler.js");
const { setupApiKeyIPC } = require("./api-key-handler.js");
const { setupGeminiHandlers } = require("./gemini-transcribe-handler.js");
const {
	registerAIVideoHandlers,
	migrateAIVideosToDocuments,
} = require("./ai-video-save-handler.js");
const { setupGeminiChatIPC } = require("./gemini-chat-handler.js");
const { setupAIFillerIPC } = require("./ai-filler-handler.js");
// PTY and HTTP server now run in utility process via utility-bridge (imported at top)
const { setupSkillsIPC } = require("./skills-handler.js");
const { setupSkillsSyncIPC } = require("./skills-sync-handler.js");
const {
	setupAIPipelineIPC,
	cleanupAIPipeline,
} = require("./ai-pipeline-ipc.js");
const { setupMediaImportIPC } = require("./media-import-handler.js");
const {
	registerElevenLabsTranscribeHandler,
} = require("./elevenlabs-transcribe-handler.js");
const { setupWallpaperIPC } = require("./wallpaper-handler.js");
const { setupProjectFolderIPC } = require("./project-folder-handler.js");
const { setupProjectJsonIPC } = require("./project-json-handler.js");
const { setupAllClaudeIPC } = require("./claude/index.js");
// Pi Agent uses ESM-only pi-mono packages — loaded async to avoid CJS crash
let setupPiAgentIPC: (() => Promise<void>) | undefined;
try {
	setupPiAgentIPC = require("./pi-agent/index.js").setupPiAgentIPC;
} catch {
	/* pi-mono not installed */
}
const { setupRemotionFolderIPC } = require("./remotion-folder-handler.js");
const {
	registerDefaultHyperframesProtocol,
	setupHyperframesIPC,
	HYPERFRAMES_CSP,
} = require("./hyperframes/index.js");
const { setupVideoSearchIPC } = require("./video-search-handler.js");
const { setupScreenRecordingIPC } = require("./screen-recording-handler.js");
const { setupMoyinIPC } = require("./moyin-handler.js");
const { setupMoyinMediaIPC } = require("./moyin-media-handler.js");
const { setupLicenseIPC } = require("./license-handler.js");
const { setupYouTubeIPC } = require("./youtube-handler.js");
const {
	captureScreenshot,
	captureFullScreenToClipboard,
	listScreenshotDisplays,
} = require("./claude/handlers/claude-screenshot-handler.js");
const {
	attachConsoleCapture,
} = require("./claude/handlers/claude-console-handler.js");
// Note: font-resolver-handler removed - not implemented

let mainWindow: BrowserWindow | null = null;
let staticServer: http.Server | null = null;
let staticServerPort = 8080;
let pendingLicenseActivationToken: string | null = null;
let pendingOpenMediaFilePaths: string[] = [];

function extractActivationTokenFromUrl(url: string): string | null {
	try {
		if (!url.startsWith("qcut://")) {
			return null;
		}

		const parsedUrl = new URL(url);
		const pathName = parsedUrl.pathname.replace(/^\//, "");
		if (pathName !== "activate" && parsedUrl.hostname !== "activate") {
			return null;
		}

		const token = parsedUrl.searchParams.get("token");
		if (!token || token.trim().length === 0) {
			return null;
		}

		return token.trim();
	} catch {
		return null;
	}
}

function deliverActivationTokenToRenderer(token: string): void {
	logger.info(
		`[DeepLink] deliverActivationTokenToRenderer (token len ${token.length}, window: ${mainWindow && !mainWindow.isDestroyed() ? "live" : "missing"})`
	);
	try {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("license:activation-token", token);
			logger.info("[DeepLink] Sent license:activation-token IPC to renderer");
			return;
		}
	} catch (error) {
		logger.warn(
			"[DeepLink] Failed to deliver activation token immediately:",
			error
		);
	}

	logger.info(
		"[DeepLink] No live window — buffering token for when window opens"
	);
	pendingLicenseActivationToken = token;
}

function consumeActivationTokenFromArgs(args: string[]): void {
	try {
		for (const arg of args) {
			const token = extractActivationTokenFromUrl(arg);
			if (!token) {
				continue;
			}
			deliverActivationTokenToRenderer(token);
			return;
		}
	} catch (error) {
		logger.warn(
			"[DeepLink] Failed to parse activation token from args:",
			error
		);
	}
}

// Video containers QCut registers as an "Open With" target (see
// build.fileAssociations in package.json). Project files (.qcut) are
// excluded — they need a dedicated open flow, not a media import.
const OPENABLE_MEDIA_EXTENSIONS = new Set([
	".mp4",
	".mov",
	".avi",
	".mkv",
	".webm",
]);

function extractOpenableMediaPath(arg: string): string | null {
	if (!arg || arg.startsWith("-") || arg.includes("://")) {
		return null;
	}
	if (!OPENABLE_MEDIA_EXTENSIONS.has(path.extname(arg).toLowerCase())) {
		return null;
	}
	try {
		return fs.existsSync(arg) ? arg : null;
	} catch {
		return null;
	}
}

// Push events are lost until the renderer's FileOpenHandler has mounted
// and pulled the buffer — did-finish-load fires before React subscribes.
let rendererFileOpenReady = false;

function deliverOpenMediaFileToRenderer(filePath: string): void {
	try {
		if (rendererFileOpenReady && mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("app:open-media-file", filePath);
			logger.info(
				`[OpenFile] Sent app:open-media-file to renderer: ${filePath}`
			);
			return;
		}
	} catch (error) {
		logger.warn("[OpenFile] Failed to deliver media file immediately:", error);
	}

	logger.info(
		`[OpenFile] Renderer not ready — buffering media path: ${filePath}`
	);
	pendingOpenMediaFilePaths.push(filePath);
}

// Renderer pulls the buffer once its handler is mounted; from then on new
// opens are pushed directly.
ipcMain.handle("app:get-pending-open-media-files", () => {
	rendererFileOpenReady = true;
	const paths = pendingOpenMediaFilePaths;
	pendingOpenMediaFilePaths = [];
	return paths;
});

function consumeOpenMediaPathsFromArgs(args: string[]): void {
	for (const arg of args) {
		const mediaPath = extractOpenableMediaPath(arg);
		if (mediaPath) {
			deliverOpenMediaFileToRenderer(mediaPath);
		}
	}
}

// Suppress Electron DevTools Autofill errors
app.commandLine.appendSwitch("disable-features", "Autofill");

// macOS About panel (menu → About QCut) shows the date-based release
// version (e.g. 2026.07.26.5) instead of the raw package version.
app.setAboutPanelOptions({
	applicationName: "QCut",
	applicationVersion: toReleaseVersion({ packageVersion: app.getVersion() }),
	version: toReleaseVersion({ packageVersion: app.getVersion() }),
});

// ① Register app:// protocol with required privileges
protocol.registerSchemesAsPrivileged([
	{
		scheme: "app",
		privileges: {
			secure: true,
			standard: true,
			supportFetchAPI: true,
			corsEnabled: true,
			bypassCSP: false,
			allowServiceWorkers: true,
			stream: true,
		},
	},
	{
		scheme: "qcut-hyperframes",
		privileges: {
			secure: true,
			standard: true,
			supportFetchAPI: true,
			corsEnabled: true,
			bypassCSP: false,
			stream: true,
		},
	},
]);

/**
 * Resolve the path to docs/releases/ directory.
 * Works in both development and packaged (ASAR) builds.
 */
function getReleasesDir(): string {
	if (app.isPackaged) {
		return path.join(process.resourcesPath, "docs", "releases");
	}
	// Development: relative to project root (runtime dir is dist/electron/)
	return path.join(__dirname, "..", "..", "docs", "releases");
}

/**
 * Fallback: parse CHANGELOG.md into release note entries.
 */
function readChangelogFallback(): ReleaseNote[] {
	try {
		const changelogPath = app.isPackaged
			? path.join(process.resourcesPath, "CHANGELOG.md")
			: path.join(__dirname, "..", "..", "CHANGELOG.md");

		if (!fs.existsSync(changelogPath)) {
			return [];
		}

		const raw = fs.readFileSync(changelogPath, "utf-8");
		return parseChangelog(raw);
	} catch (error: any) {
		logger.error("Error reading CHANGELOG.md:", error);
		return [];
	}
}

/** Configure the packaged updater after Electron can resolve userData. */
function setupAutoUpdater(): void {
	try {
		const updaterModule = require("electron-updater") as {
			autoUpdater: AutoUpdaterLike;
		};
		const updateConfig = resolveAutoUpdateConfig({
			resourcesPath: process.resourcesPath,
			userDataPath: app.getPath("userData"),
			overridePath: process.env.QCUT_UPDATE_CONFIG_PATH,
		});
		updaterModule.autoUpdater.updateConfigPath = updateConfig.configPath;
		if (updateConfig.source === "override") {
			logger.log(
				`[AutoUpdater] Using update config override: ${updateConfig.configPath}`
			);
		}
		if (updateConfig.source === "fallback") {
			logger.warn(
				`[AutoUpdater] ${updateConfig.packagedConfigError}; using official fallback: ${updateConfig.configPath}`
			);
		}
		stagedUpdateVisibility = createStagedUpdateVisibility({
			platform: process.platform,
			setDockBadge: ({ text }) => {
				app.dock?.setBadge(text);
			},
			showNotification: ({ title, body }) => {
				if (!Notification.isSupported()) return;
				const notification = new Notification({ title, body });
				notification.on("click", () => {
					if (mainWindow && !mainWindow.isDestroyed()) {
						mainWindow.show();
					}
				});
				notification.show();
			},
			promptQuitAndInstall: async ({ version }) => {
				const target =
					mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
				const options = {
					type: "info" as const,
					buttons: ["Quit and Install", "Keep Running"],
					defaultId: 0,
					cancelId: 1,
					message: `QCut ${version} is ready to install.`,
					detail:
						"Install the update now, or keep QCut running in the background and install it the next time you quit.",
				};
				const { response } = target
					? await dialog.showMessageBox(target, options)
					: await dialog.showMessageBox(options);
				return response === 0 ? "install" : "close";
			},
			logger,
		});
		updateController = createAutoUpdateController({
			updater: updaterModule.autoUpdater,
			currentVersion: app.getVersion(),
			userDataPath: app.getPath("userData"),
			logger,
			sendToRenderer: ({ channel, data }) => {
				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.webContents.send(channel, data);
				}
			},
			onUpdateStaged: ({ staged }) => {
				stagedUpdateVisibility?.onUpdateStaged({ staged });
			},
			onBeforeQuitAndInstall: () => {
				// macOS quitAndInstall closes windows BEFORE before-quit fires, so
				// the close-prompt must be disarmed here or it hijacks the install.
				stagedUpdateVisibility?.setQuitting();
			},
		});
		updateController.start();
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.warn("[AutoUpdater] electron-updater is unavailable:", message);
	}
}

function setupCodexPluginUpdater(): void {
	codexPluginUpdateController = createCodexPluginUpdateController({
		logger,
		sendToRenderer: ({ channel, data }) => {
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send(channel, data);
			}
		},
	});
	codexPluginUpdateController.start();
}

/** Create a local HTTP server to serve FFmpeg WASM and other static assets. */
function createStaticServer(): Promise<http.Server> {
	const server = http.createServer((req, res) => {
		const url = new URL(req.url || "", `http://${req.headers.host}`);
		let filePath = url.pathname;

		// Remove leading slash and decode URI
		filePath = decodeURIComponent(filePath.substring(1));

		// Determine the full file path based on the request
		let fullPath: string;
		if (filePath.startsWith("ffmpeg/")) {
			// Serve FFmpeg files from the dist directory
			fullPath = path.join(__dirname, "../../apps/web/dist", filePath);
		} else {
			// Serve other static files from dist
			fullPath = path.join(__dirname, "../../apps/web/dist", filePath);
		}

		// Check if file exists
		if (!fs.existsSync(fullPath)) {
			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end("File not found");
			return;
		}

		// Determine content type
		const ext = path.extname(fullPath).toLowerCase();
		const mimeTypes: MimeTypeMap = {
			".js": "application/javascript",
			".wasm": "application/wasm",
			".json": "application/json",
			".css": "text/css",
			".html": "text/html",
		};
		const contentType = mimeTypes[ext] || "application/octet-stream";

		// Set CORS headers to allow cross-origin requests
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		res.setHeader("Content-Type", contentType);

		// Add Cross-Origin-Resource-Policy for COEP compatibility
		res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

		// Stream the file
		const fileStream = fs.createReadStream(fullPath);
		fileStream.pipe(res);

		fileStream.on("error", (error: Error) => {
			logger.error("[Static Server] Error reading file:", error);
			res.writeHead(500, { "Content-Type": "text/plain" });
			res.end("Internal server error");
		});
	});

	return new Promise<http.Server>((resolve, reject) => {
		const BASE_PORT = 8080;
		const MAX_PORT = 8090;

		function tryListen(port: number): void {
			const errorHandler = (err: NodeJS.ErrnoException) => {
				if (err.code === "EADDRINUSE" && port < MAX_PORT) {
					logger.log(
						`[Static Server] Port ${port} in use, trying ${port + 1}...`
					);
					tryListen(port + 1);
				} else {
					reject(err);
				}
			};

			server.once("error", errorHandler);
			server.listen(port, "localhost", () => {
				// Remove the error listener on successful bind
				server.removeListener("error", errorHandler);
				staticServerPort = port;
				logger.log(`[Static Server] Started on http://localhost:${port}`);
				resolve(server);
			});
		}

		tryListen(BASE_PORT);
	});
}

/** Create the main BrowserWindow with CSP headers and protocol handling. */
function createWindow(): void {
	const isDev = !app.isPackaged && process.env.NODE_ENV === "development";
	const licenseServerConfigLocation = resolveLicenseServerRuntimeConfigLocation(
		{
			isDevelopment: isDev,
			isPackaged: app.isPackaged,
			appPath: app.getAppPath(),
			moduleDir: __dirname,
		}
	);
	let licenseServerBuildConfig = loadInitialLicenseServerRuntimeConfig({
		location: licenseServerConfigLocation,
	});

	// ③ "Replace" rather than "append" CSP - completely override all existing CSP policies
	session.defaultSession.webRequest.onHeadersReceived(
		(
			details: OnHeadersReceivedListenerDetails,
			callback: (response: HeadersReceivedResponse) => void
		) => {
			const responseHeaders = { ...details.responseHeaders };

			// Delete all existing CSP-related headers to ensure no conflicts
			Object.keys(responseHeaders).forEach((key: string) => {
				if (key.toLowerCase().includes("content-security-policy")) {
					delete responseHeaders[key];
				}
			});

			if (details.url.startsWith("qcut-hyperframes:")) {
				responseHeaders["Content-Security-Policy"] = [HYPERFRAMES_CSP];
				responseHeaders["Cross-Origin-Resource-Policy"] = ["cross-origin"];
				callback({ responseHeaders });
				return;
			}

			licenseServerBuildConfig = refreshLicenseServerRuntimeConfig({
				currentConfig: licenseServerBuildConfig,
				isMainFrame: details.resourceType === "mainFrame",
				location: licenseServerConfigLocation,
			});
			const licenseServerConnectSources = resolveLicenseServerCspOrigins({
				configuredUrl: licenseServerBuildConfig?.licenseServerUrl,
			}).join(" ");

			responseHeaders["Content-Security-Policy"] = [
				"default-src 'self' blob: data: app: https://cdn.tldraw.com; " +
					"script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: app:; " +
					"worker-src 'self' blob: app:; " +
					"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
					"font-src 'self' https://fonts.gstatic.com https://cdn.tldraw.com; " +
					`connect-src 'self' blob: app: http://localhost:${staticServerPort} ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com https://api.github.com https://fal.run https://queue.fal.run https://rest.alpha.fal.ai https://fal.media https://v3.fal.media https://v3b.fal.media https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com https://freesound.org https://cdn.freesound.org https://*.storage.jamendo.com https://usercontent.jamendo.com https://upload.wikimedia.org https://cdn.tldraw.com ${licenseServerConnectSources} https://storage.googleapis.com https://kbrtxitvavpuimuihppz.supabase.co; ` +
					"media-src 'self' blob: data: app: qcut-hyperframes: https:; " +
					"img-src 'self' blob: data: app: https://fal.run https://fal.media https://v3.fal.media https://v3b.fal.media https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com https://avatars.githubusercontent.com https://i.ibb.co https://usercontent.jamendo.com https://cdn.tldraw.com https://lh3.googleusercontent.com https://kbrtxitvavpuimuihppz.supabase.co; " +
					"frame-src 'self' qcut-hyperframes:;",
			];

			// Add COOP/COEP headers to support SharedArrayBuffer (required for FFmpeg WASM)
			responseHeaders["Cross-Origin-Opener-Policy"] = ["same-origin"];
			responseHeaders["Cross-Origin-Embedder-Policy"] = ["credentialless"];

			// Inject CORS allow-origin on responses from trusted AI media
			// buckets that don't set the header themselves (GCS in particular).
			// Without this the renderer's `fetch(videoUrl)` in media-integration.ts
			// fails with "No 'Access-Control-Allow-Origin' header" and the
			// generated video never lands in the media panel.
			const MEDIA_CORS_HOSTS = [
				"https://storage.googleapis.com/",
				"https://gmi-video-assests-prod.storage.googleapis.com/",
			];
			if (MEDIA_CORS_HOSTS.some((host) => details.url.startsWith(host))) {
				responseHeaders["Access-Control-Allow-Origin"] = ["*"];
				responseHeaders["Access-Control-Allow-Methods"] = [
					"GET, HEAD, OPTIONS",
				];
				responseHeaders["Access-Control-Allow-Headers"] = ["*"];
			}

			callback({ responseHeaders });
		}
	);

	// Create the main window
	mainWindow = new BrowserWindow({
		width: 1600,
		height: 1000,
		minWidth: 960,
		minHeight: 640,
		icon: path.join(
			app.isPackaged ? process.resourcesPath : __dirname,
			process.platform === "darwin"
				? app.isPackaged
					? "icon.png"
					: "../../build/icon.png"
				: app.isPackaged
					? "icon.ico"
					: "../../build/icon.ico"
		),
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, "./preload.js"),
			webSecurity: true,
			// Allow CORS for external APIs while maintaining security
			webviewTag: false,
		},
	});
	attachConsoleCapture({ window: mainWindow });

	// Size window to 80% of the screen and center it
	try {
		const { width: screenW, height: screenH } =
			screen.getPrimaryDisplay().workAreaSize;
		const { width: w, height: h } = resolveInitialWindowSize({
			workAreaWidth: screenW,
			workAreaHeight: screenH,
		});
		mainWindow.setSize(w, h);
		mainWindow.center();
	} catch {
		// Fallback for headless/CI environments without a display
	}

	// E2E invisible mode: make window fully transparent so tests run
	// without stealing focus. Activated by QCUT_E2E_OFFSCREEN env var,
	// set automatically by `bun run test:e2e:bg`.
	if (process.env.QCUT_E2E_OFFSCREEN) {
		mainWindow.setOpacity(0);
		mainWindow.setIgnoreMouseEvents(true);
		logger.log("[E2E] Window hidden (opacity=0, ignoreMouseEvents=true)");
	}

	// Load the app
	if (isDev) {
		mainWindow.loadURL("http://localhost:5173");
		// Open DevTools in development
		mainWindow.webContents.openDevTools();
	} else {
		// Use custom app protocol to avoid file:// restrictions
		mainWindow.loadURL("app://./index.html");
	}

	mainWindow.webContents.on("did-finish-load", () => {
		// Fresh page: buffer opened files until its FileOpenHandler pulls them.
		rendererFileOpenReady = false;

		if (pendingLicenseActivationToken) {
			try {
				mainWindow?.webContents.send(
					"license:activation-token",
					pendingLicenseActivationToken
				);
				pendingLicenseActivationToken = null;
			} catch (error) {
				logger.warn(
					"[DeepLink] Failed to send pending activation token after load:",
					error
				);
			}
		}
	});

	// Handle external links
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: "deny" };
	});

	// Window event handlers
	mainWindow.on("close", (event) => {
		// macOS keeps QCut alive after the last window closes, so a staged
		// update would otherwise wait forever for ShipIt. Offer to install now.
		if (!stagedUpdateVisibility?.shouldInterceptClose()) return;
		event.preventDefault();
		void stagedUpdateVisibility.resolveClose().then((choice) => {
			if (choice === "install") {
				// The controller's onBeforeQuitAndInstall hook disarms the prompt
				// only when the install actually starts, so a failed start leaves
				// future staged versions able to prompt again.
				const result = updateController?.installUpdate();
				if (result?.success) return;
				logger.warn(
					"[AutoUpdater] Quit-and-install did not start:",
					result?.message ?? "update controller unavailable"
				);
			}
			if (mainWindow && !mainWindow.isDestroyed()) {
				// The staged version is now marked as prompted, so this close
				// passes straight through — including when the install failed to
				// start, so the window never silently stays open.
				mainWindow.close();
			}
		});
	});
	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

// CLI key management — runs headless, delegates to bundled AICP binary
const CLI_KEY_COMMANDS = ["set-key", "check-keys", "delete-key"];
const cliArgs = process.argv.slice(app.isPackaged ? 1 : 2);
const isCliKeyCommand = CLI_KEY_COMMANDS.includes(cliArgs[0]);

// Headless recorder — runs a hidden BrowserWindow that services
// `qcut record` HTTP requests without showing any editor UI.
// See docs/task/recordly/22-cli-standalone-phase1-record-command.md.
const isHeadlessRecorder = process.argv.includes("--headless-recorder");
const isHeadlessRecorderDaemon =
	isHeadlessRecorder && process.argv.includes("--daemon");

// Register qcut:// deep link protocol for license activation.
// Skip for headless-recorder processes — they have no renderer to deliver
// the activation token to, and registering would hijack the protocol
// from the real editor app.
if (!isHeadlessRecorder && !app.isDefaultProtocolClient("qcut")) {
	app.setAsDefaultProtocolClient("qcut");
}

// Skip activation-token parsing for headless CLI modes — neither key
// management nor the headless recorder need license-activation side-effects.
if (!isCliKeyCommand && !isHeadlessRecorder) {
	consumeActivationTokenFromArgs(process.argv);
	// Windows/Linux "Open With": the video path arrives as a launch argument.
	consumeOpenMediaPathsFromArgs(process.argv);
}

// Windows/Linux: handle deep links via second-instance (single instance lock).
// Headless-recorder processes deliberately bypass the lock so `qcut record`
// can start its own ephemeral hidden instance even when the desktop QCut is
// already running. Skip both lock acquisition and the second-instance
// listener for the headless mode — that listener also touches mainWindow,
// which doesn't exist in headless processes.
if (!isHeadlessRecorder) {
	const gotTheLock = app.requestSingleInstanceLock();
	if (gotTheLock) {
		app.on("second-instance", (_event, commandLine) => {
			try {
				for (const arg of commandLine) {
					const token = extractActivationTokenFromUrl(arg);
					if (!token) {
						continue;
					}
					deliverActivationTokenToRenderer(token);
					break;
				}
			} catch (error) {
				logger.warn("[DeepLink] Failed to handle second-instance args:", error);
			}

			// "Open With" while QCut is already running routes the video
			// into the existing instance instead of launching a second one.
			consumeOpenMediaPathsFromArgs(commandLine);

			if (mainWindow) {
				if (mainWindow.isMinimized()) {
					mainWindow.restore();
				}
				mainWindow.focus();
			}
		});
	} else {
		app.quit();
	}
}

// macOS: "Open With" delivers the file via open-file (fires before ready
// on cold launch — the path is buffered until the window finishes loading).
app.on("open-file", (event, filePath) => {
	if (isHeadlessRecorder || isCliKeyCommand) {
		return;
	}
	const mediaPath = extractOpenableMediaPath(filePath);
	if (!mediaPath) {
		return;
	}
	event.preventDefault();
	deliverOpenMediaFileToRenderer(mediaPath);
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.focus();
	}
});

// macOS: handle deep links via open-url event
app.on("open-url", (event, url) => {
	logger.info(`[DeepLink] open-url event fired: ${url.slice(0, 80)}`);
	try {
		event.preventDefault();
		const token = extractActivationTokenFromUrl(url);
		if (!token) {
			logger.warn(
				`[DeepLink] open-url had no extractable token: ${url.slice(0, 80)}`
			);
			return;
		}
		logger.info(`[DeepLink] open-url extracted token (len ${token.length})`);
		deliverActivationTokenToRenderer(token);
	} catch (error) {
		logger.warn("[DeepLink] Failed to handle open-url event:", error);
	}
});

// Guard against both startup modes running in one process — the
// CLI-key branch below also gates on !isHeadlessRecorder.
if (isHeadlessRecorder && !isCliKeyCommand) {
	app.whenReady().then(async () => {
		try {
			const { runHeadlessRecorder } = await import(
				"./headless-recorder/index.js"
			);
			await runHeadlessRecorder({ daemon: isHeadlessRecorderDaemon });
			logger.log(
				`[HeadlessRecorder] Ready (daemon=${isHeadlessRecorderDaemon})`
			);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error("[HeadlessRecorder] Failed to start:", message);
			app.exit(1);
		}
	});
}

// CLI-key branch is mutually exclusive with the headless-recorder branch —
// both would boot separate pipelines in one process otherwise.
if (isCliKeyCommand && !isHeadlessRecorder) {
	app.whenReady().then(async () => {
		try {
			const { spawnSync } = require("child_process");
			const { BinaryManager } = require("./binary-manager.js");
			const bm = new BinaryManager();
			await bm.initialize();
			const aicpPath = bm.getBinaryPath("aicp");

			if (!aicpPath) {
				console.error(
					"AICP binary not found. Install QCut or set up AICP standalone."
				);
				app.exit(1);
				return;
			}

			const result = spawnSync(aicpPath, cliArgs, { stdio: "inherit" });
			app.exit(result.status ?? 1);
		} catch (err: any) {
			console.error("CLI error:", err.message);
			app.exit(1);
		}
	});
}

if (!isCliKeyCommand && !isHeadlessRecorder) {
	app.whenReady().then(async () => {
		// Set macOS dock icon (requires PNG format)
		if (process.platform === "darwin" && app.dock) {
			const iconPath = app.isPackaged
				? path.join(process.resourcesPath, "icon.png")
				: path.join(__dirname, "../../build/icon.png");
			if (fs.existsSync(iconPath)) {
				app.dock.setIcon(iconPath);
			}
		}

		setupApplicationMenu();

		// Register custom app:// protocol handler. Extracted into its own
		// module so headless-recorder mode can register it too.
		registerAppProtocol({ logger });
		registerDefaultHyperframesProtocol();

		// Start the static server to serve FFmpeg WASM files
		staticServer = await createStaticServer();

		createWindow();

		// Register all IPC handlers with try/catch to prevent cascade failures
		const handlers: [string, () => void | Promise<void>][] = [
			["FFmpegIPC", setupFFmpegIPC],
			["SoundIPC", setupSoundIPC],
			["ThemeIPC", setupThemeIPC],
			["ApiKeyIPC", setupApiKeyIPC],
			["GeminiHandlers", setupGeminiHandlers],
			["ElevenLabsTranscribe", registerElevenLabsTranscribeHandler],
			["GeminiChatIPC", setupGeminiChatIPC],
			["AIFillerIPC", setupAIFillerIPC],
			["PtyIPC", setupUtilityPtyIPC],
			["AIVideoHandlers", registerAIVideoHandlers],
			["SkillsIPC", setupSkillsIPC],
			["SkillsSyncIPC", setupSkillsSyncIPC],
			["AIPipelineIPC", setupAIPipelineIPC],
			["WallpaperIPC", setupWallpaperIPC],
			["MediaImportIPC", setupMediaImportIPC],
			["ProjectFolderIPC", setupProjectFolderIPC],
			["ProjectJsonIPC", setupProjectJsonIPC],
			["VideoSearchIPC", setupVideoSearchIPC],
			["ClaudeIPC", setupAllClaudeIPC],
			[
				"PiAgentIPC",
				async () => {
					if (setupPiAgentIPC) {
						await setupPiAgentIPC();
					} else {
						console.log("⚠️ PiAgentIPC skipped (pi-mono not available)");
					}
				},
			],
			["RemotionFolderIPC", setupRemotionFolderIPC],
			["HyperframesIPC", setupHyperframesIPC],
			["ScreenRecordingIPC", setupScreenRecordingIPC],
			["MoyinIPC", setupMoyinIPC],
			["MoyinMediaIPC", setupMoyinMediaIPC],
			["LicenseIPC", setupLicenseIPC],
			["YouTubeIPC", () => setupYouTubeIPC(() => mainWindow)],
			[
				"JianyingDraftExportIPC",
				() => {
					jianyingDraftExportController = setupJianyingDraftExportIPC({
						getMainWindow: () => mainWindow,
					});
				},
			],
			["JianyingTransitionIPC", setupJianyingTransitionIPC],
			["JianyingEffectIPC", setupJianyingEffectIPC],
			[
				"JianyingFilterLabIPC",
				() => {
					jianyingFilterLabController = setupJianyingFilterLabIPC({
						getMainWindow: () => mainWindow,
						watchCache: watchJianyingFilterCaches,
					});
				},
			],
			[
				"JianyingFontLabIPC",
				() => {
					jianyingFontLabController = setupJianyingFontLabIPC({
						getMainWindow: () => mainWindow,
					});
				},
			],
			[
				"JianyingTextStyleLabIPC",
				() => {
					jianyingTextStyleLabController = setupJianyingTextStyleLabIPC({
						getMainWindow: () => mainWindow,
					});
				},
			],
			[
				"JianyingTextRuntimeIPC",
				() => {
					jianyingTextRuntimeController = setupJianyingTextRuntimeIPC();
				},
			],
			[
				"JianyingEnvelopeKeyIPC",
				() => {
					jianyingEnvelopeKeyController = setupJianyingEnvelopeKeyIPC({
						getMainWindow: () => mainWindow,
					});
				},
			],
			[
				"JianyingSameProfileWritebackIPC",
				() => {
					jianyingSameProfileWritebackController =
						setupJianyingSameProfileWritebackIPC({
							getMainWindow: () => mainWindow,
						});
				},
			],
			[
				"JianyingProjectExportIPC",
				() => {
					jianyingProjectExportController = setupJianyingProjectExportIPC({
						getMainWindow: () => mainWindow,
					});
				},
			],
			[
				"JianyingDraftImportIPC",
				() => {
					jianyingDraftImportController = setupJianyingDraftImportIPC({
						getMainWindow: () => mainWindow,
					});
				},
			],
		];

		for (const [name, setup] of handlers) {
			try {
				await Promise.resolve(setup());
				console.log(`✅ ${name} registered`);
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				const stack = err instanceof Error ? err.stack : undefined;
				console.error(`❌ ${name} FAILED:`, message, stack);
			}
		}

		// Screenshot capture (needs mainWindow reference)
		ipcMain.handle(
			"screenshot:capture",
			async (_event: unknown, options?: { fileName?: string }) => {
				if (!mainWindow) throw new Error("No active window");
				return captureScreenshot(mainWindow, options);
			}
		);

		ipcMain.handle(
			"screenshot:captureFullScreenToClipboard",
			async (_event: unknown, options?: { displayId?: number }) =>
				captureFullScreenToClipboard(mainWindow, options)
		);

		ipcMain.handle("screenshot:listDisplays", () =>
			listScreenshotDisplays(mainWindow)
		);

		initFFmpegHealthCheck();
		migrateAIVideosToDocuments()
			.then(
				(result: {
					copied: number;
					skipped: number;
					projectsProcessed: number;
					errors: string[];
				}) => {
					console.log(
						`[AI Video Migration] Done: copied=${result.copied}, skipped=${result.skipped}, projects=${result.projectsProcessed}, errors=${result.errors.length}`
					);
					if (result.errors.length > 0) {
						console.warn("[AI Video Migration] Errors:", result.errors);
					}
				}
			)
			.catch((err: Error) => {
				console.error("[AI Video Migration] Failed:", err.message);
			});
		// Note: font-resolver removed - handler not implemented

		// Start utility process (HTTP server + PTY sessions)
		try {
			startUtilityProcess();
			logger.log("✅ Utility process started (HTTP server + PTY)");
		} catch (err: any) {
			logger.error("❌ Utility process failed to start:", err.message);
		}

		// Configure auto-updater for production builds
		if (app.isPackaged) {
			setupAutoUpdater();
			setupCodexPluginUpdater();
		}

		// Register inline IPC handlers (audio/video, FAL, dialogs, storage, updates, etc.)
		registerMainIpcHandlers({
			getMainWindow: () => mainWindow,
			logger,
			updateController,
			codexPluginUpdateController,
			getReleasesDir,
			readChangelogFallback,
		});
	});
} // end if (!isCliKeyCommand && !isHeadlessRecorder)

// window-all-closed never quits the app on macOS, so the temp cleanup in
// that handler historically never ran there and $TMPDIR/qcut-* grew without
// bound. before-quit fires on every platform.
// Emitted by the native macOS updater before it closes windows for an
// install; before-quit fires only AFTER those closes, which is too late to
// disarm the staged-update close prompt.
if (process.platform === "darwin") {
	nativeAutoUpdater.on("before-quit-for-update", () => {
		stagedUpdateVisibility?.setQuitting();
	});
}

app.on("before-quit", () => {
	// A real quit is underway; the staged-update close prompt must not
	// preventDefault the window teardown.
	stagedUpdateVisibility?.setQuitting();
	if (isHeadlessRecorder) return;
	jianyingDraftExportController?.dispose();
	jianyingDraftExportController = null;
	jianyingSameProfileWritebackController?.dispose();
	jianyingSameProfileWritebackController = null;
	jianyingProjectExportController?.dispose();
	jianyingProjectExportController = null;
	jianyingEnvelopeKeyController?.dispose();
	jianyingEnvelopeKeyController = null;
	jianyingDraftImportController?.dispose();
	jianyingDraftImportController = null;
	jianyingFilterLabController?.dispose();
	jianyingFilterLabController = null;
	jianyingFontLabController?.dispose();
	jianyingFontLabController = null;
	jianyingTextStyleLabController?.dispose();
	jianyingTextStyleLabController = null;
	jianyingTextRuntimeController?.dispose();
	jianyingTextRuntimeController = null;
	try {
		const { cleanupAllAudioFiles } = require("./audio-temp-handler.js");
		cleanupAllAudioFiles();
		const { cleanupAllVideoFiles } = require("./video-temp-handler.js");
		cleanupAllVideoFiles();
	} catch {
		// Cleanup must never block quitting.
	}
});

app.on("window-all-closed", () => {
	// The headless-recorder process owns no visible window, so a stray
	// window-close event must NOT tear down its daemon — otherwise a
	// transient renderer crash kills `qcut record` on Windows/Linux.
	if (isHeadlessRecorder) return;

	if (process.platform !== "darwin") {
		// Clean up audio temp files
		const { cleanupAllAudioFiles } = require("./audio-temp-handler.js");
		cleanupAllAudioFiles();

		// Clean up video temp files
		const { cleanupAllVideoFiles } = require("./video-temp-handler.js");
		cleanupAllVideoFiles();

		// Clean up utility process (PTY sessions + HTTP server)
		cleanupUtilityProcess();

		// Clean up AI Pipeline processes
		cleanupAIPipeline();
		codexPluginUpdateController?.stop();

		// Close the static server when quitting
		if (staticServer) {
			staticServer.close();
		}
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

// Export types for other modules
export type { Logger, MimeTypeMap, HandlerFunction };
