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
}): boolean {
	if (!maskId) return false;
	const runtime = activeMaskTrackingRuntimes.get(
		runtimeKey({ elementId, maskId })
	);
	if (!runtime) return false;
	void runtime.cancel();
	return true;
}

export function resumeActiveMaskTracking({
	elementId,
	maskId,
}: {
	elementId: string;
	maskId?: string;
}): boolean {
	if (!maskId) return false;
	const runtime = activeMaskTrackingRuntimes.get(
		runtimeKey({ elementId, maskId })
	);
	if (!runtime?.resume) return false;
	void runtime.resume();
	return true;
}

export function clearActiveMaskTrackingRuntimes(): void {
	activeMaskTrackingRuntimes.clear();
}
