import {
	Check,
	Cloud,
	CloudOff,
	LoaderCircle,
	RefreshCw,
	TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUserLibrarySyncStore } from "@/stores/user-library-sync-store";

function statusLabel({
	status,
	error,
}: {
	status: ReturnType<typeof useUserLibrarySyncStore.getState>["status"];
	error: string | null;
}): string {
	if (status === "syncing") return "正在同步模板和预设";
	if (status === "synced") return "模板和预设已同步";
	if (status === "offline") return "离线：恢复网络后自动同步";
	if (status === "signed-out") return "登录后同步模板和预设";
	if (status === "error") return error ?? "同步失败，点击重试";
	return "同步模板和预设";
}

function StatusIcon({
	status,
}: {
	status: ReturnType<typeof useUserLibrarySyncStore.getState>["status"];
}) {
	if (status === "syncing") {
		return (
			<LoaderCircle className="size-3.5 animate-spin">
				<title>Syncing user library</title>
			</LoaderCircle>
		);
	}
	if (status === "synced") {
		return (
			<span className="relative">
				<Cloud className="size-4" />
				<Check className="absolute -bottom-1 -right-1 size-2.5 rounded-full bg-background text-emerald-500" />
			</span>
		);
	}
	if (status === "offline" || status === "signed-out") {
		return (
			<CloudOff className="size-4">
				<title>Cloud library unavailable</title>
			</CloudOff>
		);
	}
	if (status === "error") {
		return (
			<TriangleAlert className="size-4 text-amber-500">
				<title>Cloud library sync failed</title>
			</TriangleAlert>
		);
	}
	return (
		<RefreshCw className="size-4">
			<title>Sync user library</title>
		</RefreshCw>
	);
}

export function UserLibrarySyncControl() {
	const status = useUserLibrarySyncStore((state) => state.status);
	const error = useUserLibrarySyncStore((state) => state.error);
	const sync = useUserLibrarySyncStore((state) => state.sync);
	const label = statusLabel({ status, error });

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-7"
					aria-label={label}
					title={label}
					disabled={status === "syncing"}
					onClick={() => void sync()}
					onKeyDown={() => undefined}
					data-testid="user-library-sync"
				>
					<StatusIcon status={status} />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
