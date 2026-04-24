export const KEY_SOURCE_PRECEDENCE = [
	"environment",
	"electron",
	"aicp-cli",
	"qcut-env",
] as const;

export type KeySource = (typeof KEY_SOURCE_PRECEDENCE)[number];
export type KeyStatusSource = KeySource | "not-set";

export interface KeyPresence {
	env: boolean;
	electron: boolean;
	aicpCli: boolean;
	qcutEnv: boolean;
}

export interface KeyStatus {
	set: boolean;
	source: KeyStatusSource;
	shadowedBy: KeySource[];
}

export function computeKeyStatus({
	env,
	electron,
	aicpCli,
	qcutEnv,
}: KeyPresence): KeyStatus {
	const presenceBySource = {
		environment: env,
		electron,
		"aicp-cli": aicpCli,
		"qcut-env": qcutEnv,
	} satisfies Record<KeySource, boolean>;

	const source = KEY_SOURCE_PRECEDENCE.find(
		(keySource) => presenceBySource[keySource]
	);

	if (!source) {
		return { set: false, source: "not-set", shadowedBy: [] };
	}

	const sourceIndex = KEY_SOURCE_PRECEDENCE.indexOf(source);
	const shadowedBy = KEY_SOURCE_PRECEDENCE.slice(sourceIndex + 1).filter(
		(keySource) => presenceBySource[keySource]
	);

	return { set: true, source, shadowedBy };
}
