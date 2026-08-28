import path from "node:path";
import { fileURLToPath } from "node:url";
import { signAsync } from "@electron/osx-sign";

const transitionEntitlements = fileURLToPath(
	new URL("../build/entitlements.transition-bridge.mac.plist", import.meta.url)
);

/**
 * @param {{ options: import('@electron/osx-sign').SignOptions }} input
 * @returns {import('@electron/osx-sign').SignOptions}
 */
export function withTransitionBridgeEntitlements({ options }) {
	const bridgePaths = new Set(
		[
			"jianying-transition-bridge",
			"jianying-person-cutout-bridge",
			"jianying-saliency-script-bridge",
			"jianying-video-object-bach-bridge",
		].map((fileName) =>
			path.resolve(options.app, "Contents/Resources/bin", fileName)
		)
	);
	return {
		...options,
		optionsForFile: (filePath) => {
			const original = options.optionsForFile?.(filePath) ?? {};
			if (!bridgePaths.has(path.resolve(filePath))) return original;
			return {
				...original,
				entitlements: transitionEntitlements,
				hardenedRuntime: true,
			};
		},
	};
}

/** @param {import('@electron/osx-sign').SignOptions} options */
export async function sign({ ...options }) {
	await signAsync(withTransitionBridgeEntitlements({ options }));
}
