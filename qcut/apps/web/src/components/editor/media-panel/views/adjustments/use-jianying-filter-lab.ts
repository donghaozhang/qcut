import { useCallback, useEffect, useState } from "react";
import type {
	JianyingFilterLabCategorySummary,
	JianyingFilterLabFilterSummary,
} from "@/types/electron";

interface JianyingFilterLabState {
	checking: boolean;
	count: number;
	cachedCount: number;
	availableCount: number;
	filters: JianyingFilterLabFilterSummary[];
	categories: JianyingFilterLabCategorySummary[];
	error: string;
}

const EMPTY_CATALOG: Omit<JianyingFilterLabState, "checking" | "error"> = {
	count: 0,
	cachedCount: 0,
	availableCount: 0,
	filters: [],
	categories: [],
};

export function useJianyingFilterLab() {
	const [state, setState] = useState<JianyingFilterLabState>({
		checking: true,
		...EMPTY_CATALOG,
		error: "",
	});
	const load = useCallback(async ({ refresh }: { refresh: boolean }) => {
		const api = window.electronAPI?.jianyingFilterLab;
		if (!api) {
			setState({
				checking: false,
				...EMPTY_CATALOG,
				error: "滤镜实验室仅在 QCut 桌面版中可用",
			});
			return null;
		}
		setState((current) => ({ ...current, checking: true, error: "" }));
		try {
			const result = await api.list({ refresh });
			setState({
				checking: false,
				count: result.count,
				cachedCount: result.cachedCount,
				availableCount: result.availableCount,
				filters: result.filters,
				categories: result.categories,
				error: "",
			});
			return result;
		} catch (cause) {
			setState({
				checking: false,
				...EMPTY_CATALOG,
				error: cause instanceof Error ? cause.message : String(cause),
			});
			return null;
		}
	}, []);
	const refresh = useCallback(() => load({ refresh: true }), [load]);
	const [downloading, setDownloading] = useState<ReadonlySet<string>>(
		() => new Set()
	);
	const download = useCallback(
		async ({ resourceId }: { resourceId: string }) => {
			const api = window.electronAPI?.jianyingFilterLab;
			if (!api?.download) return false;
			setDownloading((current) => new Set(current).add(resourceId));
			try {
				await api.download({ resourceId });
				// The main process invalidates its catalog and emits `changed`,
				// but that listener is not guaranteed to have fired yet — reload
				// here so the card reflects the new package immediately.
				await load({ refresh: true });
				return true;
			} catch (cause) {
				setState((current) => ({
					...current,
					error: cause instanceof Error ? cause.message : String(cause),
				}));
				return false;
			} finally {
				setDownloading((current) => {
					const next = new Set(current);
					next.delete(resourceId);
					return next;
				});
			}
		},
		[load]
	);

	useEffect(() => {
		void load({ refresh: false });
		const api = window.electronAPI?.jianyingFilterLab;
		return api?.onCatalogChanged?.(() => {
			void load({ refresh: false });
		});
	}, [load]);

	return { ...state, refresh, download, downloading };
}
