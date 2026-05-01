/**
 * Claude Diagnostics API Handler
 * Provides error analysis and diagnostics for Claude Code integration
 */

import { ipcMain, app, IpcMainInvokeEvent } from "electron";
import * as os from "os";
import { claudeLog } from "../utils/logger.js";
import type {
	ErrorReport,
	DiagnosticResult,
	SystemInfo,
} from "../../types/claude-api";

const HANDLER_NAME = "Diagnostics";

/**
 * Get current system information.
 *
 * `app` is only available in the Electron main process. When invoked from
 * the utility process (HTTP server), pass `appVersion` from the accessor.
 */
export function getSystemInfo(appVersion?: string): SystemInfo {
	const totalMem = os.totalmem();
	const freeMem = os.freemem();

	let resolvedVersion = appVersion;
	if (!resolvedVersion) {
		try {
			resolvedVersion = app?.getVersion?.() ?? "unknown";
		} catch {
			resolvedVersion = "unknown";
		}
	}

	return {
		platform: os.platform(),
		arch: os.arch(),
		osVersion: os.release(),
		appVersion: resolvedVersion,
		nodeVersion: process.versions.node,
		electronVersion: process.versions.electron,
		memory: {
			total: totalMem,
			free: freeMem,
			used: totalMem - freeMem,
		},
		cpuCount: os.cpus().length,
	};
}

/**
 * Analyze error and provide diagnostic information
 */
