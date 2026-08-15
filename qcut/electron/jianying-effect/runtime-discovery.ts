import { inspectJianyingTransitionRuntime } from "../jianying-transition/runtime-discovery.js";
import type {
	JianyingEffectDefinition,
	JianyingEffectRuntimeState,
	JianyingEffectRuntimeStatus,
} from "../jianying-effect-contract.js";
import { discoverJianyingEffects } from "./catalog.js";

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
			return `已发现 ${availableCount} 个本机剪映特效。`;
		case "unsupported-platform":
			return "本机剪映特效仅支持 macOS。";
		case "app-missing":
			return "未检测到剪映专业版，无法使用本机特效渲染。";
		case "bridge-missing":
			return "剪映运行时桥接未编译，无法渲染本机特效。";
		case "runtime-incompatible":
			return "本机剪映版本与已验证的运行时不一致。";
		case "packages-missing":
			return "尚未缓存任何特效素材：请在剪映中使用一次目标特效后重试。";
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
	const { appBundlePath, runtimeRootPath, bridgePath } = transitionInspection;

	const effects =
		transitionInspection.status.state === "unsupported-platform"
			? []
			: await discoverJianyingEffects();
	const availableCount = effects.filter((effect) => effect.supported).length;

	const state: JianyingEffectRuntimeState = (() => {
		if (transitionInspection.status.state === "unsupported-platform") {
			return "unsupported-platform";
		}
		if (!bridgePath) return "bridge-missing";
		if (!runtimeRootPath) return "app-missing";
		if (transitionInspection.status.state === "runtime-incompatible") {
			return "runtime-incompatible";
		}
		return availableCount > 0 ? "ready" : "packages-missing";
	})();

	return {
		status: {
			state,
			platform: transitionInspection.status.platform,
			bridgeReady: Boolean(bridgePath),
			availableCount,
			effects,
			message: describe({ state, availableCount }),
		},
		appBundlePath,
		runtimeRootPath,
		bridgePath,
		effects,
	};
}
