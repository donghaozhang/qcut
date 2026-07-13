export interface StoredCloudReviewState {
	projectId: string;
	revision: number;
	token: string;
	url: string;
}

const STORAGE_PREFIX = "qcut-cloud-review:v1:";

function storageKey({ projectId }: { projectId: string }) {
	return `${STORAGE_PREFIX}${encodeURIComponent(projectId)}`;
}

export function loadStoredCloudReview({
	projectId,
}: {
	projectId: string;
}): StoredCloudReviewState | null {
	try {
		const raw = localStorage.getItem(storageKey({ projectId }));
		if (!raw) return null;
		const value = JSON.parse(raw) as Partial<StoredCloudReviewState>;
		if (
			value.projectId !== projectId ||
			typeof value.revision !== "number" ||
			!Number.isInteger(value.revision) ||
			value.revision < 1 ||
			typeof value.token !== "string" ||
			typeof value.url !== "string"
		) {
			return null;
		}
		return value as StoredCloudReviewState;
	} catch {
		return null;
	}
}

export function storeCloudReview({ state }: { state: StoredCloudReviewState }) {
	localStorage.setItem(
		storageKey({ projectId: state.projectId }),
		JSON.stringify(state)
	);
}

export function clearStoredCloudReview({ projectId }: { projectId: string }) {
	localStorage.removeItem(storageKey({ projectId }));
}
