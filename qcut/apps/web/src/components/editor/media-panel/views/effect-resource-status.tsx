import {
	AlertCircle,
	Check,
	CloudDownload,
	Loader2,
	RefreshCw,
	WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EffectResourceState } from "@/lib/effects/effect-resource";

const STATUS_ICON = {
	ready: Check,
	download: CloudDownload,
	downloading: Loader2,
	update: RefreshCw,
	offline: WifiOff,
	failed: AlertCircle,
} as const;

export function EffectResourceStatus({
	labels,
	onActivate,
	state,
}: {
	labels: Readonly<Record<EffectResourceState["status"], string>>;
	onActivate: () => void;
	state: EffectResourceState;
}) {
	if (state.dependencyCount === 0 && state.status === "ready") return null;
	const Icon = STATUS_ICON[state.status];
	const interactive = ["download", "update", "failed"].includes(state.status);
	const className = cn(
		"absolute right-1.5 top-1.5 z-30 flex size-6 items-center justify-center rounded bg-black/70 text-white shadow-sm",
		interactive &&
			"hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
		state.status === "failed" && "text-red-300",
		state.status === "update" && "text-amber-300",
		state.status === "ready" && "text-emerald-300"
	);
	const icon = (
		<Icon
			className={cn(
				"size-3.5",
				state.status === "downloading" && "animate-spin"
			)}
			aria-hidden="true"
		>
			<title>{labels[state.status]}</title>
		</Icon>
	);

	if (!interactive) {
		return (
			<span
				className={className}
				title={labels[state.status]}
				data-effect-resource-status={state.status}
				data-effect-resource-progress={state.progress}
			>
				{icon}
			</span>
		);
	}
	return (
		<button
			type="button"
			className={className}
			aria-label={labels[state.status]}
			title={labels[state.status]}
			data-effect-resource-status={state.status}
			data-effect-resource-progress={state.progress}
			onClick={(event) => {
				event.stopPropagation();
				onActivate();
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") event.currentTarget.blur();
			}}
		>
			{icon}
		</button>
	);
}
