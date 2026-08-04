import { createHash } from "node:crypto";
import type { CapCutGuiAppReport } from "./gui-regression-app-profile.js";
import {
	inspectCapCutProcesses,
	type CapCutGuiProcessReport,
} from "./gui-regression-process-inspector.js";

export type CapCut81WritebackAppProcessInspector = ({
	app,
}: {
	app: CapCutGuiAppReport;
}) => Promise<CapCutGuiProcessReport[]>;

function getCurrentUid(): number {
	const uid = process.getuid?.();
	if (!Number.isSafeInteger(uid) || Number(uid) < 0) {
		throw new Error("CapCut writeback app capture requires a POSIX user ID.");
	}
	return Number(uid);
}

export async function captureCapCut81WritebackAppProcessBoundary({
	app,
	expectedState,
	inspectProcesses,
	processUid = getCurrentUid(),
}: {
	app: CapCutGuiAppReport;
	expectedState: "absent" | "present";
	inspectProcesses?: CapCut81WritebackAppProcessInspector;
	processUid?: number;
}): Promise<{ generationSha256: string | null; state: "absent" | "present" }> {
	if (process.platform !== "darwin" && !inspectProcesses) {
		throw new Error("CapCut writeback app capture requires macOS.");
	}
	const processInspector: CapCut81WritebackAppProcessInspector =
		inspectProcesses ??
		(({ app: inspectedApp }) => inspectCapCutProcesses({ app: inspectedApp }));
	const processes = await processInspector({ app });
	if (processes.some(({ uid }) => uid !== processUid)) {
		throw new Error(
			"CapCut writeback app capture found a process owned by another user."
		);
	}
	const mainProcesses = processes.filter(
		({ canonicalExecutablePath }) =>
			canonicalExecutablePath === app.executablePath
	);
	if (expectedState === "absent") {
		if (processes.length !== 0 || mainProcesses.length !== 0) {
			throw new Error("CapCut must be completely closed at this boundary.");
		}
		return { generationSha256: null, state: "absent" };
	}
	if (mainProcesses.length !== 1 || !mainProcesses[0]) {
		throw new Error("CapCut must be running at this boundary.");
	}
	const processReport = mainProcesses[0];
	const generation = {
		executableDeviceId: processReport.executableDeviceId,
		executableInode: processReport.executableInode,
		executablePath: processReport.canonicalExecutablePath,
		pgid: processReport.pgid,
		pid: processReport.pid,
		ppid: processReport.ppid,
		startIdentity: processReport.startIdentity,
	};
	return {
		generationSha256: createHash("sha256")
			.update(JSON.stringify(generation), "utf8")
			.digest("hex"),
		state: "present",
	};
}
