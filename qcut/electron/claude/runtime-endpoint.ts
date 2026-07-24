export const DEFAULT_QCUT_API_PORT = 8765;

export interface QCutRuntimeEndpoint {
	host: "127.0.0.1";
	port: number;
	baseUrl: string;
}

export function resolveQCutRuntimeEndpoint({
	env = process.env,
}: {
	env?: Record<string, string | undefined>;
} = {}): QCutRuntimeEndpoint {
	const configuredPort = Number(env.QCUT_API_PORT);
	const port =
		Number.isInteger(configuredPort) &&
		configuredPort > 0 &&
		configuredPort <= 65_535
			? configuredPort
			: DEFAULT_QCUT_API_PORT;
	const host = "127.0.0.1" as const;
	return {
		host,
		port,
		baseUrl: `http://${host}:${port}`,
	};
}
