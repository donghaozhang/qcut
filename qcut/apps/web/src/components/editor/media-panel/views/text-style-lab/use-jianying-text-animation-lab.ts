import { useCallback, useEffect, useState } from "react";
import type { JianyingTextAnimationLabListResult } from "@/types/electron";

const EMPTY_RESULT: JianyingTextAnimationLabListResult = {
	count: 0,
	animations: [],
	catalogCount: 0,
	packageCount: 0,
	missingPackageCount: 0,
	invalidPackageCount: 0,
};

interface JianyingTextAnimationLabState {
	checking: boolean;
	result: JianyingTextAnimationLabListResult;
	error: string;
}

export function useJianyingTextAnimationLab({ enabled }: { enabled: boolean }) {
	const [state, setState] = useState<JianyingTextAnimationLabState>({
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
				error: "剪映文字动画目录仅在 QCut 桌面版中可用",
			});
			return null;
		}
		setState((current) => ({ ...current, checking: true, error: "" }));
		try {
			const result = await api.listAnimations({ refresh: force });
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
