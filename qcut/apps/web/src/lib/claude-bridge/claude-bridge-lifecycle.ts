import { debugError } from "@/lib/debug/debug-config";
import {
	cleanupClaudeProjectBridge,
	cleanupClaudeTimelineBridge,
	setupClaudeProjectBridge,
	setupClaudeTimelineBridge,
} from "@/lib/claude-bridge/claude-timeline-bridge";
import {
	cleanupClaudeNavigatorBridge,
	setupClaudeNavigatorBridge,
} from "@/lib/claude-bridge/claude-navigator-bridge";
import {
	cleanupClaudeScreenRecordingBridge,
	setupClaudeScreenRecordingBridge,
} from "@/lib/claude-bridge/claude-screen-recording-bridge";
import {
	cleanupClaudeUiBridge,
	setupClaudeUiBridge,
} from "@/lib/claude-bridge/claude-ui-bridge";
import {
	cleanupClaudeProjectCrudBridge,
	setupClaudeProjectCrudBridge,
} from "@/lib/claude-bridge/claude-project-crud-bridge";
import {
	cleanupClaudeMoyinBridge,
	setupClaudeMoyinBridge,
} from "@/lib/claude-bridge/claude-moyin-bridge";
import {
	cleanupClaudeTransactionBridge,
	setupClaudeTransactionBridge,
} from "@/lib/claude-bridge/claude-transaction-bridge";
import {
	cleanupClaudeStateBridge,
	setupClaudeStateBridge,
} from "@/lib/claude-bridge/claude-state-bridge";
import {
	cleanupClaudeEventsBridge,
	setupClaudeEventsBridge,
} from "@/lib/claude-bridge/claude-events-bridge";
import {
	cleanupQCutImportEvidenceBridge,
	setupQCutImportEvidenceBridge,
} from "@/lib/claude-bridge/qcut-import-evidence-bridge";
import {
	cleanupQCutSameProfileWritebackBridge,
	setupQCutSameProfileWritebackBridge,
} from "@/lib/claude-bridge/qcut-same-profile-writeback-bridge";
import {
	cleanupQCutJianyingProjectImportBridge,
	setupQCutJianyingProjectImportBridge,
} from "@/lib/claude-bridge/qcut-jianying-project-import-bridge";
import {
	cleanupQCutJianyingProjectExportBridge,
	setupQCutJianyingProjectExportBridge,
} from "@/lib/claude-bridge/qcut-jianying-project-export-bridge";

type ClaudeBridgeErrorHandler = (message: string, error: unknown) => void;

interface SetupClaudeBridgeLifecycleOptions {
	onError?: ClaudeBridgeErrorHandler;
}

interface RunBridgeStepInput {
	message: string;
	step: () => void;
	onError: ClaudeBridgeErrorHandler;
}

/** Execute a single bridge setup/cleanup step, catching and reporting errors. */
function runBridgeStep({ message, step, onError }: RunBridgeStepInput): void {
	try {
		step();
	} catch (error) {
		onError(message, error);
	}
}

/** Register all Claude IPC bridges and return a cleanup function to tear them down. */
export function setupClaudeBridgeLifecycle({
	onError = debugError,
}: SetupClaudeBridgeLifecycleOptions = {}): () => void {
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup transaction bridge",
		step: setupClaudeTransactionBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup timeline bridge",
		step: setupClaudeTimelineBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup project bridge",
		step: setupClaudeProjectBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup navigator bridge",
		step: setupClaudeNavigatorBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup screen recording bridge",
		step: setupClaudeScreenRecordingBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup UI bridge",
		step: setupClaudeUiBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup project CRUD bridge",
		step: setupClaudeProjectCrudBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup moyin bridge",
		step: setupClaudeMoyinBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup state bridge",
		step: setupClaudeStateBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup import evidence bridge",
		step: setupQCutImportEvidenceBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup same-profile writeback bridge",
		step: setupQCutSameProfileWritebackBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup Jianying project import bridge",
		step: setupQCutJianyingProjectImportBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup Jianying project export bridge",
		step: setupQCutJianyingProjectExportBridge,
		onError,
	});
	runBridgeStep({
		message: "[ClaudeBridge] Failed to setup events bridge",
		step: setupClaudeEventsBridge,
		onError,
	});

	return () => {
		runBridgeStep({
			message: "[ClaudeBridge] Failed to cleanup transaction bridge",
			step: cleanupClaudeTransactionBridge,
			onError,
		});
		runBridgeStep({
			message: "[ClaudeBridge] Failed to cleanup timeline bridge",
			step: cleanupClaudeTimelineBridge,
			onError,
		});
		runBridgeStep({
			message: "[ClaudeBridge] Failed to cleanup project bridge",
			step: cleanupClaudeProjectBridge,
			onError,
		});
		runBridgeStep({
			message: "[ClaudeBridge] Failed to cleanup navigator bridge",
			step: cleanupClaudeNavigatorBridge,
			onError,
		});
		runBridgeStep({
			message: "[ClaudeBridge] Failed to cleanup screen recording bridge",
			step: cleanupClaudeScreenRecordingBridge,
			onError,
		});
		runBridgeStep({
			message: "[ClaudeBridge] Failed to cleanup UI bridge",
			step: cleanupClaudeUiBridge,
			onError,
		});
		runBridgeStep({
			message: "[ClaudeBridge] Failed to cleanup project CRUD bridge",
			step: cleanupClaudeProjectCrudBridge,
			onError,
		});
		runBridgeStep({
			message: "[ClaudeBridge] Failed to cleanup moyin bridge",
			step: cleanupClaudeMoyinBridge,
			onError,
		});
		runBridgeStep({
			message: "[ClaudeBridge] Failed to cleanup state bridge",
			step: cleanupClaudeStateBridge,
			onError,
		});
		runBridgeStep({
			message: "[ClaudeBridge] Failed to cleanup same-profile writeback bridge",
			step: cleanupQCutSameProfileWritebackBridge,
			onError,
		});
		runBridgeStep({
			message:
				"[ClaudeBridge] Failed to cleanup Jianying project import bridge",
			step: cleanupQCutJianyingProjectImportBridge,
			onError,
		});
		runBridgeStep({
			message:
				"[ClaudeBridge] Failed to cleanup Jianying project export bridge",
			step: cleanupQCutJianyingProjectExportBridge,
			onError,
		});
		runBridgeStep({
			message: "[ClaudeBridge] Failed to cleanup import evidence bridge",
			step: cleanupQCutImportEvidenceBridge,
			onError,
		});
		runBridgeStep({
			message: "[ClaudeBridge] Failed to cleanup events bridge",
			step: cleanupClaudeEventsBridge,
			onError,
		});
	};
}
