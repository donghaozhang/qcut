import { useCallback, useEffect, useState } from "react";
import type { JianyingFilterLabLutSummary } from "@/types/electron";

interface JianyingFilterLabState {
	checking: boolean;
	luts: JianyingFilterLabLutSummary[];
	error: string;
}

export function useJianyingFilterLab() {
	const [state, setState] = useState<JianyingFilterLabState>({
		checking: true,
		luts: [],
		error: "",
	});
	const refresh = useCallback(async () => {
		const api = window.electronAPI?.jianyingFilterLab;
		if (!api) {
			setState({
				checking: false,
				luts: [],
				error: "滤镜实验室仅在 QCut 桌面版中可用",
			});
			return null;
		}
		setState((current) => ({ ...current, checking: true, error: "" }));
		try {
			const result = await api.list();
			setState({ checking: false, luts: result.luts, error: "" });
			return result;
		} catch (cause) {
			setState({
				checking: false,
				luts: [],
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
