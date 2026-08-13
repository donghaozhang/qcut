import type {
	JianyingTextEffectCapabilities,
	JianyingTextRuntimeDiagnostic,
} from "./jianying-text-runtime-contract.js";

export type JianyingEffectStyleRenderType =
	| "gradient"
	| "solid"
	| "texture"
	| "unknown";

export type JianyingEffectStyleLayerRole =
	| "component"
	| "fill"
	| "inner-shadow"
	| "shadow"
	| "stroke";

export type JianyingEffectStyleTextureState = "invalid" | "missing" | "ready";

export interface JianyingEffectStyleLayer {
	path: string;
	role: JianyingEffectStyleLayerRole;
	enabled: boolean;
	renderType: JianyingEffectStyleRenderType;
	texturePath?: string;
	source: Record<string, unknown>;
}

export interface JianyingEffectStyleTextureResource {
	relativePath: string;
	state: JianyingEffectStyleTextureState;
}

export interface JianyingEffectStyleManifest {
	schemaVersion: 1;
	resourceId: string;
	packageVersion: string;
	textable: boolean | null;
	fillKind: JianyingEffectStyleRenderType;
	strokeCount: number;
	innerShadowCount: number;
	shadowCount: number;
	textureLayerCount: number;
	gradientLayerCount: number;
	layers: JianyingEffectStyleLayer[];
	textures: JianyingEffectStyleTextureResource[];
	capabilities: JianyingTextEffectCapabilities;
	diagnostics: JianyingTextRuntimeDiagnostic[];
	fingerprint: string;
	source: Record<string, unknown>;
}

export interface JianyingEffectStyleInspection {
	state: "degraded" | "invalid" | "ready";
	canHydrate: boolean;
	manifest?: JianyingEffectStyleManifest;
	diagnostics: JianyingTextRuntimeDiagnostic[];
	fingerprint: string;
}
