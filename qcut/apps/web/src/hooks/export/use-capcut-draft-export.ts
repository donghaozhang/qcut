import { useCallback, useEffect, useRef, useState } from "react";
import {
	CapCutDraftSourceStagingError,
	stageCapCutDraftSources,
} from "@/lib/jianying-draft/capcut-draft-source-staging";
import { createQCutDraftExportSnapshot } from "@/lib/jianying-draft/qcut-draft-export-snapshot";
import { generateUUID } from "@/lib/utils";
import { CapCutDraftSourceGrantManager } from "./capcut-draft-source-grant-manager";
import {
	type CapCutDraftExportController,
	type CapCutDraftExportElectronAPI,
	type CapCutDraftExportFailure,
	type CapCutDraftExportState,
	createCaughtFailure,
	createCleanupFailure,
	createRemoteFailure,
	didSourceInputsChange,
	getUnavailableReason,
	IDLE_STATE,
	resolveTargetPlatform,
	type SourceInputs,
	type UseCapCutDraftExportOptions,
} from "./capcut-draft-export-model";

export type {
	CapCutDraftExportElectronAPI,
	CapCutDraftExportFailure,
	CapCutDraftExportState,
} from "./capcut-draft-export-model";

export function useCapCutDraftExport({
	electronAPI,
	mediaItems,
	project,
	tracks,
}: UseCapCutDraftExportOptions): CapCutDraftExportController {
	const [state, setState] = useState<CapCutDraftExportState>(IDLE_STATE);
	const installInFlightRef = useRef(false);
	const operationIdRef = useRef(0);
	const sourceGrantManagerRef = useRef(new CapCutDraftSourceGrantManager());
	const sourceInputsRef = useRef<SourceInputs>({
		mediaItems,
		project,
		tracks,
	});
	const unavailableReason = getUnavailableReason({ electronAPI, project });
	const sourceGrantManager = sourceGrantManagerRef.current;

	const cleanupStagedGrantsForOperation = useCallback(
		({ operationId }: { operationId: number }) =>
			sourceGrantManager.cleanupOperation({
				mediaImport: electronAPI?.mediaImport,
				operationId,
			}),
		[electronAPI, sourceGrantManager]
	);

	const cleanupKnownStagedGrants = useCallback(
		({ maximumOperationId }: { maximumOperationId: number }) =>
			sourceGrantManager.cleanupKnown({
				maximumOperationId,
				mediaImport: electronAPI?.mediaImport,
			}),
		[electronAPI, sourceGrantManager]
	);

	const reset = useCallback(async () => {
		const cancelledThroughOperationId = operationIdRef.current;
		operationIdRef.current = cancelledThroughOperationId + 1;
		setState(IDLE_STATE);
		const operationId = operationIdRef.current;
		const cleanupIssues = await cleanupKnownStagedGrants({
			maximumOperationId: cancelledThroughOperationId,
		});
		if (cleanupIssues.length === 0 || operationIdRef.current !== operationId) {
			return;
		}
		setState({
			failure: {
				code: "STAGING_CLEANUP_FAILED",
				issues: cleanupIssues,
				message: "Some temporary CapCut export sources could not be removed.",
			},
			phase: "error",
		});
	}, [cleanupKnownStagedGrants]);

	useEffect(() => {
		const current = { mediaItems, project, tracks };
		const changed = didSourceInputsChange({
			current,
			previous: sourceInputsRef.current,
		});
		sourceInputsRef.current = current;
		if (
			!changed ||
			(state.phase !== "planning" && state.phase !== "reviewing")
		) {
			return;
		}
		void reset();
	}, [mediaItems, project, reset, state.phase, tracks]);

	useEffect(
		() => () => {
			const cancelledThroughOperationId = operationIdRef.current;
			operationIdRef.current = cancelledThroughOperationId + 1;
			void cleanupKnownStagedGrants({
				maximumOperationId: cancelledThroughOperationId,
			});
		},
		[cleanupKnownStagedGrants]
	);

	const planExport = useCallback(async () => {
		const operationId = operationIdRef.current + 1;
		operationIdRef.current = operationId;
		setState({ phase: "planning" });
		const previousCleanupIssues = await cleanupKnownStagedGrants({
			maximumOperationId: operationId - 1,
		});
		if (operationIdRef.current !== operationId) return;
		if (previousCleanupIssues.length > 0) {
			setState({
				phase: "error",
				failure: {
					code: "STAGING_CLEANUP_FAILED",
					issues: previousCleanupIssues,
					message: "QCut could not clean up a previous CapCut export review.",
				},
			});
			return;
		}

		if (!project) {
			setState({
				phase: "error",
				failure: {
					code: "NO_PROJECT",
					issues: [],
					message: "Open a project before exporting a CapCut draft.",
				},
			});
			return;
		}

		const draftName = project.name.trim();
		if (!draftName) {
			setState({
				phase: "error",
				failure: {
					code: "INVALID_PROJECT_NAME",
					issues: [],
					message: "Name the project before exporting a CapCut draft.",
				},
			});
			return;
		}

		const targetPlatform = electronAPI
			? resolveTargetPlatform({ platform: electronAPI.platform })
			: null;
		const exportApi = electronAPI?.jianyingDraftExport;
		if (
			!targetPlatform ||
			!exportApi ||
			typeof electronAPI?.getFileInfo !== "function" ||
			typeof electronAPI?.getPathForFile !== "function" ||
			!electronAPI.mediaImport
		) {
			setState({
				phase: "error",
				failure: {
					code: "EXPORT_UNAVAILABLE",
					issues: [],
					message:
						getUnavailableReason({ electronAPI, project }) ??
						"CapCut draft export is unavailable.",
				},
			});
			return;
		}

		try {
			const snapshotResult = await createQCutDraftExportSnapshot({
				getPathForFile: electronAPI.getPathForFile,
				mediaItems,
				project,
				sourcePathExists: async ({ sourcePath }) => {
					try {
						return (await electronAPI.getFileInfo(sourcePath)) !== null;
					} catch {
						return false;
					}
				},
				tracks,
			});
			if (operationIdRef.current !== operationId) return;
			if (!snapshotResult.ok) {
				setState({
					phase: "error",
					failure: {
						code: "SNAPSHOT_FAILED",
						issues: snapshotResult.issues.map((issue) => ({ ...issue })),
						message:
							"QCut could not prepare this project for CapCut draft export.",
					},
				});
				return;
			}

			const stagingResult = await stageCapCutDraftSources({
				mediaImport: electronAPI.mediaImport,
				projectId: project.id,
				sessionId: generateUUID(),
				sourceCandidatesByMediaId: snapshotResult.sourceCandidatesByMediaId,
				snapshot: snapshotResult.snapshot,
			});
			if (operationIdRef.current !== operationId) {
				const cleanupOwnerOperationId = operationIdRef.current;
				sourceGrantManager.retain({
					grants: stagingResult.grants,
					operationId,
				});
				const cleanupIssues = await cleanupStagedGrantsForOperation({
					operationId,
				});
				if (
					cleanupIssues.length > 0 &&
					operationIdRef.current === cleanupOwnerOperationId
				) {
					setState({
						failure: createCleanupFailure({
							issues: cleanupIssues,
							message:
								"Some temporary CapCut export sources could not be removed.",
						}),
						phase: "error",
					});
				}
				return;
			}
			sourceGrantManager.retain({
				grants: stagingResult.grants,
				operationId,
			});

			const response = await exportApi.planCapCut81Migration({
				draftName,
				snapshot: stagingResult.snapshot,
				targetPlatform,
			});
			if (operationIdRef.current !== operationId) return;
			if (!response.ok) {
				const cleanupIssues = await cleanupStagedGrantsForOperation({
					operationId,
				});
				if (operationIdRef.current !== operationId) return;
				const failure = createRemoteFailure({ error: response.error });
				setState({
					phase: "error",
					failure: {
						...failure,
						issues: [...failure.issues, ...cleanupIssues],
					},
				});
				return;
			}

			setState({
				phase: "reviewing",
				plan: response.value,
				warningsAcknowledged: false,
			});
		} catch (error) {
			if (error instanceof CapCutDraftSourceStagingError) {
				sourceGrantManager.retain({ grants: error.grants, operationId });
			}
			if (operationIdRef.current !== operationId) {
				const cleanupOwnerOperationId = operationIdRef.current;
				const cleanupIssues = await cleanupStagedGrantsForOperation({
					operationId,
				});
				if (
					cleanupIssues.length > 0 &&
					operationIdRef.current === cleanupOwnerOperationId
				) {
					setState({
						failure: createCleanupFailure({
							issues: cleanupIssues,
							message:
								"Some temporary CapCut export sources could not be removed.",
						}),
						phase: "error",
					});
				}
				return;
			}
			const cleanupIssues = await cleanupStagedGrantsForOperation({
				operationId,
			});
			if (operationIdRef.current !== operationId) return;
			const failure =
				error instanceof CapCutDraftSourceStagingError
					? {
							code: "SOURCE_STAGING_FAILED",
							issues: error.issues,
							message: error.message,
						}
					: createCaughtFailure({
							error,
							fallbackMessage: "QCut could not review the CapCut draft export.",
						});
			setState({
				phase: "error",
				failure: {
					...failure,
					issues: [...failure.issues, ...cleanupIssues],
				},
			});
		}
	}, [
		cleanupKnownStagedGrants,
		cleanupStagedGrantsForOperation,
		electronAPI,
		mediaItems,
		project,
		sourceGrantManager,
		tracks,
	]);

	const acknowledgeWarnings = useCallback(
		({ accepted }: { accepted: boolean }) => {
			setState((current) => {
				if (current.phase !== "reviewing") return current;
				return { ...current, warningsAcknowledged: accepted };
			});
		},
		[]
	);

	const commitExport = useCallback(async () => {
		if (state.phase !== "reviewing" || sourceGrantManager.hasCommitInFlight())
			return;
		const { plan, warningsAcknowledged } = state;
		const hasWarnings = plan.warningFingerprints.length > 0;
		if (!plan.canCommit || (hasWarnings && !warningsAcknowledged)) return;

		const exportApi = electronAPI?.jianyingDraftExport;
		if (!exportApi) {
			const cleanupIssues = await cleanupStagedGrantsForOperation({
				operationId: operationIdRef.current,
			});
			setState({
				phase: "error",
				failure: {
					code: "EXPORT_UNAVAILABLE",
					issues: cleanupIssues,
					message: "CapCut draft export is no longer available.",
				},
			});
			return;
		}

		const grantOperationId = operationIdRef.current;
		if (!sourceGrantManager.beginCommit({ operationId: grantOperationId }))
			return;
		const operationId = operationIdRef.current + 1;
		operationIdRef.current = operationId;
		setState({ phase: "committing" });

		try {
			const response = await exportApi.commitCapCut81Migration({
				acceptedWarningFingerprints: [...plan.warningFingerprints],
				planToken: plan.planToken,
			});
			if (operationIdRef.current !== operationId) return;
			const cleanupIssues = await cleanupStagedGrantsForOperation({
				operationId: grantOperationId,
			});
			if (operationIdRef.current !== operationId) return;
			if (!response.ok) {
				const failure = createRemoteFailure({ error: response.error });
				setState({
					phase: "error",
					failure: {
						...failure,
						issues: [...failure.issues, ...cleanupIssues],
					},
				});
				return;
			}
			setState({
				cleanupIssues,
				install: { phase: "idle" },
				phase: "success",
				result: response.value,
			});
		} catch (error) {
			if (operationIdRef.current !== operationId) return;
			const cleanupIssues = await cleanupStagedGrantsForOperation({
				operationId: grantOperationId,
			});
			if (operationIdRef.current !== operationId) return;
			const failure = createCaughtFailure({
				error,
				fallbackMessage: "QCut could not create the CapCut draft bundle.",
			});
			setState({
				phase: "error",
				failure: {
					...failure,
					issues: [...failure.issues, ...cleanupIssues],
				},
			});
		} finally {
			await sourceGrantManager.finishCommit({
				mediaImport: electronAPI?.mediaImport,
				operationId: grantOperationId,
			});
		}
	}, [cleanupStagedGrantsForOperation, electronAPI, sourceGrantManager, state]);

	const installDraft = useCallback(async () => {
		if (
			state.phase !== "success" ||
			state.install.phase === "installing" ||
			state.install.phase === "success" ||
			installInFlightRef.current
		) {
			return;
		}
		const exportApi = electronAPI?.jianyingDraftExport;
		if (!exportApi) {
			setState({
				...state,
				install: {
					failure: {
						code: "EXPORT_UNAVAILABLE",
						issues: [],
						message: "CapCut installation is no longer available.",
					},
					phase: "error",
				},
			});
			return;
		}
		installInFlightRef.current = true;
		const committedResult = state.result;
		setState({ ...state, install: { phase: "installing" } });
		try {
			const response = await exportApi.installCapCut81Migration({
				outputDirectory: committedResult.outputDirectory,
			});
			if (!response.ok) {
				setState({
					...state,
					install: {
						failure: createRemoteFailure({ error: response.error }),
						phase: "error",
					},
				});
				return;
			}
			setState({
				...state,
				install: { phase: "success", result: response.value },
			});
		} catch (error) {
			setState({
				...state,
				install: {
					failure: createCaughtFailure({
						error,
						fallbackMessage: "QCut could not install the draft into CapCut.",
					}),
					phase: "error",
				},
			});
		} finally {
			installInFlightRef.current = false;
		}
	}, [electronAPI, state]);

	return {
		acknowledgeWarnings,
		commitExport,
		installDraft,
		isBusy:
			state.phase === "planning" ||
			state.phase === "committing" ||
			(state.phase === "success" && state.install.phase === "installing"),
		planExport,
		reset,
		state,
		unavailableReason,
	};
}
