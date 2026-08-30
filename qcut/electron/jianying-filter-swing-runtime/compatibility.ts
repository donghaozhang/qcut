export interface JianyingFilterSwingCompatibilityFallback {
	mode: "passthrough";
	reason: "missing-structxt-creator";
}

interface JianyingFilterSwingCompatibilityProfile {
	version: string;
	fallback: JianyingFilterSwingCompatibilityFallback;
}

const COMPATIBILITY_PROFILES: Readonly<
	Record<string, JianyingFilterSwingCompatibilityProfile>
> = {
	"7495673180904885516": {
		version: "c88f3eddf7620d4e0644075efcafd101",
		// The private runtime cannot create structxt type 183. Its partial graph
		// is measurably farther from Jianying UI than preserving the source frame.
		fallback: {
			mode: "passthrough",
			reason: "missing-structxt-creator",
		},
	},
};

export function resolveJianyingFilterSwingCompatibility({
	resourceId,
	version,
}: {
	resourceId: string;
	version: string;
}): JianyingFilterSwingCompatibilityFallback | null {
	const profile = COMPATIBILITY_PROFILES[resourceId];
	return profile?.version === version ? profile.fallback : null;
}
