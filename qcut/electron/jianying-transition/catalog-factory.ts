import { LEGACY_TRANSITION_OVERRIDES } from "./catalog-legacy-overrides.js";
import type {
	JianyingTransitionDefinition,
	JianyingTransitionGroup,
	JianyingTransitionPreview,
	JianyingTransitionRuntimeKind,
	JianyingTransitionSource,
} from "./catalog-types.js";

interface CategoryDefaults {
	family: string;
	preview: JianyingTransitionPreview;
	runtimeKind: JianyingTransitionRuntimeKind;
}

const CATEGORY_DEFAULTS: Readonly<
	Record<JianyingTransitionGroup, CategoryDefaults>
> = {
	"ai-one-take": {
		family: "ai-generation-config",
		runtimeKind: "ai-generation",
		preview: { type: "zoom", clipType: "zoom-in-blur" },
	},
	dissolve: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: { type: "dissolve", clipType: "dissolve" },
	},
	split: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "triptych",
		},
	},
	glitch: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: { type: "glitch", clipType: "rgb-glitch" },
	},
	light: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: { type: "light", clipType: "flash" },
	},
	emoji: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "heart",
		},
	},
	slideshow: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: { type: "slide", clipType: "slide", direction: "left" },
	},
	blur: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: { type: "motion-blur", clipType: "zoom-blur" },
	},
	distortion: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: { type: "ripple", clipType: "vortex" },
	},
	shooting: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: { type: "flash", clipType: "flash" },
	},
	camera: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: { type: "zoom", clipType: "zoom-in-blur" },
	},
	natural: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "fog",
		},
	},
	variety: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: {
			type: "texture",
			clipType: "texture-mask",
			maskShape: "ink",
		},
	},
	mg: {
		family: "catalog-package",
		runtimeKind: "transition-segment",
		preview: { type: "wipe", clipType: "wipe", direction: "right" },
	},
};

function createDefinition({
	group,
	source,
}: {
	group: JianyingTransitionGroup;
	source: JianyingTransitionSource;
}): JianyingTransitionDefinition {
	const defaults = CATEGORY_DEFAULTS[group];
	const override = LEGACY_TRANSITION_OVERRIDES[source.resourceId];
	return {
		id: override?.id ?? `jianying-local-${source.resourceId}`,
		name: override?.name ?? source.localizedName,
		localizedName: source.localizedName,
		resourceId: source.resourceId,
		metadataMd5: source.metadataMd5,
		defaultDuration: source.defaultDuration,
		overlap: source.overlap,
		group,
		family: override?.family ?? defaults.family,
		runtimeKind: defaults.runtimeKind,
		access: source.access,
		preview: override?.preview ?? defaults.preview,
	};
}

export function defineJianyingCategory({
	group,
	sources,
}: {
	group: JianyingTransitionGroup;
	sources: readonly JianyingTransitionSource[];
}): readonly JianyingTransitionDefinition[] {
	return sources.map((source) => createDefinition({ group, source }));
}
