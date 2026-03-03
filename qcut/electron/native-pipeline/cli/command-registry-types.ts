/**
 * Shared types for the command registry.
 *
 * Extracted to avoid circular imports between
 * command-registry.ts and command-registry-editor.ts.
 *
 * @module electron/native-pipeline/cli/command-registry-types
 */

export interface FlagDef {
	name: string;
	short?: string;
	type: "string" | "boolean" | "number" | "string[]";
	required?: boolean;
	default?: unknown;
	description: string;
	enum?: string[];
}

export interface CommandDef {
	name: string;
	description: string;
	category: string;
	flags: FlagDef[];
	examples: string[];
	usage?: string;
}

export interface CategoryDef {
	name: string;
	label: string;
	commands: string[];
}
