import { useCallback, useEffect, useState } from "react";
import type { JianyingFontLabListResult } from "@/types/electron";

const EMPTY_RESULT: JianyingFontLabListResult = {
	count: 0,
	fonts: [],
	rootCount: 0,
	fileCount: 0,
	duplicateFileCount: 0,
	invalidFileCount: 0,
	oversizedFileCount: 0,
};

interface JianyingFontLabState {
	checking: boolean;
	result: JianyingFontLabListResult;
	error: string;
}

export function useJianyingFontLab() {
	const [state, setState] = useState<JianyingFontLabState>({
		checking: true,
		result: EMPTY_RESULT,
		error: "",
	});
	const refresh = useCallback(async ({ force }: { force: boolean }) => {
		const api = window.electronAPI?.jianyingFontLab;
		if (!api) {
			setState({
				checking: false,
				result: EMPTY_RESULT,
				error: "字体实验室仅在 QCut 桌面版中可用",
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
		void refresh({ force: false });
	}, [refresh]);

	return { ...state, refresh };
}
