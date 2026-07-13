// Feature flags system for migration
// Use import.meta.env for Vite (process.env doesn't work in browser)

const electronApiFlag = import.meta.env.VITE_USE_ELECTRON_API;

const baseFlags = {
	USE_ELECTRON_API:
		electronApiFlag === undefined
			? import.meta.env.VITE_BUILD_TARGET !== "web"
			: electronApiFlag === "true",
	USE_NEXTJS_ROUTING: import.meta.env.VITE_USE_NEXTJS_ROUTING === "true",
} as const;

// Runtime overrides for testing
let runtimeOverrides: Partial<typeof baseFlags> = {};

export function setRuntimeFlags(flags: Partial<typeof baseFlags>) {
	runtimeOverrides = flags;
}

export function isFeatureEnabled(feature: keyof typeof baseFlags): boolean {
	// Runtime overrides take precedence
	if (feature in runtimeOverrides) {
		return runtimeOverrides[feature] ?? false;
	}
	return baseFlags[feature] ?? false;
}

export function getCurrentFlags() {
	return {
		...baseFlags,
		...runtimeOverrides,
	};
}
