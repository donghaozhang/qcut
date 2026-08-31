const activeControllers = new Map<string, AbortController>();

export function cancelPlanarTrackingRuntime({
	stickerElementId,
}: {
	stickerElementId: string;
}): boolean {
	const controller = activeControllers.get(stickerElementId);
	if (!controller) return false;
	controller.abort();
	return true;
}

export async function runPlanarTrackingRuntime<T>({
	stickerElementId,
	task,
}: {
	stickerElementId: string;
	task: ({ signal }: { signal: AbortSignal }) => Promise<T>;
}): Promise<T> {
	cancelPlanarTrackingRuntime({ stickerElementId });
	const controller = new AbortController();
	activeControllers.set(stickerElementId, controller);
	try {
		return await task({ signal: controller.signal });
	} finally {
		if (activeControllers.get(stickerElementId) === controller) {
			activeControllers.delete(stickerElementId);
		}
	}
}

export function hasActivePlanarTrackingRuntime({
	stickerElementId,
}: {
	stickerElementId: string;
}): boolean {
	return activeControllers.has(stickerElementId);
}
