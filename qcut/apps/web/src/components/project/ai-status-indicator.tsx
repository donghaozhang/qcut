import { Badge } from "@/components/ui/badge";

export function AiStatusIndicator() {
	return (
		<Badge
			variant="outline"
			className="gap-1.5 text-xs font-normal py-0.5 px-2"
		>
			<span className="relative flex h-2 w-2">
				<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
				<span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
			</span>
			AI Ready
		</Badge>
	);
}
