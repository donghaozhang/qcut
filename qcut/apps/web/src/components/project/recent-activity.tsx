import { useMemo } from "react";
import { Film, Pencil, Sparkles } from "lucide-react";
import { useExportStore } from "@/stores/export-store";
import { useText2ImageStore } from "@/stores/ai/text2image-store";
import type { TProject } from "@/types/project";

function formatRelativeTime(date: Date): string {
	const now = Date.now();
	const diff = now - date.getTime();
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 60) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days === 1) return "yesterday";
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

interface RecentActivityProps {
	projects: TProject[];
}

export function RecentActivity({ projects }: RecentActivityProps) {
	const exportHistory = useExportStore((s) => s.exportHistory);
	const generationHistory = useText2ImageStore((s) => s.generationHistory);

	const items = useMemo(() => {
		const result: Array<{
			icon: React.ElementType;
			text: string;
			key: string;
		}> = [];

		// Last render
		const lastExport = exportHistory.find((e) => e.success);
		if (lastExport) {
			result.push({
				icon: Film,
				text: `Last render: ${formatRelativeTime(lastExport.timestamp)}`,
				key: "render",
			});
		}

		// AI generations today
		const today = new Date();
		const todayCount = generationHistory.filter((g) =>
			isSameDay(g.createdAt, today)
		).length;
		if (todayCount > 0) {
			result.push({
				icon: Sparkles,
				text: `${todayCount} AI generation${todayCount === 1 ? "" : "s"} today`,
				key: "ai",
			});
		} else if (generationHistory.length > 0) {
			result.push({
				icon: Sparkles,
				text: `Last generation: ${formatRelativeTime(generationHistory[0].createdAt)}`,
				key: "ai",
			});
		}

		// Last edited project
		if (projects.length > 0) {
			const sorted = [...projects].sort(
				(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
			);
			result.push({
				icon: Pencil,
				text: `Last edited: ${sorted[0].name}`,
				key: "edited",
			});
		}

		return result;
	}, [exportHistory, generationHistory, projects]);

	if (items.length === 0) {
		return (
			<div
				className="mt-8 text-xs text-muted-foreground text-center"
				data-testid="recent-activity"
			>
				No recent activity — create your first project to get started
			</div>
		);
	}

	return (
		<div
			className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
			data-testid="recent-activity"
		>
			<span className="relative flex h-2 w-2 mr-1">
				<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
				<span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
			</span>
			{items.map((item, i) => (
				<span key={item.key} className="flex items-center gap-1.5">
					{i > 0 && (
						<span className="text-border mr-2 hidden sm:inline">&middot;</span>
					)}
					<item.icon className="size-3 shrink-0" />
					{item.text}
				</span>
			))}
		</div>
	);
}
