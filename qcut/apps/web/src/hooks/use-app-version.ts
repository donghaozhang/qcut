import { useEffect, useState } from "react";

/**
 * Date-based QCut release version (e.g. "2026.07.26.5"), or null while
 * loading and outside Electron.
 */
export function useAppVersion(): string | null {
	const [version, setVersion] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		window.electronAPI
			?.getAppVersion?.()
			.then((value) => {
				if (!cancelled && value) {
					setVersion(value);
				}
			})
			.catch(() => {
				// Non-Electron or old preload — leave the version hidden.
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return version;
}
