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
	BrowserWindow,
	ipcMain,
	protocol,
	net,
	session,
	screen,
	shell,
	OnHeadersReceivedListenerDetails,
	HeadersReceivedResponse,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";
import { pathToFileURL } from "url";
import { parseChangelog } from "./release-notes-utils.js";
import { registerMainIpcHandlers } from "./main-ipc.js";
import {
	startUtilityProcess,
	stopUtilityProcess,
	setupUtilityPtyIPC,
	cleanupUtilityProcess,
} from "./utility/utility-bridge.js";

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

interface AutoUpdater {
	checkForUpdatesAndNotify(): Promise<any>;
	on(event: string, listener: (...args: any[]) => void): void;
	quitAndInstall(): void;
	allowPrerelease: boolean;
	channel: string;
}

interface MimeTypeMap {
	[key: string]: string;
}

type HandlerFunction = () => void;
interface AutoUpdaterReleaseNoteEntry {
	note?: unknown;
}

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

// Auto-updater - wrapped in try-catch for packaged builds
let autoUpdater: AutoUpdater | null = null;
try {
	autoUpdater = require("electron-updater").autoUpdater;
} catch (error: any) {
	if (log) {
		log.warn(
			"⚠️ [AutoUpdater] electron-updater not available: %s",
			error.message
		);
	} else {
		logger.warn(
			"⚠️ [AutoUpdater] electron-updater not available:",
			error.message
		);
	}
}

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
const { setupProjectFolderIPC } = require("./project-folder-handler.js");
const { setupAllClaudeIPC } = require("./claude/index.js");
const { setupRemotionFolderIPC } = require("./remotion-folder-handler.js");
const { setupScreenRecordingIPC } = require("./screen-recording-handler.js");
const { setupMoyinIPC } = require("./moyin-handler.js");
const { setupLicenseIPC } = require("./license-handler.js");
const {
	captureScreenshot,
} = require("./claude/handlers/claude-screenshot-handler.js");
// Note: font-resolver-handler removed - not implemented

let mainWindow: BrowserWindow | null = null;
let staticServer: http.Server | null = null;
let staticServerPort = 8080;
let pendingLicenseActivationToken: string | null = null;

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
	try {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("license:activation-token", token);
			return;
		}
	} catch (error) {
		logger.warn(
			"[DeepLink] Failed to deliver activation token immediately:",
			error
		);
	}

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

// Suppress Electron DevTools Autofill errors
app.commandLine.appendSwitch("disable-features", "Autofill");

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
]);

/**
 * Detect the update channel based on the app version
 * - Versions with -alpha (e.g., 1.0.0-alpha.1) use the alpha channel
 * - Versions with -beta (e.g., 1.0.0-beta.1) use the beta channel
 * - Versions with -rc (e.g., 1.0.0-rc.1) use the rc channel
 * - Stable versions (e.g., 1.0.0) use the latest channel
 */
function detectChannelFromVersion(version: string): string {
	if (version.includes("-alpha")) return "alpha";
	if (version.includes("-beta")) return "beta";
	if (version.includes("-rc")) return "rc";
	return "latest";
}

/** Normalise electron-updater release notes (string | array) into a plain string. */
function normalizeAutoUpdaterReleaseNotes(releaseNotes: unknown): string {
	try {
		if (typeof releaseNotes === "string") {
			return releaseNotes.trim();
		}

		if (!Array.isArray(releaseNotes)) {
			return "";
		}

		const notes: string[] = [];
		for (const entry of releaseNotes as AutoUpdaterReleaseNoteEntry[]) {
			if (!entry || typeof entry !== "object") {
				continue;
			}

			const note = entry.note;
			if (typeof note !== "string") {
				continue;
			}

			const trimmed = note.trim();
			if (trimmed.length > 0) {
				notes.push(trimmed);
			}
		}

		return notes.join("\n\n");
	} catch {
		return "";
	}
}

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

