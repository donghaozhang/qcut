/**
 * iOS Console Bridge
 *
 * Captures console.log/warn/error into window.__qcutLogs for retrieval
 * via the qcut://console CLI command on iPad.
 *
 * Only activates on iOS/iPadOS (detected via navigator).
 *
 * @module lib/debug/ios-console-bridge
 */

const isIOS =
	typeof navigator !== "undefined" &&
	(/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

if (import.meta.env.DEV && isIOS && !(window as any).__qcutLogsInstalled) {
	(window as any).__qcutLogsInstalled = true;
	const logs: string[] = [];
	const MAX_LOGS = 200;
	const orig = {
		log: console.log.bind(console),
		warn: console.warn.bind(console),
		error: console.error.bind(console),
	};

	const formatArg = (a: unknown): string => {
		if (a instanceof Error) return `${a.name}: ${a.message}`;
		if (typeof a === "object" && a !== null) {
			try {
				return JSON.stringify(a);
			} catch {
				return String(a);
			}
		}
		return String(a);
	};

	for (const level of ["log", "warn", "error"] as const) {
		console[level] = (...args: unknown[]) => {
			const msg = `[${level}] ${args.map(formatArg).join(" ")}`;
			logs.push(msg);
			if (logs.length > MAX_LOGS) logs.shift();
			orig[level](...args);
		};
	}

	(window as any).__qcutLogs = logs;
}
