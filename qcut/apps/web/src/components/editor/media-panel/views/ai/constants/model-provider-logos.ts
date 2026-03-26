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
};

// Pre-sorted keys by length (longest first) for prefix matching
const SORTED_KEYS = Object.keys(PROVIDER_MAP).sort(
	(a, b) => b.length - a.length
);

export function getProviderForModel(modelId: string): ProviderInfo | undefined {
	for (const prefix of SORTED_KEYS) {
		if (modelId.startsWith(prefix)) {
			return PROVIDER_MAP[prefix];
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
