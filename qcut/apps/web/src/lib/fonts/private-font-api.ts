import type {
	JianyingFontLabAPI,
	JianyingFontLabInspectResult,
	JianyingFontLabLoadResult,
} from "../../../../../electron/jianying-font-lab-contract";

async function requestFont({
	request,
}: {
	request: { fontId: string; text?: string };
}) {
	const response = await fetch("/__qcut/private-covers/font", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(request),
		cache: "no-store",
	});
	if (!response.ok)
		throw new Error("Private font unavailable or failed integrity validation");
	return response.json();
}

const developmentAPI: Pick<JianyingFontLabAPI, "load" | "inspect"> = {
	load: async (request) => {
		const result = (await requestFont({
			request,
		})) as JianyingFontLabLoadResult;
		if (
			!result.font ||
			result.font.fontId !== request.fontId ||
			!Array.isArray(result.bytes) ||
			!result.bytes.length ||
			result.bytes.length > 128 * 1024 * 1024 ||
			result.bytes.some(
				(byte) => !Number.isInteger(byte) || byte < 0 || byte > 255
			)
		)
			throw new Error("Invalid private font response");
		return { ...result, bytes: new Uint8Array(result.bytes) };
	},
	inspect: async (request) => {
		const result = (await requestFont({
			request,
		})) as JianyingFontLabInspectResult;
		if (
			result.fontId !== request.fontId ||
			typeof result.covered !== "boolean" ||
			!Array.isArray(result.missing)
		)
			throw new Error("Invalid private font coverage");
		return result;
	},
};

export function privateFontAPI():
	| Pick<JianyingFontLabAPI, "load" | "inspect">
	| undefined {
	return (
		window.electronAPI?.jianyingFontLab ??
		(import.meta.env.DEV ? developmentAPI : undefined)
	);
}
