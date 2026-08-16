import { resolveJianyingTransitionBridge } from "../jianying-transition/bridge-resolver.js";
import { inspectJianyingTransitionRuntime } from "../jianying-transition/runtime-discovery.js";
import type {
	JianyingEffectDefinition,
	JianyingEffectRuntimeState,
	JianyingEffectRuntimeStatus,
} from "../jianying-effect-contract.js";
import { discoverJianyingEffectLibrary } from "./catalog.js";

export interface JianyingEffectRuntimeInspection {
	status: JianyingEffectRuntimeStatus;
	appBundlePath: string | null;
	runtimeRootPath: string | null;
	bridgePath: string | null;
	effects: JianyingEffectDefinition[];
}

function describe({
	state,
	availableCount,
}: {
	state: JianyingEffectRuntimeState;
	availableCount: number;
}): string {
	switch (state) {
		case "ready":
			return `已发现 ${availableCount} 个可用的本机剪映特效。`;
		case "unsupported-platform":
			return "本机剪映特效仅支持 macOS。";
		case "app-missing":
			return "未检测到剪映专业版，无法使用本机特效渲染。";
		case "bridge-missing":
			return "剪映运行时桥接未编译，无法渲染本机特效。";
		case "runtime-incompatible":
			return "本机剪映版本与已验证的运行时不一致。";
		case "packages-missing":
			return "尚未发现任何特效目录：请在剪映中打开一次特效面板后重试。";
		default:
			return "读取本机剪映特效时出错。";
	}
}

/**
 * Effects reuse the transition runtime: same libraries, same bridge binary,
 * same private-runtime discovery. Only the catalog differs, so this defers the
 * hard parts and layers the effect inventory on top.
 */
export async function inspectJianyingEffectRuntime(): Promise<JianyingEffectRuntimeInspection> {
	const transitionInspection = await inspectJianyingTransitionRuntime();
	const { appBundlePath, runtimeRootPath } = transitionInspection;
	// A bridge built before the effect modes existed would fail every render, so
	// discovery insists on one that advertises effect-video.
	const bridgePath =
		process.platform === "darwin"
			? await resolveJianyingTransitionBridge({
					requiredMode: "effect-video",
				}).catch(() => null)
			: null;

	const { effects, categories } =
		transitionInspection.status.state === "unsupported-platform"
			? { effects: [], categories: [] }
			: await discoverJianyingEffectLibrary();
	// "Available" = renderable right now; downloadable-only entries still count
	// toward readiness because one click installs them.
	const availableCount = effects.filter(
		(effect) => effect.supported && effect.installed
	).length;

	const state: JianyingEffectRuntimeState = (() => {
		if (transitionInspection.status.state === "unsupported-platform") {
			return "unsupported-platform";
		}
		if (!bridgePath) return "bridge-missing";
		if (!runtimeRootPath) return "app-missing";
		if (transitionInspection.status.state === "runtime-incompatible") {
			return "runtime-incompatible";
		}
		return effects.length > 0 ? "ready" : "packages-missing";
	})();

	return {
		status: {
			state,
			platform: transitionInspection.status.platform,
			bridgeReady: Boolean(bridgePath),
			availableCount,
			effects,
			categories,
			message: describe({ state, availableCount }),
		},
		appBundlePath,
		runtimeRootPath,
		bridgePath,
		effects,
	};
}
