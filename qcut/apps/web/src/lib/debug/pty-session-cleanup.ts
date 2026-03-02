import { debugError } from "@/lib/debug/debug-config";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";

type CleanupErrorHandler = (message: string, error: unknown) => void;

interface CleanupPtyOnEditorExitOptions {
	onError?: CleanupErrorHandler;
}

export function cleanupPtyOnEditorExit({
	onError = debugError,
}: CleanupPtyOnEditorExitOptions = {}): void {
	try {
		const { sessions } = usePtyTerminalStore.getState();
		if (sessions.size === 0) {
			return;
		}
		// Kill all PTY sessions at once for efficiency
		window.electronAPI?.pty?.killAll()?.catch((error: unknown) => {
			onError("[Editor] Failed to kill all PTY sessions on exit", error);
		});
	} catch (error) {
		onError("[Editor] Unexpected PTY cleanup failure", error);
	}
}
