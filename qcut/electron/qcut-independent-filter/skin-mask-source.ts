import { createHash } from "node:crypto";
import {
	createJianyingFilterLocalRenderSession,
	type JianyingFilterLocalRenderSession,
} from "../jianying-filter-local-runtime/render.js";
import { inspectJianyingFilterLocalRuntime } from "../jianying-filter-local-runtime/runtime-discovery.js";
import type { IndependentFilterRequest } from "./contract.js";
import { independentGraphPackageRoot } from "./graph-data.js";
import type { IndependentGraphProfile } from "./graph-profiles.js";

export interface SkinMaskFrame {
	width: number;
	height: number;
	bytes: Uint8Array;
	orientation: "bottom-left" | "top-left";
}

export interface SkinMaskSource {
	render: (request: IndependentFilterRequest) => Promise<SkinMaskFrame>;
	dispose: () => Promise<void>;
}

export function encodeSkinMask({ mask }: { mask: SkinMaskFrame }) {
	if (
		!Number.isInteger(mask.width) ||
		!Number.isInteger(mask.height) ||
		mask.width < 1 ||
		mask.height < 1 ||
		mask.width > 2048 ||
		mask.height > 2048 ||
		!(mask.bytes instanceof Uint8Array) ||
		mask.bytes.length !== mask.width * mask.height ||
		!["bottom-left", "top-left"].includes(mask.orientation)
	)
		throw new Error(
			"Invalid local skin mask. Rendering cannot substitute a heuristic."
		);
	const header = Buffer.alloc(8);
	header.writeUInt32LE(mask.width, 0);
	header.writeUInt32LE(mask.height, 4);
	const pixels = Buffer.from(mask.bytes);
	if (mask.orientation === "top-left") {
		for (let y = 0; y < mask.height; y++)
			pixels.set(
				mask.bytes.subarray(y * mask.width, (y + 1) * mask.width),
				(mask.height - 1 - y) * mask.width
			);
	}
	return Buffer.concat([header, pixels]);
}

export function createLocalSkinMaskSource({
	profile,
	createSession = createJianyingFilterLocalRenderSession,
	inspectRuntime = inspectJianyingFilterLocalRuntime,
	resolvePackage = independentGraphPackageRoot,
}: {
	profile: IndependentGraphProfile;
	createSession?: typeof createJianyingFilterLocalRenderSession;
	inspectRuntime?: typeof inspectJianyingFilterLocalRuntime;
	resolvePackage?: typeof independentGraphPackageRoot;
}): SkinMaskSource {
	let session: JianyingFilterLocalRenderSession | undefined;
	let previous:
		| { key: string; time: number; hash: string; mask: SkinMaskFrame }
		| undefined;
	let disposed = false;
	const release = async () => {
		const old = session;
		session = undefined;
		previous = undefined;
		await old?.dispose();
	};
	return {
		async render(request) {
			if (disposed) throw new Error("Skin mask source is disposed.");
			const {
				width,
				height,
				rgba,
				sourceKey = "",
				timestampSeconds = 0,
			} = request;
			const key = `${width}x${height}\0${sourceKey}`;
			const hash = createHash("sha256").update(rgba).digest("hex");
			if (
				previous &&
				previous.key === key &&
				previous.time === timestampSeconds &&
				previous.hash === hash
			)
				return { ...previous.mask, bytes: new Uint8Array(previous.mask.bytes) };
			const discontinuity =
				previous &&
				(previous.key !== key ||
					timestampSeconds < previous.time ||
					(timestampSeconds === previous.time && hash !== previous.hash));
			if (discontinuity) await release();
			try {
				if (!session) {
					const [runtime, packagePath] = await Promise.all([
						inspectRuntime(),
						resolvePackage({ profile }),
					]);
					session = await createSession({
						resourceId: profile.resourceId,
						packagePath,
						width,
						height,
						bootstrapRgba: rgba,
						runtime,
						mode: "portrait",
					});
				}
				// The retained SDK still initializes the package. Only its mask crosses into our renderer.
				const result = await session.render({ rgba, timestampSeconds });
				if (!result.mask) throw new Error("Local model returned no skin mask.");
				encodeSkinMask({ mask: result.mask });
				const mask = {
					...result.mask,
					bytes: new Uint8Array(result.mask.bytes),
				};
				previous = { key, time: timestampSeconds, hash, mask };
				return { ...mask, bytes: new Uint8Array(mask.bytes) };
			} catch (error) {
				await release().catch(() => {});
				throw error;
			}
		},
		async dispose() {
			disposed = true;
			await release();
		},
	};
}
