import { createHash } from "node:crypto";

export async function renderStableGraphReference({
	render,
}: {
	render: () => Promise<Uint8Array>;
}) {
	const hashes: string[] = [];
	let consecutive = 0;
	const sample = async (): Promise<{
		rgba: Uint8Array;
		hashes: string[];
	}> => {
		const rgba = await render();
		if (!rgba.length) throw new Error("Empty native reference frame.");
		const hash = createHash("sha256").update(rgba).digest("hex");
		consecutive = hashes.at(-1) === hash ? consecutive + 1 : 1;
		hashes.push(hash);
		// Static graphs at one timestamp must settle independently of QCut's pixels.
		if (consecutive === 3) return { rgba, hashes };
		if (hashes.length === 6)
			throw new Error(
				`Native reference did not stabilize: ${hashes.join(",")}`
			);
		return sample();
	};
	return sample();
}
