export interface ProcessInactivityWatchdog {
	clear: () => void;
	reset: () => void;
}

export function createProcessInactivityWatchdog({
	onTimeout,
	timeoutMs,
}: {
	onTimeout: () => void;
	timeoutMs: number;
}): ProcessInactivityWatchdog {
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
		throw new Error("进程无响应超时时间无效");
	}
	let timer: ReturnType<typeof setTimeout> | null = null;
	const clear = () => {
		if (!timer) return;
		clearTimeout(timer);
		timer = null;
	};
	const reset = () => {
		clear();
		timer = setTimeout(() => {
			timer = null;
			onTimeout();
		}, timeoutMs);
	};
	return { clear, reset };
}
