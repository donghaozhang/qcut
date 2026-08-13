export const JIANYING_TEXT_RUNTIME_INSPECT_CHANNEL =
	"jianying-text-runtime:inspect";
export const JIANYING_TEXT_RUNTIME_RENDER_CHANNEL =
	"jianying-text-runtime:render";
export const JIANYING_TEXT_RUNTIME_CANCEL_CHANNEL =
	"jianying-text-runtime:cancel";

export type JianyingTextRuntimePackageKind =
	| "InfoSticker"
	| "ScriptInfoSticker"
	| "TextStyle";

export type JianyingTextAnimationSlot = "entrance" | "exit" | "loop";

export interface JianyingTextAnimationReference {
	source: "jianying-cache";
	resourceId: string;
	packageHash: string;
	duration: number;
}

export type JianyingTextAnimationReferences = Partial<
	Record<JianyingTextAnimationSlot, JianyingTextAnimationReference>
>;

export interface JianyingTextRuntimeReference {
	schemaVersion: 1;
	source: "jianying-cache";
	packageKind: JianyingTextRuntimePackageKind;
	resourceId: string;
	packageHash: string;
	editMode: "runtime-with-preload-fallback";
	slotMapping: "line-to-widget";
	timeMapping: "stretch";
	templateDuration: number;
	animations?: JianyingTextAnimationReferences;
}

export type JianyingTextRuntimeState =
	| "ready"
	| "ready-degraded"
	| "unsupported-platform"
	| "bridge-missing"
	| "runtime-missing"
	| "package-missing"
	| "package-invalid"
	| "dependency-missing"
	| "error";

export type JianyingTextRuntimeDependencyRole =
	| "animation"
	| "effect-style"
	| "sticker";

export interface JianyingTextEffectCapabilities {
	staticTexture: boolean;
	multipleStrokes: boolean;
	animationComponents: boolean;
	scriptInfoSticker: boolean;
	shaderComponents: boolean;
	threeDimensional: boolean;
	feedbackComponents: boolean;
}

export type JianyingTextRuntimeDiagnosticCode =
	| "effect-style-config-invalid"
	| "effect-style-gradient-invalid"
	| "effect-style-layer-missing"
	| "effect-style-manifest-invalid"
	| "effect-style-manifest-missing"
	| "effect-style-package-missing"
	| "effect-style-render-type-unknown"
	| "effect-style-runtime-component"
	| "effect-style-texture-missing"
	| "effect-style-texture-outside-package"
	| "effect-style-texture-path-missing"
	| "font-asset-missing"
	| "font-file-missing"
	| "runtime-dependency-unresolved";

export interface JianyingTextRuntimeDiagnostic {
	code: JianyingTextRuntimeDiagnosticCode;
	severity: "error" | "warning";
	message: string;
	resourceId?: string;
	relativePath?: string;
	fontAssetId?: string;
}

export interface JianyingTextRuntimeStatus {
	state: JianyingTextRuntimeState;
	message: string;
	platform: string;
	bridgeReady: boolean;
	runtimeReady: boolean;
	packageReady: boolean;
	resourceId?: string;
	packageHash?: string;
	templateDuration?: number;
	capabilities?: JianyingTextEffectCapabilities;
	diagnostics?: JianyingTextRuntimeDiagnostic[];
	missingDependencies?: Array<{
		resourceId: string;
		role: JianyingTextRuntimeDependencyRole;
	}>;
	degradedDependencies?: Array<{
		resourceId: string;
		role: JianyingTextRuntimeDependencyRole;
	}>;
}

export interface JianyingTextRuntimeInspectRequest {
	reference?: JianyingTextRuntimeReference;
}

export interface JianyingTextRuntimeTransform {
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	opacity: number;
}

export interface JianyingTextRuntimeRenderRequest {
	requestId: string;
	reference: JianyingTextRuntimeReference;
	content: string;
	fontAssetId?: string;
	fontSize: number;
	canvasWidth: number;
	canvasHeight: number;
	transform: JianyingTextRuntimeTransform;
	sourceStart: number;
	elementDuration: number;
	frameCount: number;
	fps: number;
	previewVideo?: boolean;
}

export type JianyingTextRuntimeRenderStrategy =
	| "host-text"
	| "runtime-parameters"
	| "preload-copy";

export type JianyingTextRuntimeRenderSource =
	| { kind: "image"; path: string }
	| { kind: "image-sequence"; path: string; frameRate: number };

export interface JianyingTextRuntimeRenderResult {
	requestId: string;
	resourceId: string;
	packageHash: string;
	templateDuration: number;
	frameCount: number;
	strategy: JianyingTextRuntimeRenderStrategy;
	cacheHit: boolean;
	x: number;
	y: number;
	width: number;
	height: number;
	diagnostics?: JianyingTextRuntimeDiagnostic[];
	previewUrl?: string;
	source: JianyingTextRuntimeRenderSource;
}

export interface JianyingTextRuntimeCancelRequest {
	requestId: string;
}

export interface JianyingTextRuntimeAPI {
	inspect: (
		request?: JianyingTextRuntimeInspectRequest
	) => Promise<JianyingTextRuntimeStatus>;
	render: (
		request: JianyingTextRuntimeRenderRequest
	) => Promise<JianyingTextRuntimeRenderResult>;
	cancel: (request: JianyingTextRuntimeCancelRequest) => Promise<boolean>;
}