export function analyzeError(
	error: ErrorReport,
	systemInfo?: SystemInfo
): DiagnosticResult {
	const sysInfo = systemInfo || getSystemInfo();

	const result: DiagnosticResult = {
		errorType: "unknown",
		severity: "medium",
		possibleCauses: [],
		suggestedFixes: [],
		canAutoFix: false,
		systemInfo: sysInfo,
	};

	const msg = error.message.toLowerCase();
	const stack = (error.stack || "").toLowerCase();
	const context = (error.context || "").toLowerCase();

	// File System Errors
	if (msg.includes("enoent") || msg.includes("no such file")) {
		result.errorType = "file_not_found";
		result.severity = "medium";
		result.possibleCauses = [
			"The file has been moved or deleted",
			"The file path is incorrect",
			"The file was on a disconnected external drive",
			"The project was moved to a different location",
		];
		result.suggestedFixes = [
			"Check if the file exists at the expected location",
			"Re-import the media file into your project",
			"Reconnect any external drives",
			'Use "Relink Media" to point to the new location',
		];
	}

	// Permission Errors
	else if (
		msg.includes("eacces") ||
		msg.includes("eperm") ||
		msg.includes("permission")
	) {
		result.errorType = "permission_denied";
		result.severity = "high";
		result.possibleCauses = [
			"Insufficient permissions to access the file",
			"File is locked by another application",
			"Antivirus software blocking access",
			"File is read-only or on a read-only drive",
		];
		result.suggestedFixes = [
			"Close other applications that may be using the file",
			"Run QCut as administrator (Windows) or check file permissions (Mac)",
			"Check your antivirus settings and whitelist QCut",
			"Copy the file to a different location and re-import",
		];
	}

	// Memory Errors
	else if (
		msg.includes("enomem") ||
		msg.includes("out of memory") ||
		msg.includes("heap") ||
		msg.includes("allocation")
	) {
		result.errorType = "out_of_memory";
		result.severity = "critical";

		const usedPercent = (
			(sysInfo.memory.used / sysInfo.memory.total) *
			100
		).toFixed(1);

		result.possibleCauses = [
			`System memory is ${usedPercent}% used`,
			"Project contains too many high-resolution media files",
			"Too many applications running simultaneously",
			"Memory leak in the application",
		];
		result.suggestedFixes = [
			"Close other applications to free up memory",
			"Use proxy media (lower resolution) for editing",
			"Split the project into smaller parts",
			"Restart QCut to clear memory",
			"Consider upgrading your RAM if this happens frequently",
		];
	}

	// FFmpeg Errors
	else if (
		msg.includes("ffmpeg") ||
		stack.includes("ffmpeg") ||
		context.includes("ffmpeg")
	) {
		result.errorType = "ffmpeg_error";
		result.severity = "medium";
		result.possibleCauses = [
			"FFmpeg processing failed",
			"Unsupported or corrupted media format",
			"Media file has encoding issues",
			"Insufficient disk space for temporary files",
		];
		result.suggestedFixes = [
			"Try converting the media to MP4/H.264 format externally",
			"Check if the media file plays correctly in VLC",
			"Re-encode the problematic file using HandBrake",
			"Free up disk space (need at least 2x video size)",
		];
	}

	// Network Errors
	else if (
		msg.includes("network") ||
		msg.includes("fetch") ||
		msg.includes("econnrefused") ||
		msg.includes("timeout")
	) {
		result.errorType = "network_error";
		result.severity = "low";
		result.possibleCauses = [
			"No internet connection",
			"Server is temporarily unavailable",
			"Firewall or proxy blocking the connection",
			"DNS resolution failed",
		];
		result.suggestedFixes = [
			"Check your internet connection",
			"Try again in a few minutes",
			"Check firewall and proxy settings",
			"Disable VPN if using one",
		];
	}

	// React/UI Errors
	else if (
		stack.includes("react") ||
		msg.includes("render") ||
		error.componentStack
	) {
		result.errorType = "ui_error";
		result.severity = "medium";
		result.possibleCauses = [
			"UI component rendering failed",
			"Invalid state or props",
			"Missing required data",
			"Component lifecycle error",
		];
		result.suggestedFixes = [
			"Refresh the application (Ctrl+R / Cmd+R)",
			"Clear application cache and restart",
			"Try creating a new project to isolate the issue",
			"Check the console for more detailed error messages",
		];
	}

	// Storage/Database Errors
	else if (
		msg.includes("indexeddb") ||
		msg.includes("storage") ||
		msg.includes("quota")
	) {
		result.errorType = "storage_error";
		result.severity = "high";
		result.possibleCauses = [
			"Browser storage quota exceeded",
			"IndexedDB database corrupted",
			"Storage permission denied",
			"Disk space is full",
		];
		result.suggestedFixes = [
			"Clear old projects you no longer need",
			"Export projects to files and delete from app",
			"Clear application data and reimport projects",
			"Free up disk space on your system",
		];
	}

	// Unknown Errors
	else {
		result.errorType = "unknown";
		result.severity = "medium";
		result.possibleCauses = [
			"An unexpected error occurred",
			"This may be a bug in the application",
		];
		result.suggestedFixes = [
			"Try restarting the application",
			"Check for updates to QCut",
			"Report this issue on GitHub with the error details",
		];
	}

	return result;
}

/** Register Claude diagnostics IPC handlers for error analysis and system info. */
export function setupClaudeDiagnosticsIPC(): void {
	claudeLog.info(HANDLER_NAME, "Setting up Diagnostics IPC handlers...");

	ipcMain.handle(
		"claude:diagnostics:analyze",
		async (_event: IpcMainInvokeEvent, error: ErrorReport) => {
			try {
				claudeLog.info(HANDLER_NAME, `Analyzing error: ${error.message}`);
				const systemInfo = getSystemInfo();
				const result = analyzeError(error, systemInfo);
				claudeLog.info(
					HANDLER_NAME,
					`Diagnosis complete: ${result.errorType} (${result.severity})`
				);
				return result;
			} catch (err) {
				claudeLog.error(HANDLER_NAME, "Diagnostics analysis failed:", err);
				throw err instanceof Error ? err : new Error(String(err));
			}
		}
	);

	claudeLog.info(HANDLER_NAME, "Diagnostics IPC handlers registered");
}

// CommonJS export for main.ts compatibility
module.exports = {
	setupClaudeDiagnosticsIPC,
	analyzeError,
	getSystemInfo,
};
