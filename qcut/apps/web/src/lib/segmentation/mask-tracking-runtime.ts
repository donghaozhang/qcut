import type { MediaMaskTrackingDirection } from "@/types/timeline";

export interface ActiveMaskTrackingRuntime {
	elementId: string;
	maskId: string;
	source: "mediapipe" | "sam3";
	direction: MediaMaskTrackingDirection;
	cancel: () => void | Promise<void>;
	resume?: () => void | Promise<void>;
}

function runtimeKey({
	elementId,
	maskId,
}: {
	elementId: string;
	maskId: string;
}): string {
	return `${elementId}:${maskId}`;
}

const activeMaskTrackingRuntimes = new Map<string, ActiveMaskTrackingRuntime>();

async function runRuntimeAction({
	action,
	operation,
}: {
	action: () => void | Promise<void>;
	operation: "cancel" | "resume";
}): Promise<boolean> {
	try {
		await action();
		return true;
	} catch (error) {
		console.error(`Failed to ${operation} mask tracking`, error);
		return false;
	}
}

export function registerActiveMaskTrackingRuntime({
	runtime,
}: {
	runtime: ActiveMaskTrackingRuntime;
}): () => void {
	const key = runtimeKey(runtime);
	activeMaskTrackingRuntimes.set(key, runtime);
	return () => {
		if (activeMaskTrackingRuntimes.get(key) === runtime) {
			activeMaskTrackingRuntimes.delete(key);
		}
	};
}

export function cancelActiveMaskTracking({
	elementId,
	maskId,
}: {
	elementId: string;
	maskId?: string;
}): Promise<boolean> {
	if (!maskId) return Promise.resolve(false);
	const runtime = activeMaskTrackingRuntimes.get(
		runtimeKey({ elementId, maskId })
	);
	if (!runtime) return Promise.resolve(false);
	return runRuntimeAction({ action: runtime.cancel, operation: "cancel" });
}

export function resumeActiveMaskTracking({
	elementId,
	maskId,
}: {
	elementId: string;
	maskId?: string;
}): Promise<boolean> {
	if (!maskId) return Promise.resolve(false);
	const runtime = activeMaskTrackingRuntimes.get(
		runtimeKey({ elementId, maskId })
	);
	if (!runtime?.resume) return Promise.resolve(false);
	return runRuntimeAction({ action: runtime.resume, operation: "resume" });
}

export function clearActiveMaskTrackingRuntimes(): void {
	activeMaskTrackingRuntimes.clear();
}
