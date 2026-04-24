import { KEY_SOURCE_PRECEDENCE, type KeySource } from "@qcut/platform-core";

export const PRECEDENCE_BADGE_LABELS: Record<KeySource, string> = {
	environment: "env",
	electron: "app",
	"aicp-cli": "cli",
	"qcut-env": "qcut-env",
};

export const PRECEDENCE_ONE_LINERS: Record<KeySource, string> = {
	environment: "Set in your shell or `.env` - highest priority.",
	electron: "Saved on this page via Save API Keys.",
	"aicp-cli":
		"Set by the `aicp` CLI (`~/.config/video-ai-studio/credentials.env`).",
	"qcut-env": "Set via the QCut native CLI (`~/.qcut/.env`).",
};

export const PRECEDENCE_TIERS = KEY_SOURCE_PRECEDENCE.map((source, index) => ({
	source,
	rank: index + 1,
	label: PRECEDENCE_BADGE_LABELS[source],
	description: PRECEDENCE_ONE_LINERS[source],
}));