/** Configure and start the electron-updater auto-updater lifecycle. */
function setupAutoUpdater(): void {
	if (!autoUpdater) {
		logger.log("⚠️ [AutoUpdater] Auto-updater not available - skipping setup");
		return;
	}

	logger.log("🔄 [AutoUpdater] Setting up auto-updater...");

	// Detect channel from app version and configure accordingly
	const appVersion = app.getVersion();
	const channel = detectChannelFromVersion(appVersion);

	logger.log(
		`🔄 [AutoUpdater] App version: ${appVersion}, Channel: ${channel}`
	);

	// Configure channel-specific behavior
	if (channel !== "latest") {
		// Prerelease users should receive prerelease updates
		autoUpdater.allowPrerelease = true;
		autoUpdater.channel = channel;
		logger.log(
			`🔄 [AutoUpdater] Configured for ${channel} channel with allowPrerelease=true`
		);
	} else {
		// Stable users should NOT receive prereleases by default
		autoUpdater.allowPrerelease = false;
		logger.log("🔄 [AutoUpdater] Configured for stable channel (latest.yml)");
	}

	// Check for updates
	autoUpdater.checkForUpdatesAndNotify();

	// Auto-updater event handlers
	autoUpdater.on("checking-for-update", () => {
		logger.log("🔄 [AutoUpdater] Checking for updates...");
	});

	autoUpdater.on("update-available", (info: any) => {
		logger.log("📦 [AutoUpdater] Update available:", info.version);
		const normalizedReleaseNotes = normalizeAutoUpdaterReleaseNotes(
			info.releaseNotes
		);

		// Send to renderer process
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("update-available", {
				version: info.version,
				releaseNotes: normalizedReleaseNotes,
				releaseDate: info.releaseDate,
			});
		}
	});

	autoUpdater.on("update-not-available", () => {
		logger.log("✅ [AutoUpdater] App is up to date");
	});

	autoUpdater.on("error", (err: Error) => {
		logger.error("❌ [AutoUpdater] Error:", err);
	});

	autoUpdater.on("download-progress", (progressObj: any) => {
		const percent = Math.round(progressObj.percent);
		logger.log(`📥 [AutoUpdater] Download progress: ${percent}%`);

		// Send progress to renderer
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("download-progress", {
				percent,
				transferred: progressObj.transferred,
				total: progressObj.total,
			});
		}
	});

	autoUpdater.on("update-downloaded", (info: any) => {
		logger.log("✅ [AutoUpdater] Update downloaded, will install on quit");

		// Send to renderer process
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("update-downloaded", {
				version: info.version,
			});
		}
	});

	// Check for updates every hour in production
	setInterval(
		() => {
			autoUpdater.checkForUpdatesAndNotify();
		},
		60 * 60 * 1000
	); // 1 hour
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

			// Set complete new CSP policy, exactly matching index.html meta tag
			responseHeaders["Content-Security-Policy"] = [
				"default-src 'self' blob: data: app:; " +
					"script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: app:; " +
					"worker-src 'self' blob: app:; " +
					"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
					"font-src 'self' https://fonts.gstatic.com; " +
					`connect-src 'self' blob: app: http://localhost:${staticServerPort} ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com https://api.github.com https://fal.run https://queue.fal.run https://rest.alpha.fal.ai https://fal.media https://v3.fal.media https://v3b.fal.media https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com https://freesound.org https://cdn.freesound.org; ` +
					"media-src 'self' blob: data: app: https://freesound.org https://cdn.freesound.org https://fal.media https://v3.fal.media https://v3b.fal.media; " +
					"img-src 'self' blob: data: app: https://fal.run https://fal.media https://v3.fal.media https://v3b.fal.media https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com https://avatars.githubusercontent.com https://i.ibb.co;",
			];

			// Add COOP/COEP headers to support SharedArrayBuffer (required for FFmpeg WASM)
			responseHeaders["Cross-Origin-Opener-Policy"] = ["same-origin"];
			responseHeaders["Cross-Origin-Embedder-Policy"] = ["credentialless"];

			callback({ responseHeaders });
		}
	);

	// Create the main window
	mainWindow = new BrowserWindow({
		width: 1600,
		height: 1000,
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

	// Size window to 80% of the screen and center it
	try {
		const { width: screenW, height: screenH } =
			screen.getPrimaryDisplay().workAreaSize;
		const w = Math.round(screenW * 0.8);
		const h = Math.round(screenH * 0.8);
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
	const isDev = process.env.NODE_ENV === "development";
	if (isDev) {
		mainWindow.loadURL("http://localhost:5173");
		// Open DevTools in development
		mainWindow.webContents.openDevTools();
	} else {
		// Use custom app protocol to avoid file:// restrictions
		mainWindow.loadURL("app://./index.html");
	}

	mainWindow.webContents.on("did-finish-load", () => {
		if (!pendingLicenseActivationToken) {
			return;
		}

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
	});

	// Handle external links
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: "deny" };
	});

	// Window event handlers
	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

// CLI key management — runs headless, delegates to bundled AICP binary
const CLI_KEY_COMMANDS = ["set-key", "check-keys", "delete-key"];
const cliArgs = process.argv.slice(app.isPackaged ? 1 : 2);
const isCliKeyCommand = CLI_KEY_COMMANDS.includes(cliArgs[0]);

if (!isCliKeyCommand) {
	consumeActivationTokenFromArgs(process.argv);
}

app.on("open-url", (event, url) => {
	try {
		event.preventDefault();
		const token = extractActivationTokenFromUrl(url);
		if (!token) {
			return;
		}
		deliverActivationTokenToRenderer(token);
	} catch (error) {
		logger.warn("[DeepLink] Failed to handle open-url event:", error);
	}
});

