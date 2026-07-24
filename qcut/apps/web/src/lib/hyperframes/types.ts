import type {
	HyperframesVariableDefinition,
	HyperframesVariableValue,
} from "@/types/timeline";

export interface HyperframesComposition {
	id: string;
	name: string;
	sourcePath: string;
	projectPath: string;
	duration: number;
	durationIsEstimated: boolean;
	width: number;
	height: number;
	fps: number;
	variables: HyperframesVariableDefinition[];
	defaultVariableValues: Record<string, HyperframesVariableValue>;
	warnings: string[];
}

export interface HyperframesImportResult {
	composition: HyperframesComposition;
	html: string;
}

export class HyperframesParseError extends Error {
	readonly issues: string[];

	constructor({ issues }: { issues: string[] }) {
		super(issues.join("\n") || "Invalid HyperFrames composition");
		this.name = "HyperframesParseError";
		this.issues = issues;
	}
}
