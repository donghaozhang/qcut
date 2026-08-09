import { useCallback, useEffect, useMemo, useState } from "react";
import type { JianyingTransitionRuntimeStatus } from "@/types/electron";

interface JianyingTransitionRuntimeViewState {
	checking: boolean;
	status: JianyingTransitionRuntimeStatus | null;
	error: string;
}

export function useJianyingTransitionRuntime() {
	const [state, setState] = useState<JianyingTransitionRuntimeViewState>({
		checking: true,
		status: null,
		error: "",
	});
	const refresh = useCallback(async () => {
		const api = window.electronAPI?.jianyingTransitions;
		if (!api) {
			setState({
				checking: false,
				status: null,
				error: "剪映本机转场仅在 QCut 桌面版中可用。",
			});
			return null;
		}
		setState((current) => ({ ...current, checking: true, error: "" }));
		try {
			const status = await api.inspect();
			setState({ checking: false, status, error: "" });
			return status;
		} catch (cause) {
			setState({
				checking: false,
				status: null,
				error: cause instanceof Error ? cause.message : String(cause),
			});
			return null;
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const availableIds = useMemo(() => {
		if (!state.status?.appInstalled || !state.status.bridgeReady) {
			return new Set<string>();
		}
		return new Set(
			state.status.transitions
				.filter((transition) => transition.available)
				.map((transition) => transition.id)
		);
	}, [state.status]);

	return { ...state, availableIds, refresh };
}
