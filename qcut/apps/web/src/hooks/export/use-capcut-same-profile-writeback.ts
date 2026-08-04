import { useCallback, useMemo, useRef, useState } from "react";
import {
	recoverCapCut81SameProfileWriteback,
	runCapCut81SameProfileWriteback,
	type CapCut81WritebackClientResult,
} from "@/lib/jianying-draft/capcut-same-profile-writeback-client";
import { isCapCutWritebackSnapshotCurrent } from "@/lib/jianying-draft/capcut-same-profile-writeback-current";
import { createCapCut81WritebackTimingSnapshot } from "@/lib/jianying-draft/capcut-same-profile-writeback-snapshot";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import { CAPCUT_8_1_PROFILE_ID } from "@qcut/editor-core/jianying-draft";

export type CapCutWritebackAvailabilityReason =
	| "baseline-document-missing"
	| "bridge-unavailable"
	| "envelope-not-captured"
	| "envelope-unavailable"
	| "profile-not-writable";

export type CapCutSameProfileWritebackState =
	| { phase: "idle" }
	| { phase: "writing" }
	| {
			phase: "success";
			result: Extract<CapCut81WritebackClientResult, { ok: true }>;
	  }
	| {
			phase: "error";
			failure:
				| Extract<CapCut81WritebackClientResult, { ok: false }>
				| { reason: "unexpected"; message: string };
	  }
	| { phase: "recovering" }
	| {
			phase: "recovered";
			action:
				| "none"
				| "rolled-back"
				| "committed-cleanup"
				| "cleared-stale-lock";
			warnings: string[];
	  };

type RunWriteback = typeof runCapCut81SameProfileWriteback;
type RecoverWriteback = typeof recoverCapCut81SameProfileWriteback;

export interface UseCapCutSameProfileWritebackOptions {
	bridgeAvailable?: boolean;
	project: TProject | null;
	recoverWriteback?: RecoverWriteback;
	runWriteback?: RunWriteback;
	tracks: readonly TimelineTrack[];
}

export interface CapCutSameProfileWritebackController {
	availabilityReason: CapCutWritebackAvailabilityReason | null;
	isBusy: boolean;
	isVisible: boolean;
	recover: () => Promise<void>;
	reset: () => void;
	state: CapCutSameProfileWritebackState;
	writeback: () => Promise<void>;
}

function hasDefaultBridge(): boolean {
	return (
		typeof window !== "undefined" &&
		window.electronAPI?.jianyingSameProfileWriteback !== undefined
	);
}

export function getCapCutWritebackAvailability({
	bridgeAvailable,
	project,
}: {
	bridgeAvailable: boolean;
	project: TProject | null;
}): CapCutWritebackAvailabilityReason | null {
	const binding = project?.draftInterop;
	if (binding === undefined || binding.profileId !== CAPCUT_8_1_PROFILE_ID) {
		return null;
	}
	if (binding.writeback.status === "unavailable") {
		return binding.writeback.reason;
	}
	if (binding.baselineDocument === undefined)
		return "baseline-document-missing";
	if (binding.envelope === undefined) return "envelope-unavailable";
	if (!bridgeAvailable) return "bridge-unavailable";
	return null;
}

function unexpectedFailure({ error }: { error: unknown }) {
	return {
		reason: "unexpected" as const,
		message: error instanceof Error ? error.message : String(error),
	};
}

export function useCapCutSameProfileWriteback({
	bridgeAvailable = hasDefaultBridge(),
	project,
	recoverWriteback = recoverCapCut81SameProfileWriteback,
	runWriteback = runCapCut81SameProfileWriteback,
	tracks,
}: UseCapCutSameProfileWritebackOptions): CapCutSameProfileWritebackController {
	const [state, setState] = useState<CapCutSameProfileWritebackState>({
		phase: "idle",
	});
	const operationIdRef = useRef(0);
	const latestInputRef = useRef({ project, tracks });
	latestInputRef.current = { project, tracks };
	const isVisible = project?.draftInterop?.profileId === CAPCUT_8_1_PROFILE_ID;
	const availabilityReason = useMemo(
		() => getCapCutWritebackAvailability({ bridgeAvailable, project }),
		[bridgeAvailable, project]
	);

	const reset = useCallback(() => {
		operationIdRef.current += 1;
		setState({ phase: "idle" });
	}, []);

	const writeback = useCallback(async () => {
		if (project === null || availabilityReason !== null) return;
		const operationId = operationIdRef.current + 1;
		operationIdRef.current = operationId;
		setState({ phase: "writing" });
		try {
			const capturedSnapshot = createCapCut81WritebackTimingSnapshot({
				fps: project.fps ?? 30,
				tracks,
			});
			const result = await runWriteback({
				deps: {
					verifySnapshotCurrent: ({ project: capturedProject, snapshot }) => {
						const current = latestInputRef.current;
						return Promise.resolve(
							isCapCutWritebackSnapshotCurrent({
								capturedProject,
								capturedSnapshot: snapshot,
								currentProject: current.project,
								currentTracks: current.tracks,
							})
						);
					},
				},
				project,
				snapshot: capturedSnapshot,
			});
			if (operationIdRef.current !== operationId) return;
			setState(
				result.ok
					? { phase: "success", result }
					: { phase: "error", failure: result }
			);
		} catch (error) {
			if (operationIdRef.current !== operationId) return;
			setState({ phase: "error", failure: unexpectedFailure({ error }) });
		}
	}, [availabilityReason, project, runWriteback, tracks]);

	const recover = useCallback(async () => {
		if (state.phase !== "error" || !("selectionToken" in state.failure)) return;
		const selectionToken = state.failure.selectionToken;
		if (selectionToken === undefined) return;
		const operationId = operationIdRef.current + 1;
		operationIdRef.current = operationId;
		setState({ phase: "recovering" });
		try {
			const result = await recoverWriteback({ selectionToken });
			if (operationIdRef.current !== operationId) return;
			if (!result.ok) {
				setState({
					phase: "error",
					failure: {
						reason: "unexpected",
						message:
							"message" in result ? result.message : result.error.message,
					},
				});
				return;
			}
			setState({
				phase: "recovered",
				action: result.value.action,
				warnings: [...result.value.warnings],
			});
		} catch (error) {
			if (operationIdRef.current !== operationId) return;
			setState({ phase: "error", failure: unexpectedFailure({ error }) });
		}
	}, [recoverWriteback, state]);

	return {
		availabilityReason,
		isBusy: state.phase === "writing" || state.phase === "recovering",
		isVisible,
		recover,
		reset,
		state,
		writeback,
	};
}
