import { useCallback, useEffect, useState } from "react";
import type { JianyingTextStyleLabListResult } from "@/types/electron";

const EMPTY_RESULT: JianyingTextStyleLabListResult = {
	count: 0,
	styles: [],
	categories: [],
	packageCount: 0,
	invalidPackageCount: 0,
};

interface JianyingTextStyleLabState {
	checking: boolean;
	result: JianyingTextStyleLabListResult;
	error: string;
}

export function useJianyingTextStyleLab({ enabled }: { enabled: boolean }) {
	const [state, setState] = useState<JianyingTextStyleLabState>({
		checking: enabled,
		result: EMPTY_RESULT,
		error: "",
	});
	const refresh = useCallback(async ({ force }: { force: boolean }) => {
		const api = window.electronAPI?.jianyingTextStyleLab;
		if (!api) {
			setState({
				checking: false,
				result: EMPTY_RESULT,
				error: "花字实验室仅在 QCut 桌面版中可用",
			});
			return null;
		}
		setState((current) => ({ ...current, checking: true, error: "" }));
		try {
			const result = await api.list({ refresh: force });
			setState({ checking: false, result, error: "" });
			return result;
		} catch (cause) {
			setState({
				checking: false,
				result: EMPTY_RESULT,
				error: cause instanceof Error ? cause.message : String(cause),
			});
			return null;
		}
	}, []);

	useEffect(() => {
		if (!enabled) return;
		void refresh({ force: false });
	}, [enabled, refresh]);

	return { ...state, refresh };
}
