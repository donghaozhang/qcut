import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	JianyingMusicLabBatchResult,
	JianyingMusicLabListResult,
	JianyingMusicLabLoadResult,
} from "@/types/electron";

const EMPTY_RESULT: JianyingMusicLabListResult = {
	refreshedAt: "",
	cacheDirectory: "",
	tracks: [],
	stats: {
		sourceAvailable: false,
		databaseCount: 0,
		metadataSongCount: 0,
		downloadRecordCount: 0,
		matchedTrackCount: 0,
		cachedTrackCount: 0,
		unmatchedDownloadCount: 0,
		invalidDownloadRecordCount: 0,
		copiedTrackCount: 0,
		reusedTrackCount: 0,
	},
	batchCount: 0,
	latestBatch: null,
};

interface JianyingMusicLabState {
	result: JianyingMusicLabListResult;
	isLoading: boolean;
	error: string | null;
}

function errorMessage({ error }: { error: unknown }) {
	return error instanceof Error ? error.message : String(error);
}

export function useJianyingMusicLab() {
	const api = useMemo(
		() =>
			typeof window === "undefined"
				? undefined
				: window.electronAPI?.jianyingMusicLab,
		[]
	);
	const requestVersion = useRef(0);
	const [state, setState] = useState<JianyingMusicLabState>({
		result: EMPTY_RESULT,
		isLoading: Boolean(api),
		error: null,
	});
	const [isBatchCaching, setIsBatchCaching] = useState(false);

	const loadCatalog = useCallback(
		async ({ refresh }: { refresh: boolean }) => {
			if (!api) return;
			const version = requestVersion.current + 1;
			requestVersion.current = version;
			setState((current) => ({
				...current,
				isLoading: true,
				error: null,
			}));
			try {
				const result = await api.list({ refresh });
				if (requestVersion.current !== version) return;
				setState({ result, isLoading: false, error: null });
			} catch (error) {
				if (requestVersion.current !== version) return;
				console.error("[JianyingMusicLab] Failed to load local catalog", error);
				setState((current) => ({
					...current,
					isLoading: false,
					error: errorMessage({ error }),
				}));
			}
		},
		[api]
	);

	useEffect(() => {
		if (!api) return;
		void loadCatalog({ refresh: false });
		return () => {
			requestVersion.current += 1;
		};
	}, [api, loadCatalog]);

	const loadTrack = useCallback(
		async ({
			trackId,
		}: {
			trackId: string;
		}): Promise<JianyingMusicLabLoadResult> => {
			if (!api) throw new Error("音乐实验室仅在 QCut 桌面版中可用");
			return api.load({ trackId });
		},
		[api]
	);

	const cacheNextBatch =
		useCallback(async (): Promise<JianyingMusicLabBatchResult> => {
			if (!api) throw new Error("音乐实验室仅在 QCut 桌面版中可用");
			setIsBatchCaching(true);
			setState((current) => ({ ...current, error: null }));
			try {
				const batchResult = await api.cacheNextBatch({ limit: 20 });
				setState({
					result: batchResult.catalog,
					isLoading: false,
					error: null,
				});
				return batchResult;
			} catch (error) {
				console.error("[JianyingMusicLab] Failed to cache music batch", error);
				setState((current) => ({
					...current,
					error: errorMessage({ error }),
				}));
				throw error;
			} finally {
				setIsBatchCaching(false);
			}
		}, [api]);

	const revealCache = useCallback(async () => {
		if (!api) return false;
		return api.revealCache();
	}, [api]);

	return {
		...state,
		isAvailable: Boolean(api),
		isBatchCaching,
		cacheNextBatch,
		loadTrack,
		refresh: () => loadCatalog({ refresh: true }),
		revealCache,
	};
}
