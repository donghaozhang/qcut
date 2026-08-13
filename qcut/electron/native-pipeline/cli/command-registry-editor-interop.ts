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
	"editor:interop:jianying-export": {
		name: "editor:interop:jianying-export",
		description:
			"Write supported edits from a persisted QCut project into a registered Jianying Professional project",
		category: "editor",
		flags: [
			flag("--project-id", "string", "Persisted QCut project ID", {
				required: true,
			}),
			flag("--format", "string", "Draft target format", {
				default: "jianying",
				enum: ["jianying"],
			}),
		],
		examples: ["qcut draft export --format jianying --project-id <id> --json"],
	},
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
	"editor:interop:writeback": {
		name: "editor:interop:writeback",
		description:
			"Write supported QCut timing edits back to an exact imported draft",
		category: "editor",
		flags: [
			flag("--project-id", "string", "Persisted QCut project ID", {
				required: true,
			}),
		],
		examples: ["qcut editor interop writeback --project-id <id> --json"],
	},
	"editor:interop:writeback-recover": {
		name: "editor:interop:writeback-recover",
		description: "Recover an interrupted same-profile draft writeback",
		category: "editor",
		flags: [
			flag(
				"--recovery-token",
				"string",
				"Opaque recovery token returned by a failed writeback",
				{ required: true }
			),
		],
		examples: [
			"qcut editor interop writeback-recover --recovery-token <token> --json",
		],
	},
};
