interface RecordingChunkReadinessSnapshot {
	bytesWritten: number;
	error: Error | null;
	recorderState: RecordingState;
}

type RecordingState = "inactive" | "recording" | "paused";

const sleep = (durationMs: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, durationMs));

export async function waitForFirstRecordingChunk({
	getSnapshot,
	timeoutMs = 5_000,
	intervalMs = 25,
	now = Date.now,
	wait = sleep,
}: {
	getSnapshot: () => RecordingChunkReadinessSnapshot;
	timeoutMs?: number;
	intervalMs?: number;
	now?: () => number;
	wait?: (durationMs: number) => Promise<void>;
}): Promise<{ bytesWritten: number; readyAt: number }> {
	const startedAt = now();

	while (now() - startedAt <= Math.max(1, timeoutMs)) {
		const snapshot = getSnapshot();
		if (snapshot.error) throw snapshot.error;
		if (snapshot.bytesWritten > 0) {
			return {
				bytesWritten: snapshot.bytesWritten,
				readyAt: now(),
			};
		}
		if (snapshot.recorderState === "inactive") {
			throw new Error(
				"MediaRecorder became inactive before writing its first video chunk"
			);
		}
		await wait(Math.max(5, intervalMs));
	}

	throw new Error(
		`MediaRecorder did not write a video chunk within ${timeoutMs}ms`
	);
}
