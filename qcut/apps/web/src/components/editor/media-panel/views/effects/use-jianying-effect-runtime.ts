import { useCallback, useEffect, useState } from "react";
import type { JianyingEffectRuntimeStatus } from "@/types/electron";

interface JianyingEffectRuntimeViewState {
	checking: boolean;
	status: JianyingEffectRuntimeStatus | null;
	error: string;
}

const DESKTOP_ONLY_MESSAGE = "本机剪映特效仅在 QCut 桌面版中可用。";

export function useJianyingEffectRuntime({
	enabled = true,
}: {
	enabled?: boolean;
} = {}) {
	const [state, setState] = useState<JianyingEffectRuntimeViewState>({
		checking: true,
		status: null,
		error: "",
	});

	const refresh = useCallback(async () => {
		const api = window.electronAPI?.jianyingEffects;
		if (!api) {
			setState({ checking: false, status: null, error: DESKTOP_ONLY_MESSAGE });
			return null;
		}
		setState((current) => ({ ...current, checking: true, error: "" }));
		try {
			const status = await api.status();
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
		// The status probe reaches the local Jianying runtime, so the caller
		// decides when it may run — the hook now lives in the effects view,
		// which mounts long before anyone opens the lab.
		if (!enabled) return;
		void refresh();
	}, [enabled, refresh]);

	return { ...state, refresh };
}
