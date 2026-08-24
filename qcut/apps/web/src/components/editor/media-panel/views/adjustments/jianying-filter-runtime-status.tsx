import { useEffect, useState } from "react";
import {
	DatabaseBackup,
	HardDrive,
	LoaderCircle,
	ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JianyingFilterLocalRuntimeStatus } from "@/types/electron";

function runtimeLabel({
	status,
}: {
	status: JianyingFilterLocalRuntimeStatus | null;
}) {
	if (!status) return "检查本机运行时";
	if (status.offlineReady) return "QCut 离线运行已就绪";
	if (status.snapshotReady) return "QCut 备份需要刷新";
	if (status.state === "ready") return "当前使用剪映本机资源";
	return status.message;
}

function formatBytes({ bytes }: { bytes: number }) {
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function JianyingFilterRuntimeStatus() {
	const [status, setStatus] = useState<JianyingFilterLocalRuntimeStatus | null>(
		null
	);
	const [checking, setChecking] = useState(true);
	const [backingUp, setBackingUp] = useState(false);

	useEffect(() => {
		let active = true;
		const api = window.electronAPI?.jianyingFilterLab;
		// A bridge without this method must not throw out of the effect and take
		// the panel down with it — same guard the lab view uses before calling it.
		if (typeof api?.inspectLocalRuntime !== "function") {
			setChecking(false);
			return;
		}
		void api
			.inspectLocalRuntime()
			.then((result) => {
				if (active) setStatus(result);
			})
			.catch(() => undefined)
			.finally(() => {
				if (active) setChecking(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const backup = async () => {
		const api = window.electronAPI?.jianyingFilterLab;
		if (!api) return;
		setBackingUp(true);
		try {
			const result = await api.backupLocalRuntime();
			setStatus(result.status);
			toast.success(
				`本机滤镜备份${result.created ? "已创建" : "已校验"}：${result.packageCount} 个效果包，${formatBytes({ bytes: result.totalBytes })}`
			);
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "无法备份本机滤镜运行时"
			);
		} finally {
			setBackingUp(false);
		}
	};

	const ready = status?.state === "ready";
	const StatusIcon = status?.offlineReady ? ShieldCheck : HardDrive;
	return (
		<div
			className="flex h-8 min-w-0 items-center gap-2 border-y border-border/50 px-1 text-[10px]"
			data-testid="jianying-filter-runtime-status"
			title={status?.message}
		>
			{checking ? (
				<LoaderCircle
					className="size-3 shrink-0 animate-spin text-muted-foreground"
					aria-hidden="true"
				/>
			) : (
				<StatusIcon
					className={cn(
						"size-3 shrink-0",
						status?.offlineReady ? "text-emerald-500" : "text-muted-foreground"
					)}
					aria-hidden="true"
				/>
			)}
			<span className="min-w-0 flex-1 truncate" aria-live="polite">
				{runtimeLabel({ status })}
			</span>
			<Button
				type="button"
				variant="text"
				size="icon"
				className="size-6 shrink-0"
				disabled={!ready || backingUp}
				title={
					status?.snapshotReady ? "刷新 QCut 本机备份" : "创建 QCut 本机备份"
				}
				aria-label={
					status?.snapshotReady ? "刷新 QCut 本机备份" : "创建 QCut 本机备份"
				}
				onClick={() => void backup()}
				onKeyDown={(event) => {
					if (event.key === "Escape") event.currentTarget.blur();
				}}
			>
				{backingUp ? (
					<LoaderCircle className="size-3 animate-spin" />
				) : (
					<DatabaseBackup className="size-3" />
				)}
			</Button>
		</div>
	);
}
