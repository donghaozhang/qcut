import type { CapCutGuiAppReport } from "./gui-regression-app-profile.js";
import type { CapCutGuiStepAction } from "./gui-regression-contract.js";
import type { CapCutGuiProcessReport } from "./gui-regression-process-inspector.js";
import type { CapCutGuiSessionReport } from "./gui-regression-session-guard.js";

export interface CapCutGuiMainProcessGeneration {
	executableDeviceId: string;
	executableInode: string;
	executablePath: string;
	pgid: number;
	pid: number;
	ppid: number;
	startIdentity: string;
}

export interface CapCutGuiProcessGenerationState {
	current: CapCutGuiMainProcessGeneration | null;
	seenGenerationKeys: readonly string[];
}

function toGeneration({
	processReport,
}: {
	processReport: CapCutGuiProcessReport;
}): CapCutGuiMainProcessGeneration {
	return {
		executableDeviceId: processReport.executableDeviceId,
		executableInode: processReport.executableInode,
		executablePath: processReport.canonicalExecutablePath,
		pgid: processReport.pgid,
		pid: processReport.pid,
		ppid: processReport.ppid,
		startIdentity: processReport.startIdentity,
	};
}

export function getCapCutGuiMainProcessGeneration({
	app,
	report,
}: {
	app: CapCutGuiAppReport;
	report: CapCutGuiSessionReport;
}): CapCutGuiMainProcessGeneration | null {
	const mainProcesses = report.processes.filter(
		({ canonicalExecutablePath }) =>
			canonicalExecutablePath === app.executablePath
	);
	if (mainProcesses.length === 0) return null;
	if (mainProcesses.length !== 1 || !mainProcesses[0]) {
		throw new Error("Cannot derive one CapCut main process generation.");
	}
	return toGeneration({ processReport: mainProcesses[0] });
}

function generationKey({
	generation,
}: {
	generation: CapCutGuiMainProcessGeneration;
}): string {
	return JSON.stringify(generation);
}

function generationsMatch({
	left,
	right,
}: {
	left: CapCutGuiMainProcessGeneration | null;
	right: CapCutGuiMainProcessGeneration | null;
}): boolean {
	if (left === null || right === null) return left === right;
	return (
		generationKey({ generation: left }) === generationKey({ generation: right })
	);
}

function requireAbsent({
	generation,
	label,
}: {
	generation: CapCutGuiMainProcessGeneration | null;
	label: string;
}): void {
	if (generation !== null)
		throw new Error(`${label} requires CapCut to be absent.`);
}

function requirePresent({
	generation,
	label,
}: {
	generation: CapCutGuiMainProcessGeneration | null;
	label: string;
}): CapCutGuiMainProcessGeneration {
	if (generation === null)
		throw new Error(`${label} requires CapCut to be running.`);
	return generation;
}

export function createCapCutGuiProcessGenerationState({
	app,
	report,
}: {
	app: CapCutGuiAppReport;
	report: CapCutGuiSessionReport;
}): CapCutGuiProcessGenerationState {
	const current = getCapCutGuiMainProcessGeneration({ app, report });
	return {
		current,
		seenGenerationKeys: current ? [generationKey({ generation: current })] : [],
	};
}

export function advanceCapCutGuiProcessGeneration({
	afterReport,
	app,
	beforeReport,
	state,
	stepAction,
}: {
	afterReport: CapCutGuiSessionReport;
	app: CapCutGuiAppReport;
	beforeReport: CapCutGuiSessionReport;
	state: CapCutGuiProcessGenerationState;
	stepAction: CapCutGuiStepAction;
}): CapCutGuiProcessGenerationState {
	const before = getCapCutGuiMainProcessGeneration({
		app,
		report: beforeReport,
	});
	const after = getCapCutGuiMainProcessGeneration({ app, report: afterReport });
	if (!generationsMatch({ left: state.current, right: before })) {
		throw new Error(
			"CapCut main process generation drifted between consecutive GUI boundaries."
		);
	}
	if (
		stepAction === "capture-root-before" ||
		stepAction === "capture-root-after"
	) {
		throw new Error(
			"Root fingerprint steps cannot advance a GUI process generation."
		);
	}
	if (stepAction === "install-bundle") {
		requireAbsent({ generation: before, label: stepAction });
		requireAbsent({ generation: after, label: stepAction });
		return state;
	}
	if (stepAction === "open-draft-first-time" || stepAction === "reopen-draft") {
		requireAbsent({ generation: before, label: stepAction });
		const launched = requirePresent({ generation: after, label: stepAction });
		const nextKey = generationKey({ generation: launched });
		if (state.seenGenerationKeys.includes(nextKey)) {
			throw new Error(
				"CapCut launch reused a previously observed process generation."
			);
		}
		return {
			current: launched,
			seenGenerationKeys: [...state.seenGenerationKeys, nextKey],
		};
	}
	if (stepAction === "save-and-quit" || stepAction === "quit") {
		requirePresent({ generation: before, label: stepAction });
		requireAbsent({ generation: after, label: stepAction });
		return { ...state, current: null };
	}
	const runningBefore = requirePresent({
		generation: before,
		label: stepAction,
	});
	const runningAfter = requirePresent({ generation: after, label: stepAction });
	if (!generationsMatch({ left: runningBefore, right: runningAfter })) {
		throw new Error(
			`CapCut main process generation changed during ${stepAction}.`
		);
	}
	return { ...state, current: runningAfter };
}

export function assertCapCutGuiProcessGenerationContinuity({
	app,
	report,
	state,
}: {
	app: CapCutGuiAppReport;
	report: CapCutGuiSessionReport;
	state: CapCutGuiProcessGenerationState;
}): void {
	const observed = getCapCutGuiMainProcessGeneration({ app, report });
	if (!generationsMatch({ left: state.current, right: observed })) {
		throw new Error(
			"CapCut main process generation drifted at the final boundary."
		);
	}
}
