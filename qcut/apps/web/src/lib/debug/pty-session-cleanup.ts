import { debugError } from "@/lib/debug/debug-config";
import { platform } from "@qcut/platform-core";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";

type CleanupErrorHandler = (message: string, error: unknown) => void;

interface CleanupPtyOnEditorExitOptions {
	onError?: CleanupErrorHandler;
}

export function cleanupPtyOnEditorExit({
	onError = debugError,
}: CleanupPtyOnEditorExitOptions = {}): void {
	try {
		// Always attempt killAll — backend may have orphan sessions not tracked in store
		platform().pty?.killAll()?.catch((error: unknown) => {
			onError("[Editor] Failed to kill all PTY sessions on exit", error);
		});
	} catch (error) {
		onError("[Editor] Unexpected PTY cleanup failure", error);
	}
}
