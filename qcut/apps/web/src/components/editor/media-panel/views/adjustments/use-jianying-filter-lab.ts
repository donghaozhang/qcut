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

	useEffect(() => {
		void load({ refresh: false });
		const api = window.electronAPI?.jianyingFilterLab;
		return api?.onCatalogChanged?.(() => {
			void load({ refresh: false });
		});
	}, [load]);

	return { ...state, refresh };
}
