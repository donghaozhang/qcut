export interface ColorDegradationEvent {
	/** Distinct degradation kind, e.g. "css-fallback". Deduped per session. */
	reason: string;
	detail?: string;
}

type ColorDegradationListener = (event: ColorDegradationEvent) => void;

const listeners = new Set<ColorDegradationListener>();
const reportedReasons = new Set<string>();

/**
 * Report a color-rendering quality degradation. Each distinct reason notifies
 * listeners at most once per session so UI surfaces (toasts) fire only once.
 */
export function reportColorDegradation(event: ColorDegradationEvent): void {
	// A report with no subscribers must not consume the reason: the first
	// listener to mount later (e.g. the preview canvas, after an export
	// already degraded) still needs to receive the signal once.
	if (listeners.size === 0) return;
	if (reportedReasons.has(event.reason)) return;
	reportedReasons.add(event.reason);
	for (const listener of listeners) {
		listener(event);
	}
}

export function subscribeColorDegradation(
	listener: ColorDegradationListener
): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Test-only: clear listeners and the per-session de-dupe state. */
export function resetColorDegradationForTests(): void {
	listeners.clear();
	reportedReasons.clear();
}
