import type { CommandDef, FlagDef } from "./command-registry-types.js";

function flag(
	name: string,
	type: FlagDef["type"],
	description: string,
	options?: Partial<FlagDef>
): FlagDef {
	return { name, type, description, ...options };
}

export const INTEROP_COMMANDS: Record<string, CommandDef> = {
	"editor:interop:import-snapshot": {
		name: "editor:interop:import-snapshot",
		description:
			"Capture trusted persisted QCut state for a completed draft import",
		category: "editor",
		flags: [
			flag("--project-id", "string", "Persisted QCut project ID", {
				required: true,
			}),
			flag(
				"--bundle-digest",
				"string",
				"Expected import bundle SHA-256 digest",
				{ required: true }
			),
			flag("--output", "string", "New JSON evidence file to create"),
		],
		examples: [
			"qcut editor interop import-snapshot --project-id <id> --bundle-digest <sha256> --output qcut-import-snapshot.json --json",
		],
	},
};
