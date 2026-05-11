/**
 * Model-to-provider logo mapping.
 * Maps model ID prefixes to their provider logo SVG path.
 */

type ProviderInfo = {
	name: string;
	logo: string;
};

const PROVIDER_MAP: Record<string, ProviderInfo> = {
	sora: { name: "OpenAI", logo: "/model-logos/openai.svg" },
	kling: { name: "Kling AI", logo: "/model-logos/kling.svg" },
	veo: { name: "Google", logo: "/model-logos/google.svg" },
	wan: { name: "WAN AI", logo: "/model-logos/wan.svg" },
	ltx: { name: "Lightricks", logo: "/model-logos/lightricks.svg" },
	hailuo: { name: "MiniMax", logo: "/model-logos/minimax.svg" },
	seedance: { name: "ByteDance", logo: "/model-logos/bytedance.svg" },
	seeddream: { name: "ByteDance", logo: "/model-logos/bytedance.svg" },
	vidu: { name: "Vidu", logo: "/model-logos/vidu.svg" },
	flux: { name: "Black Forest Labs", logo: "/model-logos/flux.svg" },
	qwen: { name: "Alibaba", logo: "/model-logos/qwen.svg" },
	reve: { name: "Reve", logo: "/model-logos/reve.svg" },
	"z-image": { name: "Tongyi-MAI", logo: "/model-logos/tongyi.svg" },
	imagen: { name: "Google", logo: "/model-logos/google.svg" },
	gemini: { name: "Google", logo: "/model-logos/google.svg" },
	nano: { name: "Google", logo: "/model-logos/google.svg" },
	gpt: { name: "OpenAI", logo: "/model-logos/openai.svg" },
	sync: { name: "Sync Labs", logo: "/model-logos/sync.svg" },
	crystal: { name: "fal.ai", logo: "/model-logos/fal.svg" },
	seedvr: { name: "ByteDance", logo: "/model-logos/bytedance.svg" },
	topaz: { name: "Topaz Labs", logo: "/model-logos/topaz.svg" },
	phota: { name: "Photalabs", logo: "/model-logos/phota.svg" },
	runway: { name: "Runway", logo: "/model-logos/runway.svg" },
	skyreels: { name: "SkyReels", logo: "/model-logos/skyreels.svg" },
};

// Pre-sorted keys by length (longest first) for prefix matching
const SORTED_KEYS = Object.keys(PROVIDER_MAP).sort(
	(a, b) => b.length - a.length
);

// Routing prefixes identify the backend (e.g. GMI Cloud, IMA Router), not the
// underlying model family. Strip them so `gmi_veo31_lite_t2v` and
// `imarouter_seedance_2_0_t2v` resolve to their respective family logo
// (Google / ByteDance) rather than falling through to undefined.
const ROUTING_PREFIXES = ["gmi_", "imarouter_"];

export function getProviderForModel(modelId: string): ProviderInfo | undefined {
	const candidates = [modelId];
	for (const routingPrefix of ROUTING_PREFIXES) {
		if (modelId.startsWith(routingPrefix)) {
			candidates.push(modelId.slice(routingPrefix.length));
		}
	}
	for (const candidate of candidates) {
		for (const prefix of SORTED_KEYS) {
			if (candidate.startsWith(prefix)) {
				return PROVIDER_MAP[prefix];
			}
		}
	}
	return;
}

export function getProviderLogo(modelId: string): string | undefined {
	return getProviderForModel(modelId)?.logo;
}

export function getProviderName(modelId: string): string | undefined {
	return getProviderForModel(modelId)?.name;
}
