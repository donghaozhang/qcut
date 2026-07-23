import { app, systemPreferences } from "electron";
import { listCaptureSources } from "./file-ops.js";
import { buildStatus } from "./session.js";

export type ScreenRecordingPermissionStatus =
	| "granted"
	| "denied"
	| "restricted"
	| "not-determined"
	| "unknown";

export interface ScreenRecordingDiagnostics {
	ready: boolean;
	platform: NodeJS.Platform;
	permission: ScreenRecordingPermissionStatus;
	permissionCheckBypassed: boolean;
	restartRecommended: boolean;
	application: {
		name: string;
		version: string;
		executablePath: string;
		packaged: boolean;
		electronVersion: string;
	};
	recording: ReturnType<typeof buildStatus>;
	sourceProbe: {
		ok: boolean;
		count: number;
		screenCount: number;
		windowCount: number;
		names: string[];
		error?: string;
	};
	settingsUrl: string | null;
	remediation: string[];
}

function getPermissionStatus(): ScreenRecordingPermissionStatus {
	if (process.platform !== "darwin") return "granted";
	try {
		return systemPreferences.getMediaAccessStatus("screen");
	} catch {
		return "unknown";
	}
}

/** Inspect permission and source availability without starting a recording. */
export async function diagnoseScreenRecording(): Promise<ScreenRecordingDiagnostics> {
	const permission = getPermissionStatus();
	const permissionCheckBypassed =
		process.env.QCUT_SKIP_PERMISSION_CHECK === "1";
	let sourceProbe: ScreenRecordingDiagnostics["sourceProbe"];
	try {
		const sources = await listCaptureSources({ currentWindowSourceId: null });
		sourceProbe = {
			ok: true,
			count: sources.length,
			screenCount: sources.filter((source) => source.type === "screen").length,
			windowCount: sources.filter((source) => source.type === "window").length,
			names: sources.slice(0, 20).map((source) => source.name),
		};
	} catch (error) {
		sourceProbe = {
			ok: false,
			count: 0,
			screenCount: 0,
			windowCount: 0,
			names: [],
			error: error instanceof Error ? error.message : String(error),
		};
	}

	const denied = permission === "denied" || permission === "restricted";
	const restartRecommended =
		process.platform === "darwin" && permission !== "granted";
	const remediation: string[] = [];
	if (process.platform === "darwin" && denied) {
		remediation.push(
			"Open System Settings > Privacy & Security > Screen & System Audio Recording and enable QCut (or Electron while developing)."
		);
	}
	if (process.platform === "darwin" && permission === "not-determined") {
		remediation.push(
			"Start a recording once from QCut to trigger the macOS permission prompt."
		);
	}
	if (!sourceProbe.ok || sourceProbe.count === 0) {
		remediation.push(
			"Make sure a display is connected and at least one capturable window is open."
		);
	}
	if (restartRecommended) {
		remediation.push(
			"Quit QCut completely and reopen it after changing screen-recording permission."
		);
	}
	if (permissionCheckBypassed) {
		remediation.push(
			"QCUT_SKIP_PERMISSION_CHECK=1 is active; macOS capture itself is the final permission check."
		);
	}

	return {
		ready: !denied && sourceProbe.ok && sourceProbe.count > 0,
		platform: process.platform,
		permission,
		permissionCheckBypassed,
		restartRecommended,
		application: {
			name: app.getName(),
			version: app.getVersion(),
			executablePath: process.execPath,
			packaged: app.isPackaged,
			electronVersion: process.versions.electron ?? "unknown",
		},
		recording: buildStatus(),
		sourceProbe,
		settingsUrl:
			process.platform === "darwin"
				? "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
				: null,
		remediation,
	};
}
