import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JianyingPortraitAdjustmentStatus } from "@/types/electron";
import { cn } from "@/lib/utils";

export function PortraitRuntimeStatus({
	status,
	loading,
	locale,
	onRefresh,
}: {
	status: JianyingPortraitAdjustmentStatus | null;
	loading: boolean;
	locale: string;
	onRefresh: () => void;
}) {
	const ready = status?.available === true;
	return (
		<div
			className="flex items-center justify-between gap-2 border-b pb-3"
			data-testid="jianying-portrait-runtime-status"
		>
			<div className="min-w-0">
				<div className="flex items-center gap-2 text-xs">
					<span
						className={cn(
							"size-1.5 rounded-full",
							ready ? "bg-emerald-500" : "bg-muted-foreground"
						)}
					/>
					<span>
						{locale === "zh" ? "剪映本机二进制" : "Jianying local binary"}
					</span>
					{status?.offlineReady ? (
						<span className="text-[10px] text-emerald-600 dark:text-emerald-400">
							{locale === "zh" ? "离线就绪" : "Offline ready"}
						</span>
					) : null}
				</div>
				<p className="mt-1 truncate text-[10px] text-muted-foreground">
					{loading
						? locale === "zh"
							? "正在检查运行时..."
							: "Checking runtime..."
						: (status?.message ??
							(locale === "zh" ? "仅支持 macOS 桌面版" : "macOS desktop only"))}
				</p>
			</div>
			<Button
				type="button"
				variant="text"
				size="icon"
				className="size-7 shrink-0"
				onClick={onRefresh}
				onKeyDown={(event) => event.stopPropagation()}
				disabled={loading}
				aria-label={locale === "zh" ? "重新检查运行时" : "Refresh runtime"}
				title={locale === "zh" ? "重新检查运行时" : "Refresh runtime"}
			>
				<RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
			</Button>
		</div>
	);
}
