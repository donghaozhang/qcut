export interface CloudTaskRuntimeActions {
	cancel?: () => void | Promise<unknown>;
	retry?: () => void | Promise<unknown>;
	open?: () => void | Promise<unknown>;
	undo?: () => void | Promise<unknown>;
}

const runtimeActions = new Map<string, CloudTaskRuntimeActions>();

export function registerCloudTaskRuntimeActions({
	taskId,
	actions,
}: {
	taskId: string;
	actions: CloudTaskRuntimeActions;
}): () => void {
	runtimeActions.set(taskId, actions);
	return () => runtimeActions.delete(taskId);
}

export function getCloudTaskRuntimeActions({
	taskId,
}: {
	taskId: string;
}): CloudTaskRuntimeActions | undefined {
	return runtimeActions.get(taskId);
}

export function clearCloudTaskRuntimeActions({ taskId }: { taskId: string }) {
	runtimeActions.delete(taskId);
}

export function clearAllCloudTaskRuntimeActions() {
	runtimeActions.clear();
}
