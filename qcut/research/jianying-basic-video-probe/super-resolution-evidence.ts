export interface SuperResolutionEvidence {
	clientSymbols: string[];
	uploadEvidence: string[];
	localModelCandidates: string[];
	metadataEvidence: string[];
}

export interface SuperResolutionConclusion {
	validationLevel: "unavailable" | "discovered";
	locality: "local-provider-unresolved" | "local-candidate-unvalidated";
	detail: string;
}

export function classifySuperResolutionEvidence({
	evidence,
}: {
	evidence: SuperResolutionEvidence;
}): SuperResolutionConclusion {
	if (evidence.clientSymbols.length === 0) {
		return {
			validationLevel: "unavailable",
			locality: "local-provider-unresolved",
			detail: "No super-resolution client entry point was discovered.",
		};
	}
	if (
		evidence.localModelCandidates.length > 0 ||
		evidence.metadataEvidence.length > 0
	) {
		return {
			validationLevel: "discovered",
			locality: "local-candidate-unvalidated",
			detail:
				"A local candidate exists but no local inference ABI has been validated.",
		};
	}
	return {
		validationLevel: "discovered",
		locality: "local-provider-unresolved",
		detail:
			"The client exists, but no identifiable local model was found; upload transport evidence prevents a local claim.",
	};
}
