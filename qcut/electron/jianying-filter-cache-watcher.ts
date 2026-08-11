import { watch, type FSWatcher } from "node:fs";
import { dirname, join } from "node:path";
import { jianyingEffectCacheRoot } from "./native-pipeline/filters/filter-lab-lut.js";

const CHANGE_DEBOUNCE_MS = 250;
const SQLITE_RUNTIME_SUFFIXES = ["-shm", "-wal", "-journal"];

export interface JianyingFilterCacheWatcher {
	dispose: () => void;
}

export function shouldInvalidateJianyingFilterCache({
	directory,
	fileName,
}: {
	directory: string;
	fileName: string | null;
}) {
	if (directory !== "ressdk_db" || !fileName) return true;
	const normalized = fileName.toLowerCase();
	// Read-only SQLite connections still touch these files; reacting would rescan forever.
	return !SQLITE_RUNTIME_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function watchJianyingFilterCaches({
	onChange,
	cacheRoot = dirname(jianyingEffectCacheRoot()),
}: {
	onChange: () => void;
	cacheRoot?: string;
}): JianyingFilterCacheWatcher {
	const watchers: FSWatcher[] = [];
	let changeTimer: NodeJS.Timeout | undefined;
	const scheduleChange = () => {
		if (changeTimer) clearTimeout(changeTimer);
		changeTimer = setTimeout(onChange, CHANGE_DEBOUNCE_MS);
	};
	for (const directory of ["artistEffect", "effect", "ressdk_db"]) {
		try {
			watchers.push(
				watch(
					join(cacheRoot, directory),
					{ recursive: true },
					(_eventType, fileName) => {
						if (shouldInvalidateJianyingFilterCache({ directory, fileName })) {
							scheduleChange();
						}
					}
				)
			);
		} catch {
			// Missing cache roots are normal before Jianying downloads its first item.
		}
	}
	return {
		dispose: () => {
			if (changeTimer) clearTimeout(changeTimer);
			for (const watcher of watchers) watcher.close();
		},
	};
}
