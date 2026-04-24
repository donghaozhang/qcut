import { KEY_SOURCE_PRECEDENCE, type KeySource } from "@qcut/platform-core";

export const PRECEDENCE_BADGE_LABELS: Record<KeySource, string> = {
	environment: "env",
	electron: "app",
	file: "file",
};

export const PRECEDENCE_ONE_LINERS: Record<KeySource, string> = {
	environment: "Set in your shell or `.env` - highest priority.",
	electron: "Saved on this page via Save API Keys.",
	file: "Stored in `~/.qcut/.env` (the QCut native CLI credential file).",
};

export const PRECEDENCE_TIERS = KEY_SOURCE_PRECEDENCE.map((source, index) => ({
	source,
	rank: index + 1,
	label: PRECEDENCE_BADGE_LABELS[source],
	description: PRECEDENCE_ONE_LINERS[source],
}));