if (isCliKeyCommand) {
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

if (!isCliKeyCommand) {
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

		// Determine base path based on whether app is packaged
		const basePath = app.isPackaged
			? path.join(app.getAppPath(), "apps/web/dist")
			: path.join(__dirname, "../../apps/web/dist");

		logger.log(`[Protocol] Base path: ${basePath}`);
		logger.log(`[Protocol] Base path exists: ${fs.existsSync(basePath)}`);

		// Register custom protocol using the newer handle API for better ES module support
		protocol.handle("app", async (request) => {
			let urlPath = request.url.slice("app://".length);

			// Clean up the URL path
			if (urlPath.startsWith("./")) {
				urlPath = urlPath.substring(2);
			}
			if (urlPath.startsWith("/")) {
				urlPath = urlPath.substring(1);
			}

			// Default to index.html for root
			if (!urlPath || urlPath === "") {
				urlPath = "index.html";
			}

			// Security: Block path traversal attempts
			// Check for ".." before normalization to catch traversal attempts
			if (urlPath.includes("..")) {
				logger.error(`[Protocol] Path traversal blocked: ${urlPath}`);
				return new Response("Not Found", { status: 404 });
			}
			// Normalize path for consistent handling (converts / to \ on Windows)
			const normalizedPath = path.normalize(urlPath);

			try {
				// Handle FFmpeg resources specifically
				if (normalizedPath.startsWith("ffmpeg/")) {
					const filename = normalizedPath.replace("ffmpeg/", "");
					// In production, FFmpeg files are in resources/ffmpeg/
					const ffmpegPath = path.join(
						__dirname,
						"resources",
						"ffmpeg",
						filename
					);

					// Check if file exists in resources/ffmpeg, fallback to dist
					if (fs.existsSync(ffmpegPath)) {
						return await net.fetch(pathToFileURL(ffmpegPath).toString());
					}

					// Fallback to dist directory
					const distPath = path.join(basePath, "ffmpeg", filename);
					return await net.fetch(pathToFileURL(distPath).toString());
				}

				// Handle other resources with path containment check
				const filePath = path.resolve(basePath, normalizedPath);
				const baseResolved = path.resolve(basePath) + path.sep;

				// Ensure resolved path stays within basePath
				if (
					!filePath.startsWith(baseResolved) &&
					filePath !== path.resolve(basePath)
				) {
					logger.error(`[Protocol] Path traversal blocked: ${normalizedPath}`);
					return new Response("Not Found", { status: 404 });
				}

				if (fs.existsSync(filePath)) {
					logger.log(`[Protocol] Serving: ${normalizedPath} -> ${filePath}`);
					return await net.fetch(pathToFileURL(filePath).toString());
				}

				// SPA fallback: serve index.html for navigation requests without file extensions
				if (!path.extname(normalizedPath)) {
					const indexPath = path.join(basePath, "index.html");
					if (fs.existsSync(indexPath)) {
						logger.log(
							`[Protocol] SPA fallback: ${normalizedPath} -> index.html`
						);
						return await net.fetch(pathToFileURL(indexPath).toString());
					}
				}

				logger.error(`[Protocol] File not found: ${filePath}`);
				return new Response("Not Found", { status: 404 });
			} catch (error) {
				logger.error(`[Protocol] Error fetching ${normalizedPath}:`, error);
				return new Response("Internal Server Error", { status: 500 });
			}
		});

		// Start the static server to serve FFmpeg WASM files
		staticServer = await createStaticServer();

		createWindow();

		// Register all IPC handlers with try/catch to prevent cascade failures
		const handlers: [string, () => void][] = [
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
			["MediaImportIPC", setupMediaImportIPC],
			["ProjectFolderIPC", setupProjectFolderIPC],
			["ClaudeIPC", setupAllClaudeIPC],
			["RemotionFolderIPC", setupRemotionFolderIPC],
			["ScreenRecordingIPC", setupScreenRecordingIPC],
			["MoyinIPC", setupMoyinIPC],
			["LicenseIPC", setupLicenseIPC],
		];

		for (const [name, setup] of handlers) {
			try {
				setup();
				console.log(`✅ ${name} registered`);
			} catch (err: any) {
				console.error(`❌ ${name} FAILED:`, err.message, err.stack);
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
		}

		// Register inline IPC handlers (audio/video, FAL, dialogs, storage, updates, etc.)
		registerMainIpcHandlers({
			getMainWindow: () => mainWindow,
			logger,
			autoUpdater,
			getReleasesDir,
			readChangelogFallback,
		});
	});
} // end if (!isCliKeyCommand)

app.on("window-all-closed", () => {
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
export type { Logger, AutoUpdater, MimeTypeMap, HandlerFunction };
