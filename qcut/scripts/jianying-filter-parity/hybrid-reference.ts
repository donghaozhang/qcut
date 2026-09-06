import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJianyingFilterLocalRenderSession } from "../../electron/jianying-filter-local-runtime/render.js";
import type { JianyingFilterLocalRuntimeInspection } from "../../electron/jianying-filter-local-runtime/runtime-discovery.js";
import { independentGraphPackageRoot } from "../../electron/qcut-independent-filter/graph-data.js";
import type { IndependentGraphProfile } from "../../electron/qcut-independent-filter/graph-profiles.js";

export function bootstrapHybridIntensity({
	source,
	intensity,
}: {
	source: string;
	intensity: number;
}) {
	if (!Number.isFinite(intensity) || intensity < 0 || intensity > 100)
		throw new Error("Invalid reference intensity.");
	const anchor = "return exports";
	if (
		source.split(anchor).length !== 2 ||
		!source.includes("function SeekModeScript:onEvent") ||
		!source.includes("function SeekModeScript:onStart")
	)
		throw new Error("Unknown native intensity event script.");
	const literal = String(intensity / 100);
	// Exercise the package's event handler; do not duplicate its per-pass multipliers.
	const bootstrap = `local originalStart = SeekModeScript.onStart
function SeekModeScript:onStart(...)
    originalStart(self, ...)
    self:onEvent(nil, {args = {get = function(_, index)
        if index == 0 then return "intensity" end
        return ${literal}
    end}})
end
`;
	return source.replace(anchor, bootstrap + anchor);
}

export async function createHybridNativeReference({
	profile,
	runtime,
	width,
	height,
	bootstrapRgba,
	intensity,
}: {
	profile: IndependentGraphProfile;
	runtime: JianyingFilterLocalRuntimeInspection;
	width: number;
	height: number;
	bootstrapRgba: Uint8Array;
	intensity: number;
}) {
	if (!Number.isFinite(intensity) || intensity <= 0 || intensity > 100)
		throw new Error("Reference requires intensity in (0, 100].");
	const root = await independentGraphPackageRoot({ profile });
	let temporary: string | undefined;
	let packagePath = root;
	const eventDriven = Boolean(profile.dualLut?.sharpen);
	try {
		if (eventDriven) {
			temporary = await mkdtemp(join(tmpdir(), "qcut-hybrid-reference-"));
			packagePath = join(temporary, profile.version);
			await cp(root, packagePath, { recursive: true, errorOnExist: true });
			const script = join(packagePath, "AmazingFeature/lua/SeekModeScript.lua");
			await writeFile(
				script,
				bootstrapHybridIntensity({
					source: await readFile(script, "utf8"),
					intensity,
				})
			);
		}
		const session = await createJianyingFilterLocalRenderSession({
			resourceId: profile.resourceId,
			packagePath,
			runtime,
			width,
			height,
			bootstrapRgba,
			mode: "portrait",
		});
		return {
			intensityMode: eventDriven ? "native-event" : "linear-output",
			async render({
				rgba,
				timestampSeconds,
			}: {
				rgba: Uint8Array;
				timestampSeconds: number;
			}) {
				const result = await session.render({ rgba, timestampSeconds });
				if (eventDriven || intensity === 100) return result;
				const blended = Uint8Array.from(result.rgba, (value, i) =>
					i % 4 === 3
						? rgba[i]
						: Math.round(rgba[i] + ((value - rgba[i]) * intensity) / 100)
				);
				return { ...result, rgba: blended };
			},
			async dispose() {
				try {
					await session.dispose();
				} finally {
					if (temporary) await rm(temporary, { recursive: true, force: true });
				}
			},
		};
	} catch (error) {
		if (temporary) await rm(temporary, { recursive: true, force: true });
		throw error;
	}
}
