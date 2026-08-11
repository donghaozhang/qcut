import { useCallback, useEffect, useState } from "react";
import type {
	JianyingFilterLabListResult,
	JianyingFilterLabLutSummary,
} from "@/types/electron";

/**
 * A filter known from the local Jianying catalog metadata but without a
 * locally cached LUT — metadata only, nothing can be loaded for it.
 */
export type JianyingFilterLabKnownFilter =
	JianyingFilterLabListResult["uncached"][number];

interface JianyingFilterLabState {
	checking: boolean;
	luts: JianyingFilterLabLutSummary[];
	categoryOrder: string[];
	uncached: JianyingFilterLabKnownFilter[];
	error: string;
}

export function useJianyingFilterLab() {
	const [state, setState] = useState<JianyingFilterLabState>({
		checking: true,
		luts: [],
		categoryOrder: [],
		uncached: [],
		error: "",
	});
	const refresh = useCallback(async () => {
		const api = window.electronAPI?.jianyingFilterLab;
		if (!api) {
			setState({
				checking: false,
				luts: [],
				categoryOrder: [],
				uncached: [],
				error: "滤镜实验室仅在 QCut 桌面版中可用",
			});
			return null;
		}
		setState((current) => ({ ...current, checking: true, error: "" }));
		try {
			const result = await api.list();
			setState({
				checking: false,
				luts: result.luts,
				categoryOrder: result.categoryOrder ?? [],
				uncached: result.uncached ?? [],
				error: "",
			});
			return result;
		} catch (cause) {
			setState({
				checking: false,
				luts: [],
				categoryOrder: [],
				uncached: [],
				error: cause instanceof Error ? cause.message : String(cause),
			});
			return null;
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return { ...state, refresh };
}
