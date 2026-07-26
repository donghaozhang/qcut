"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTranslation, type TranslationKey } from "@/lib/i18n";

interface StorageInfo {
	drafts: string;
	projects: string;
	recordings: string;
	exports: string;
}

interface CacheStats {
	totalBytes: number;
	entries: Array<{ id: string; path: string; bytes: number }>;
}

const LOCATION_LABEL_KEYS: Array<{
	key: keyof StorageInfo;
	labelKey: TranslationKey;
}> = [
	{ key: "drafts", labelKey: "settings.location.drafts" },
	{ key: "projects", labelKey: "settings.location.projects" },
	{ key: "recordings", labelKey: "settings.location.recordings" },
	{ key: "exports", labelKey: "settings.location.exports" },
];

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Storage locations (read-only, with reveal-in-Finder) plus aggregate
 * cache size and one-click cleanup. Desktop-only — the required IPC is
 * absent in the browser build, so the section explains that instead.
 */
export function DraftsStorageSection() {
	const { t } = useTranslation();
	const maintenance = window.electronAPI?.appMaintenance;
	const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
	const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		if (!maintenance) return;
		try {
			const [info, stats] = await Promise.all([
				maintenance.getStorageInfo(),
				maintenance.getCacheStats(),
			]);
			setStorageInfo(info);
			setCacheStats(stats);
		} catch {
			// IPC unavailable (e.g. stale preload) — leave the section empty.
		}
	}, [maintenance]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	if (!maintenance) {
		return (
			<p className="text-sm text-muted-foreground">
				{t("settings.desktopOnly")}
			</p>
		);
	}

	const handleClearCaches = async () => {
		setBusy(true);
		try {
			const result = await maintenance.clearCaches();
			toast.success(
				t("settings.cacheCleared", { size: formatBytes(result.freedBytes) })
			);
			await refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<h3 className="text-sm font-medium">
					{t("settings.storageLocations")}
				</h3>
				{LOCATION_LABEL_KEYS.map(({ key, labelKey }) => (
					<div
						key={key}
						className="flex items-center justify-between gap-3"
						data-testid={`storage-location-${key}`}
					>
						<div className="min-w-0">
							<p className="text-xs text-muted-foreground">{t(labelKey)}</p>
							<p className="truncate text-xs" title={storageInfo?.[key]}>
								{storageInfo?.[key] ?? t("settings.calculating")}
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="shrink-0"
							disabled={!storageInfo}
							onClick={() => {
								const target = storageInfo?.[key];
								if (target) {
									void window.electronAPI?.shell?.showItemInFolder(target);
								}
							}}
						>
							<FolderOpen className="mr-1 h-3.5 w-3.5" />
							{t("settings.openFolder")}
						</Button>
					</div>
				))}
			</section>

			<section className="space-y-3">
				<h3 className="text-sm font-medium">{t("settings.cache")}</h3>
				<div className="flex items-center justify-between gap-3">
					<div>
						<p className="text-xs text-muted-foreground">
							{t("settings.cacheSize")}
						</p>
						<p className="text-sm" data-testid="cache-total-size">
							{cacheStats
								? formatBytes(cacheStats.totalBytes)
								: t("settings.calculating")}
						</p>
					</div>
					<div className="flex shrink-0 gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={busy}
							onClick={() => void refresh()}
						>
							<RefreshCw className="mr-1 h-3.5 w-3.5" />
							{t("settings.refresh")}
						</Button>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							disabled={busy || !cacheStats || cacheStats.totalBytes === 0}
							data-testid="clear-cache-button"
							onClick={() => void handleClearCaches()}
						>
							<Trash2 className="mr-1 h-3.5 w-3.5" />
							{t("settings.clearCache")}
						</Button>
					</div>
				</div>
			</section>
		</div>
	);
}
