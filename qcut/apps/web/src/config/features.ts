// Feature flags configuration for QCut
// Default all experimental features to false for safety

export const FEATURES = {
	VIDEO_EFFECTS: {
		enabled: true, // Enabled for testing
		name: "Video Effects System",
		description: "CSS filter-based video effects for timeline elements",
		experimental: true,
	},
	// Add other feature flags here following same pattern
} as const;

// Helper to check feature status
export const isFeatureEnabled = (feature: keyof typeof FEATURES): boolean => {
	// Check localStorage for override (for testing)
	if (typeof window !== "undefined") {
		const override = localStorage.getItem(`feature_${feature}`);
		if (override !== null) {
			return override === "true";
		}
	}

	return FEATURES[feature]?.enabled || false;
};

// Helper to toggle feature (for development)
export const toggleFeature = (
	feature: keyof typeof FEATURES,
	enabled: boolean
) => {
	if (typeof window !== "undefined") {
		localStorage.setItem(`feature_${feature}`, String(enabled));
		// Trigger reload for changes to take effect
		window.location.reload();
	}
};

// Helper to reset all features to defaults
export const resetFeatures = () => {
	if (typeof window !== "undefined") {
		Object.keys(FEATURES).forEach((feature) => {
			localStorage.removeItem(`feature_${feature}`);
		});
		window.location.reload();
	}
};

// Export feature status for use in components
export const EFFECTS_ENABLED = isFeatureEnabled("VIDEO_EFFECTS");

// Development helper to list all features
export const listFeatures = () => {
	console.log("=== QCut Feature Flags ===");
	Object.entries(FEATURES).forEach(([key, config]) => {
		const enabled = isFeatureEnabled(key as keyof typeof FEATURES);
		console.log(
			`${key}: ${enabled ? "✅ ENABLED" : "❌ DISABLED"} ${
				config.experimental ? "(experimental)" : ""
			}`
		);
		console.log(`  ${config.description}`);
	});
};

// Auto-expose feature controls in development
if (import.meta.env.DEV) {
	if (typeof window !== "undefined") {
		(window as any).qcutFeatures = {
			list: listFeatures,
			toggle: toggleFeature,
			reset: resetFeatures,
			isEnabled: isFeatureEnabled,
		};
		console.log(
			"Feature flags available via window.qcutFeatures. Run window.qcutFeatures.list() to see all features."
		);
	}
}
