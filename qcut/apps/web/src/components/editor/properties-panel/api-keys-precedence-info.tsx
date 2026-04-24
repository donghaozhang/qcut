import { PRECEDENCE_TIERS } from "./api-key-precedence";
import { PropertyGroup } from "./property-item";

export function ApiKeysPrecedenceInfo() {
	return (
		<PropertyGroup
			title="How API key resolution works"
			defaultExpanded={false}
			className="rounded-md border border-border/70 bg-panel-accent/40 p-3"
		>
			<div className="space-y-3">
				<ol className="space-y-2">
					{PRECEDENCE_TIERS.map(({ source, rank, label, description }) => (
						<li key={source} className="flex gap-2 text-xs">
							<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] text-muted-foreground">
								{rank}
							</span>
							<div className="space-y-0.5">
								<div className="font-mono font-medium text-foreground">
									{label}
								</div>
								<div className="text-muted-foreground">{description}</div>
							</div>
						</li>
					))}
				</ol>
				<div className="border-t border-border/70 pt-3 text-xs text-muted-foreground">
					The first tier with a value wins. Saving here writes to the{" "}
					<span className="font-mono text-foreground">app</span> tier only.
				</div>
			</div>
		</PropertyGroup>
	);
}
