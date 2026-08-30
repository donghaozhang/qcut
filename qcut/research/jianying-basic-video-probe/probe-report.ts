import type { CapabilityArtifact, LocalVideoCapability } from "./capabilities";

export interface ArtifactProbeResult extends CapabilityArtifact {
	absolutePath: string;
	exists: boolean;
}

export interface SymbolProbeResult {
	library: string;
	demangledName: string;
	found: boolean;
}

export interface NativeProbeResult {
	attempted: boolean;
	status:
		| "not-attempted"
		| "failed"
		| "constructed"
		| "model-loaded"
		| "processed";
	detail: string;
}

export interface CapabilityProbeResult {
	id: LocalVideoCapability["id"];
	localizedName: string;
	locality: LocalVideoCapability["locality"];
	level:
		| "unavailable"
		| "discovered"
		| "runtime-callable"
		| "model-loaded"
		| "input-processed";
	artifacts: ArtifactProbeResult[];
	symbols: SymbolProbeResult[];
	native: NativeProbeResult;
	boundary: string;
}

function hasRequiredArtifacts({
	artifacts,
}: {
	artifacts: ArtifactProbeResult[];
}): boolean {
	return artifacts.every(({ exists, required }) => exists || !required);
}

function hasRequiredSymbols({
	symbols,
}: {
	symbols: SymbolProbeResult[];
}): boolean {
	return symbols.every(({ found }) => found);
}

export function classifyProbeLevel({
	artifacts,
	symbols,
	native,
}: {
	artifacts: ArtifactProbeResult[];
	symbols: SymbolProbeResult[];
	native: NativeProbeResult;
}): CapabilityProbeResult["level"] {
	if (
		!hasRequiredArtifacts({ artifacts }) ||
		!hasRequiredSymbols({ symbols })
	) {
		return "unavailable";
	}
	if (native.status === "processed") return "input-processed";
	if (native.status === "model-loaded") return "model-loaded";
	if (native.status === "constructed") return "runtime-callable";
	return "discovered";
}

export function buildCapabilityProbeResult({
	capability,
	artifacts,
	symbols,
	native,
}: {
	capability: LocalVideoCapability;
	artifacts: ArtifactProbeResult[];
	symbols: SymbolProbeResult[];
	native: NativeProbeResult;
}): CapabilityProbeResult {
	return {
		id: capability.id,
		localizedName: capability.localizedName,
		locality: capability.locality,
		level: classifyProbeLevel({ artifacts, symbols, native }),
		artifacts,
		symbols,
		native,
		boundary: capability.boundary,
	};
}
